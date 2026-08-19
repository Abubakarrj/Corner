import { DELIVERY_RADIUS_MILES } from "../../(marketing)/locations/locations";
import { deliveryArea } from "../../deliveryArea";
import { geocode } from "../../googleMaps";
import { deliveryOrigin, deliveryReach } from "../../storePlaces";
import { recordMiss } from "../../demand";

// The boundary of where we deliver, for the map that draws it.
//
// Public, deliberately. It is the same fact as the sentence on the delivery
// page and the same rule /api/delivery/quote applies — a coverage area is
// something a shop publishes, not something it protects.
//
// Two shapes, and the difference matters the same way it does for the kitchen
// queue: a measured boundary, or an honest admission that there isn't one to
// give. There is no third answer where a circle stands in, because a circle
// drawn at ten straight-line miles claims addresses the checkout refuses.

export const dynamic = "force-dynamic";

export async function GET() {
  const area = await deliveryArea();
  if (!area) return Response.json({ known: false });

  return Response.json(
    { known: true, ...area },
    {
      // A day at the edge, matching the measurement's own cache. The shape is
      // seven Routes calls to produce and changes when the radius does, which
      // is a decision somebody makes rather than something that drifts.
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    },
  );
}

// "Do you deliver to me?", answered without starting an order.
//
// ——— Why this is not /api/delivery/quote ———
//
// That endpoint answers the same question better: it asks Uber for a real
// price for a real job. It also *costs* a real Uber quote, and this one is
// reachable by anybody typing an address on a public page out of curiosity.
// Paying a courier network per idle question is a bill that scales with
// browsing rather than with ordering.
//
// So this runs the cheap half — geocode, then road distance against the same
// constant — which is exactly the first filter the quote endpoint applies
// before it calls Uber at all. An address this rejects is an address the
// checkout was going to reject. An address this accepts still gets a live
// quote at checkout, and Uber can still decline the specific job.
//
// Its own answer rather than a point-in-polygon test in the browser, because
// the drawn boundary is deliberately conservative: it rounds inward by up to
// a step, and testing against it would turn away addresses that are in fact
// inside the rule.
const MAX_ADDRESS = 300;

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "api.badRequest" }, { status: 400 });
  }

  const address = (payload as { address?: unknown })?.address;
  if (typeof address !== "string" || !address.trim() || address.length > MAX_ADDRESS) {
    return Response.json({ error: "api.badRequest" }, { status: 400 });
  }

  // Biasing the geocode, not measuring with it. "2528 Figueroa" typed with no
  // city has to land in Los Angeles, and any of our own counters is a good
  // enough hint for that.
  const place = await geocode(address.trim(), await deliveryOrigin());
  if (!place) return Response.json({ error: "api.addressNotFound" }, { status: 404 });

  // ——— Measured against every counter, and the nearest one wins ———
  //
  // This asked one shop, and that was the same fact as the rule while there
  // was one shop delivering. It stopped being the same fact the day a second
  // counter opened somewhere else, and it fails in the direction that costs
  // the most: an address two miles from a counter, told we do not deliver
  // there because a different counter is eleven miles away. The checkout would
  // have taken that order — /api/delivery/quote measures from the kitchen the
  // order actually leaves from — so this page was turning away customers the
  // shop can serve, and turning them away with a number.
  //
  // One Route Matrix call for all of them, so asking three counters costs
  // what asking one did. See deliveryReach in storePlaces.ts, which is the one
  // place this rule is written down.
  const drive = await deliveryReach([place.lat, place.lng]);
  const miles = drive?.miles ?? null;
  // No road answer, no verdict. Guessing "yes" invites an order that fails at
  // checkout; guessing "no" turns away a customer we can serve. The page says
  // it could not tell and points at the checkout, which asks Uber directly.
  if (miles === null) return Response.json({ known: false, address: place.address });

  // Somebody asking whether we come to them, and being told no. Weaker
  // evidence than a refused checkout and much more of it — the source is
  // recorded alongside the count so the two are never added up as equals.
  if (miles > DELIVERY_RADIUS_MILES) {
    await recordMiss([place.lat, place.lng], miles, "area");
  }

  return Response.json({
    known: true,
    inRange: miles <= DELIVERY_RADIUS_MILES,
    miles: Number(miles.toFixed(1)),
    address: place.address,
    location: [place.lat, place.lng],
    radiusMiles: DELIVERY_RADIUS_MILES,
  });
}
