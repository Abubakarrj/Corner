import "server-only";

import { driveMatrixMin } from "./googleMaps";
import { deliveryOrigins } from "./storePlaces";
import {
  DELIVERY_RADIUS_MILES,
  milesBetween,
} from "./(marketing)/locations/locations";

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
// ——— Why the radius is measured from every counter, not one ———
//
// The rule is ten road miles from the counter an order leaves from, and there
// is more than one counter. So the area the shop actually serves is the union
// of a ten-mile reach around each of them, and a contour drawn from one shop
// is not a conservative version of that — it is a different shape that leaves
// out a neighbourhood with a counter in it.
//
// Drawn as one ring rather than as one ring per shop, and the trick that
// allows it is where the search starts: from the centroid of the counters
// rather than from any one of them, asking at each probe how far the *nearest*
// counter is. Route Matrix answers all the counters in the same call it was
// already making, so the union costs what one shop cost. No polygon clipping,
// no overlapping translucent blobs on the map, and a fourth counter changes
// the shape without changing a line of this.
//
// The assumption it inherits is the one the single-shop version already made:
// that along a ray outward, once you are out of range you stay out. That is
// not a theorem — an arterial road can reach further than the streets either
// side of it — and it was the shape of the answer before this change too.
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
  /** The counters it is measured from — every one a delivery can leave from.
   *  Plural because the radius is a reach around each of them, and the map
   *  pins them all: a shape with one pin in the corner of it reads as one shop
   *  with a very long arm, which is not what the shop is offering. */
  origins: [number, number][];
  /** Where the rays were cast from, which is the middle of the counters and
   *  not a place. Carried so the map can centre on it without picking a shop. */
  centre: [number, number];
  /** The rule it draws, so the page can say the number rather than hardcode it. */
  radiusMiles: number;
};

async function measure(): Promise<DeliveryArea | null> {
  // Every counter a delivery can leave from, at its resolved address rather
  // than the coordinates typed beside it — the same points the courier is
  // actually sent to. See storePlaces.ts.
  const origins = await deliveryOrigins();
  if (origins.length === 0) return null;

  // The centre the rays go out from. Not a counter: a point that has all of
  // them around it, so a ray in any direction crosses the boundary once
  // rather than clipping one shop's circle and missing another's.
  const centre: [number, number] = [
    origins.reduce((sum, [lat]) => sum + lat, 0) / origins.length,
    origins.reduce((sum, [, lng]) => sum + lng, 0) / origins.length,
  ];

  // Straight-line bounds for the search. The lower bound is zero. The upper
  // bound is the radius plus the furthest a counter sits from the centre, and
  // it is safe for the same reason the single-shop version's was: a road route
  // is never shorter than the straight line, so a point within N road miles of
  // some counter is within N straight-line miles of it, and therefore within
  // N + that counter's offset of the centre. The answer is always inside this
  // interval.
  const spread = origins.reduce(
    (furthest, point) => Math.max(furthest, milesBetween(centre, point)),
    0,
  );
  const low = new Array<number>(BEARINGS).fill(0);
  const high = new Array<number>(BEARINGS).fill(DELIVERY_RADIUS_MILES + spread);

  for (let step = 0; step < STEPS; step += 1) {
    const mids = low.map((lo, i) => (lo + high[i]) / 2);
    const probes = mids.map((miles, i) => project(centre, (i * 360) / BEARINGS, miles));

    // How far the *nearest* counter is, for each probe, in one call.
    const measured = await driveMatrixMin(origins, probes);
    // One failed call and the whole shape is a guess. Better to have no map
    // than a boundary drawn half from measurement and half from an interval
    // that never got narrowed.
    if (!measured) return null;

    for (let i = 0; i < BEARINGS; i += 1) {
      const miles = measured[i]?.miles ?? null;
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
    ring: low.map((miles, i) => project(centre, (i * 360) / BEARINGS, miles)),
    origins,
    centre,
    radiusMiles: DELIVERY_RADIUS_MILES,
  };
}

// ——— The cache ———
//
// A day, because the road network does not move and the rule moves less. The
// in-flight promise is shared as well as the result: without that, the first
// two visitors after a deploy each start their own seven-call measurement.
//
// Still seven calls with three counters, not twenty-one: the counters ride in
// as extra origins on the calls the contour was already making.
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
