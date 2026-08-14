import "server-only";

import { driveMatrixMiles } from "./googleMaps";
import { deliveryOrigin } from "./storePlaces";
import { DELIVERY_RADIUS_MILES } from "./(marketing)/locations/locations";

// The shape of where we deliver, drawn from the rule that decides it.
//
// ——— Why not a circle ———
//
// The rule is DELIVERY_RADIUS_MILES *driving* miles. A circle is straight-line
// miles, and in Los Angeles those two disagree by a lot and not evenly: ten
// road miles east along Wilshire is a different distance from ten road miles
// over the hills, and a circle drawn at ten claims both. Published, it would
// promise delivery to addresses the checkout then refuses — the one failure a
// coverage map cannot have, because somebody reads it, fills a basket, and
// finds out at the end.
//
// So the boundary is measured with the same API the checkout measures with.
// Along each of BEARINGS directions, binary-search outward for the point whose
// *road* distance is the radius. The result is a polygon every vertex of which
// is a real address-sized point that a real quote would accept.
//
// ——— Why it is affordable ———
//
// Naively this is BEARINGS × STEPS route requests. Route Matrix turns each
// step into one call for every bearing at once, so it is STEPS calls total —
// seven — for a shape that is then cached for a day. Roughly three hundred
// matrix elements per rebuild.
//
// ——— What it is not ———
//
// Not a guarantee. Uber can still refuse a specific job, the checkout still
// asks for a live quote, and this file never decides whether an order is
// accepted — app/api/delivery/quote does, from the same constant. This draws
// the rule; it does not enforce it, and the two cannot disagree because
// neither one is a copy of the other.

// How many directions the boundary is sampled in. Forty-eight is a point
// every 7.5°, which at ten miles is a vertex about every 1.3 miles of
// circumference — fine enough that the polygon reads as a shape rather than
// as a polygon, and coarse enough to stay one matrix call per step.
const BEARINGS = 48;

// Binary-search steps. Each halves the interval, so seven takes a ten-mile
// span to about 250 feet — well inside the error of the thing being drawn.
const STEPS = 7;

const EARTH_MILES = 3958.8;

/** Where you land going `miles` along `bearing` from a point. Great-circle,
 *  because over ten miles the flat approximation is off by enough to see at
 *  the zoom this is drawn at. */
function project(
  [lat, lng]: [number, number],
  bearingDegrees: number,
  miles: number,
): [number, number] {
  const d = miles / EARTH_MILES;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );

  return [(lat2 * 180) / Math.PI, (lng2 * 180) / Math.PI];
}

export type DeliveryArea = {
  /** The boundary, as [lat, lng] pairs, closed by the consumer. */
  ring: [number, number][];
  /** Where it is measured from. */
  origin: [number, number];
  /** The rule it draws, so the page can say the number rather than hardcode it. */
  radiusMiles: number;
};

async function measure(): Promise<DeliveryArea | null> {
  const origin = await deliveryOrigin();

  // Straight-line bounds for the search. The lower bound is zero and the
  // upper bound is the radius itself, which is safe in a way worth stating:
  // a road route is never shorter than the straight line, so the point at N
  // road miles is never more than N straight-line miles out. The answer is
  // always inside this interval.
  const low = new Array<number>(BEARINGS).fill(0);
  const high = new Array<number>(BEARINGS).fill(DELIVERY_RADIUS_MILES);

  for (let step = 0; step < STEPS; step += 1) {
    const mids = low.map((lo, i) => (lo + high[i]) / 2);
    const probes = mids.map((miles, i) => project(origin, (i * 360) / BEARINGS, miles));

    const measured = await driveMatrixMiles(origin, probes);
    // One failed call and the whole shape is a guess. Better to have no map
    // than a boundary drawn half from measurement and half from an interval
    // that never got narrowed.
    if (!measured) return null;

    for (let i = 0; i < BEARINGS; i += 1) {
      const miles = measured[i];
      // Unreachable counts as too far. That is what pulls the western edge
      // off the water: no road route to a point in the Pacific, so the
      // search stops reaching for it.
      if (miles === null || miles > DELIVERY_RADIUS_MILES) high[i] = mids[i];
      else low[i] = mids[i];
    }
  }

  // `low` is the last distance known to be inside the rule, so the polygon is
  // conservative by up to one final step. Deliberate: on a map that says
  // where we deliver, erring inward means the edge cases are people we do
  // serve being told to check, rather than people we do not being told we do.
  return {
    ring: low.map((miles, i) => project(origin, (i * 360) / BEARINGS, miles)),
    origin,
    radiusMiles: DELIVERY_RADIUS_MILES,
  };
}

// ——— The cache ———
//
// A day, because the road network does not move and the rule moves less. The
// in-flight promise is shared as well as the result: without that, the first
// two visitors after a deploy each start their own seven-call measurement.
const TTL_MS = 24 * 60 * 60 * 1000;

let cached: { at: number; area: DeliveryArea } | null = null;
let inFlight: Promise<DeliveryArea | null> | null = null;

/** The delivery boundary, measured or remembered. Null when Routes could not
 *  answer — the page renders the shop and the address check without a shaded
 *  area, rather than a shape nobody measured. */
export async function deliveryArea(): Promise<DeliveryArea | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.area;
  inFlight ??= measure()
    .catch(() => null)
    .then((area) => {
      if (area) cached = { at: Date.now(), area };
      inFlight = null;
      return area;
    });
  // A failed measurement is not cached. It is seven API calls once a day at
  // worst, and the alternative is a map that stays blank for twenty-four
  // hours because Google had a bad minute.
  return inFlight;
}

/** Test seam. Nothing in the app calls this. */
export function __resetDeliveryArea(): void {
  cached = null;
  inFlight = null;
}
