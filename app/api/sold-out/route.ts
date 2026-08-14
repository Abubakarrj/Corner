import { getProduct } from "../../shop/products";
import { markAvailable, markSoldOut, soldOutNow } from "../../soldOut";
import { isDatabaseConfigured } from "../../db";
import { clientIp, throttle } from "../../rateLimit";
import { createHash, timingSafeEqual } from "node:crypto";

// What is off the board, read by the app and written by the kitchen.
//
// GET is public and returns slugs. That is not a secret: it is the same thing
// the catalog shows on every tile, and the browser needs it because soldOut()
// is a synchronous call made during render on both sides of the wire.
//
// POST takes an item off the board or puts it back.
//
// ——— How POST is guarded, and what that is worth ———
//
// A bearer token from KITCHEN_TOKEN, compared in full. When the variable is
// unset the endpoint refuses every write, so a deployment that has not thought
// about this has no open door rather than a quietly writable menu.
//
// A shared token is not a login. It cannot tell you who marked the donuts off,
// it is the same for everyone holding the tablet, and rotating it means
// telling the shop a new number. It is here because the alternative on offer
// today was nothing: this app has no staff session to hang a real permission
// on, and inventing one for this endpoint would be a worse thing to get wrong
// than a token in an environment variable. When staff accounts exist, this
// check is the line to replace.
//
// The blast radius is bounded by what the endpoint can do, which is set a flag
// on a catalog slug. Nothing here reads an order, moves money, or names a
// customer. The worst a leaked token buys is a shop that looks sold out.

export const dynamic = "force-dynamic";

// A tablet on a counter marks a handful of things off across a morning. Twenty
// an hour is a busy day of that and nowhere near a script.
const WRITES = throttle({ windowMs: 60 * 60_000, max: 20 });

export async function GET() {
  const slugs = await soldOutNow();
  return Response.json(
    { slugs },
    {
      headers: {
        // Matched to the server's own TTL in app/soldOut.ts. A tile that is
        // half a minute behind is fine; /api/shop-order re-reads and refuses
        // on the way through, which is the check that actually matters.
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      },
    },
  );
}

// Compared through a hash, not with ===.
//
// `a === b` on strings returns as soon as two characters differ, so how long
// it takes is a function of how much of the token was right. That is a real
// side channel and the standard answer is a constant-time compare. Hashing
// both sides first is what makes that usable here: timingSafeEqual throws on
// buffers of different lengths, so comparing the raw tokens would either crash
// on a short guess or leak the length in the length check. Two SHA-256 digests
// are always 32 bytes, whatever went in.
function sameToken(offered: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(offered), digest(expected));
}

function authorized(request: Request): boolean {
  const expected = process.env.KITCHEN_TOKEN?.trim();
  if (!expected) return false;
  const header = request.headers.get("authorization")?.trim() ?? "";
  const offered = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  return offered.length > 0 && sameToken(offered, expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    // The same answer whether the token is wrong or the feature is switched
    // off. Distinguishing them tells an unauthenticated caller which of the
    // two to keep trying.
    return Response.json({ error: "api.unknownRequest" }, { status: 404 });
  }
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "api.soldOutNoStore" }, { status: 503 });
  }
  if (WRITES.exceeded(clientIp(request))) {
    return Response.json({ error: "api.tooManyAttempts" }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "api.badJson" }, { status: 400 });
  }

  const { slug, soldOut: gone, until } = (payload ?? {}) as {
    slug?: unknown;
    soldOut?: unknown;
    until?: unknown;
  };

  if (typeof slug !== "string" || !getProduct(slug)) {
    return Response.json({ error: "api.unknownRequest" }, { status: 400 });
  }
  if (typeof gone !== "boolean") {
    return Response.json({ error: "api.unknownRequest" }, { status: 400 });
  }

  try {
    if (!gone) {
      await markAvailable(slug);
    } else {
      // An expiry is optional and, when given, has to be a real future time.
      // A malformed date silently becoming "back immediately" would put an
      // item the kitchen has run out of straight back on the board.
      const back = typeof until === "string" ? new Date(until) : null;
      const valid = back && !Number.isNaN(back.getTime()) && back.getTime() > Date.now();
      await markSoldOut(slug, valid ? back : undefined);
    }
  } catch (error) {
    console.error("[sold-out] write failed", error);
    return Response.json({ error: "api.couldNotSave" }, { status: 502 });
  }

  return Response.json({ slugs: await soldOutNow() });
}
