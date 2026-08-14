import { DELIVERY_RADIUS_MILES } from "../../(marketing)/locations/locations";
import { deliveryArea } from "../../deliveryArea";
import { driveBetween, geocode } from "../../googleMaps";
import { deliveryOrigin } from "../../storePlaces";

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

  const origin = await deliveryOrigin();
  const place = await geocode(address.trim(), origin);
  if (!place) return Response.json({ error: "api.addressNotFound" }, { status: 404 });

  const drive = await driveBetween(origin, [place.lat, place.lng]);
  // No road answer, no verdict. Guessing "yes" invites an order that fails at
  // checkout; guessing "no" turns away a customer we can serve. The page says
  // it could not tell and points at the checkout, which asks Uber directly.
  if (!drive) return Response.json({ known: false, address: place.address });

  return Response.json({
    known: true,
    inRange: drive.miles <= DELIVERY_RADIUS_MILES,
    miles: Number(drive.miles.toFixed(1)),
    address: place.address,
    location: [place.lat, place.lng],
    radiusMiles: DELIVERY_RADIUS_MILES,
  });
}
