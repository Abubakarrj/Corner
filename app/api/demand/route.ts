import { createHash, timingSafeEqual } from "node:crypto";
import { DELIVERY_RADIUS_MILES } from "../../(marketing)/locations/locations";
import { KEEP_DAYS, MIN_CELL, demandMap } from "../../demandMisses";

// Where people wanted delivery and could not have it, for whoever is deciding
// where to open next.
//
// ——— Gated, unlike the delivery area ———
//
// /api/delivery-area is public because a coverage map is something a shop
// publishes. This is the opposite: it is the shop's own read on where its
// customers are being turned away, and it is worth money to a competitor
// choosing their next site. It is also, however carefully aggregated, a map of
// where people live who wanted something.
//
// So it is behind the same shared token the kitchen board uses. That is not a
// login and does not pretend to be — see the note in /api/sold-out — but a
// token in an environment variable is the honest ceiling for an app with no
// staff session, and the read is harmless enough that a stronger one would be
// theatre.
//
// ——— What comes back ———
//
// Cells of about a kilometre, each with a count, the average distance those
// refusals were outside the radius, and a split by where the refusal happened.
// Cells below MIN_CELL are not returned at all: see the note on that constant.
// A cell that is nine miles out is a different proposition from one that is
// half a mile out, which is why the distance rides along.

export const dynamic = "force-dynamic";

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

export async function GET(request: Request) {
  // The same answer whether the token is wrong or the feature is switched off,
  // for the same reason /api/sold-out gives it: telling an unauthenticated
  // caller which of the two it is tells them which to keep trying.
  if (!authorized(request)) {
    return Response.json({ error: "api.unknownRequest" }, { status: 404 });
  }

  const asked = Number(new URL(request.url).searchParams.get("days") ?? "42");
  const days = Number.isFinite(asked) ? asked : 42;

  const cells = await demandMap(days);
  // Null is "there is no store", which is not the same as "nobody was turned
  // away" and must not be drawn as an empty city.
  if (cells === null) {
    return Response.json({ known: false, reason: "no-store" }, { status: 503 });
  }

  return Response.json(
    {
      known: true,
      cells,
      // What the numbers mean, so a spreadsheet made from this a year from now
      // still says what it is measuring.
      radiusMiles: DELIVERY_RADIUS_MILES,
      cellMiss: MIN_CELL,
      keptDays: KEEP_DAYS,
      days: Math.max(1, Math.min(KEEP_DAYS, Math.round(days))),
      total: cells.reduce((sum, cell) => sum + cell.misses, 0),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
