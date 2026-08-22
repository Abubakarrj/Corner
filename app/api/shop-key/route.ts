import { cookies } from "next/headers";
import {
  KEEPER_COOKIE,
  KEEPER_MAX_AGE,
  mintKeeper,
  shopKeyMatches,
} from "../../shopKeeper";
import { clientIp, throttle } from "../../rateLimit";

// The shop, signing in on its own wall.
//
// One key in, one short cookie out. See app/shopKeeper.ts for why the cookie is
// an HMAC over an expiry rather than the key itself, and for what this unlocks
// — which is one thing: taking a note off Corner Notes.
//
// ——— ⚠️ The only endpoint here that a stranger can guess at ———
//
// Everything else the shop's key opens is a bearer header on a cron URL. This
// one takes a key typed into a form on a public site, which means it is the one
// place somebody can sit and try keys. So:
//
//   · ten tries an hour per address, and the limit answers before the compare
//     so a rate-limited guess costs nothing to check;
//   · the compare is constant-time on two digests, in shopKeeper.ts;
//   · and the answer is the same for a wrong key and for a deploy that has no
//     KITCHEN_TOKEN set at all. Distinguishing them tells somebody whether
//     there is a key here worth guessing.
//
// ⚠️ Ten rather than the twenty on the unpin route, and the difference is
// deliberate: twenty there protects a 256-bit token that guessing cannot reach
// anyway. This one protects whatever string a person chose, which is the part
// of the system a limit is actually load-bearing for.
const attempts = throttle({ windowMs: 60 * 60 * 1000, max: 10 });

export const dynamic = "force-dynamic";

/** ⚠️ httpOnly, so the page cannot read it. Nothing in the browser needs to:
 *  whether the shop is signed in is decided on the server while rendering, and
 *  a value JavaScript can read is a value an injected script can post
 *  somewhere. sameSite lax so following a link into the wall keeps it. */
function jar(value: string, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // ⚠️ Off in development, where there is no TLS and a Secure cookie is
    // simply never sent — which looks exactly like a key that does not work.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "api.badJson" }, { status: 400 });
  }
  const body = payload as Record<string, unknown> | null;

  // Signing out needs no key and no limit: it only ever removes something.
  if (body?.out === true) {
    (await cookies()).set(KEEPER_COOKIE, "", jar("", 0));
    return Response.json({ ok: true });
  }

  if (attempts.exceeded(clientIp(request))) {
    return Response.json({ error: "notes.tooMany" }, { status: 429 });
  }

  if (!shopKeyMatches(body?.key)) {
    // ⚠️ 200 and `{ ok: false }`, not 401. The status code is a message too,
    // and this route answers identically for a wrong key and for a deploy with
    // no key set — the same reasoning as app/api/corner-notes/unpin and
    // app/api/auth/start. There is nothing to learn here by trying.
    return Response.json({ ok: false });
  }

  const minted = mintKeeper();
  // Belt and braces: shopKeyMatches is false without a key, so this cannot be
  // null here. If it ever is, the answer is no cookie rather than a cookie
  // signed with nothing.
  if (!minted) return Response.json({ ok: false });

  (await cookies()).set(KEEPER_COOKIE, minted, jar(minted, KEEPER_MAX_AGE));
  return Response.json({ ok: true });
}
