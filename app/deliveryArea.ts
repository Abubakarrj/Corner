import "server-only";

import { driveMatrixMin } from "./googleMaps";
import { deliveryOrigins } from "./storePlaces";
import {
  DELIVERY_RADIUS_MILES,
  deliveringStores,
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
// nine — for a shape that is then cached until the counter list changes or an
// hour passes. Roughly two thousand matrix elements per rebuild, which is a
// function of how many counters there are as well as how many bearings.
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

// Binary-search steps. Each halves the interval.
//
// ——— ⚠️ Nine, and it was seven ———
//
// Seven was chosen when the search span was ten miles, which halved down to
// about 250 feet. The span is not ten miles any more: it is the radius plus how
// far the furthest counter sits from the centre, and that second term grows
// every time the shop opens somewhere new. With a counter in Pasadena the
// spread is ten miles on its own, so the span is twenty and seven steps land at
// 831 feet — a boundary drawn to a sixth of the precision the comment claimed,
// on a map that says where the shop delivers.
//
// Nine steps take that same twenty-mile span back to about 210 feet, which is
// where this started. The cost is two more Route Matrix calls per rebuild, and
// a rebuild happens at most once an hour.
//
// ⚠️ This is the number to revisit when a counter opens far from the rest.
// Precision here is a function of how spread out the shop is, and nothing warns
// you: the polygon still draws, it just draws less carefully.
//
// Exported for the suite, which asserts one Route Matrix call per step. That
// assertion was written as `=== 7` and broke when this became 9 — a test of a
// constant rather than of the claim. It reads the constant now.
export const STEPS = 9;

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
  /** The boundaries, each a closed loop of [lat, lng] pairs.
   *
   *  ——— ⚠️ Plural, and it was one ———
   *
   *  A single ring can only describe one connected patch, and the shop stopped
   *  being one connected patch when it opened in Fullerton — twenty-three miles
   *  from the nearest other counter, which is more than twice the radius. Their
   *  reaches do not touch, so what the shop serves is two areas with a gap in
   *  between, and a polygon has no way to say "not here".
   *
   *  ⚠️ Drawn as one ring it did not merely look wrong, it over-claimed:
   *  measured, the ring covered points around Pico Rivera that are eleven miles
   *  from any counter. That is the exact failure the note at the top of this
   *  file says a coverage map cannot have — somebody reads it, fills a basket,
   *  and finds out at the checkout. */
  rings: [number, number][][];
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

/** Counters grouped into patches whose reaches touch.
 *
 *  ——— ⚠️ Why a ray search needs this ———
 *
 *  The search assumes that going outward from a centre you cross the boundary
 *  once. That holds while every counter's reach overlaps its neighbour's: the
 *  patch is one blob and a ray leaves it exactly once. It fails the moment two
 *  counters are further apart than twice the radius, because then a ray can
 *  leave one reach, cross open country nobody serves, and enter another — and
 *  a single ring has no way to describe the middle.
 *
 *  Two counters are put in the same patch when the straight line between them
 *  is under twice the radius, which is the condition for their discs to touch
 *  at all. Straight line rather than road, deliberately: a road is never
 *  shorter, so counters this test separates are certainly separate. The error
 *  it can make runs the other way — two counters near in a line and far by
 *  road, in the hills, would be grouped when their reaches do not quite meet.
 *  That draws a slightly generous waist between two lobes rather than a whole
 *  county nobody serves, and the sweep in tests/deliveryArea.test.ts is what
 *  would catch it. */
function patches(points: [number, number][]): [number, number][][] {
  const touching = 2 * DELIVERY_RADIUS_MILES;
  const taken = points.map(() => false);
  const groups: [number, number][][] = [];

  for (let seed = 0; seed < points.length; seed += 1) {
    if (taken[seed]) continue;
    taken[seed] = true;
    const group = [seed];
    // Grows while it finds neighbours, so a chain of counters each within
    // reach of the next is one patch however long the chain is.
    for (let at = 0; at < group.length; at += 1) {
      for (let other = 0; other < points.length; other += 1) {
        if (taken[other]) continue;
        if (milesBetween(points[group[at]], points[other]) < touching) {
          taken[other] = true;
          group.push(other);
        }
      }
    }
    groups.push(group.map((index) => points[index]));
  }
  return groups;
}

async function measure(): Promise<DeliveryArea | null> {
  // Every counter a delivery can leave from, at its resolved address rather
  // than the coordinates typed beside it — the same points the courier is
  // actually sent to. See storePlaces.ts.
  const origins = await deliveryOrigins();
  if (origins.length === 0) return null;

  // One search per patch, all of them advanced together so a step is still a
  // single Route Matrix call however many patches there are. See patches().
  const groups = patches(origins);
  const searches = groups.map((group) => {
    // The centre this patch's rays go out from. Not a counter: a point that
    // has all of the patch around it, so a ray in any direction crosses the
    // boundary once rather than clipping one shop's circle and missing
    // another's.
    const centre: [number, number] = [
      group.reduce((sum, [lat]) => sum + lat, 0) / group.length,
      group.reduce((sum, [, lng]) => sum + lng, 0) / group.length,
    ];
    // Straight-line bounds. The lower bound is zero. The upper bound is the
    // radius plus the furthest counter in this patch from its centre, and it
    // is safe because a road route is never shorter than the straight line: a
    // point within N road miles of some counter is within N straight-line
    // miles of it, and therefore within N + that counter's offset of the
    // centre. The answer is always inside this interval.
    const spread = group.reduce(
      (furthest, point) => Math.max(furthest, milesBetween(centre, point)),
      0,
    );
    return {
      centre,
      low: new Array<number>(BEARINGS).fill(0),
      high: new Array<number>(BEARINGS).fill(DELIVERY_RADIUS_MILES + spread),
    };
  });

  for (let step = 0; step < STEPS; step += 1) {
    // Every patch's probes in one list, so the whole rebuild is STEPS calls
    // rather than STEPS per patch.
    const probes: [number, number][] = [];
    for (const search of searches) {
      for (let i = 0; i < BEARINGS; i += 1) {
        probes.push(project(search.centre, (i * 360) / BEARINGS, (search.low[i] + search.high[i]) / 2));
      }
    }

    // ⚠️ Asked against *every* counter, not only the patch's own. The patches
    // are meant to be far enough apart that it makes no difference, and asking
    // globally means a mistake in the grouping can only change the shape, never
    // the distances behind it. It costs elements in a call already being made.
    const measured = await driveMatrixMin(origins, probes);
    // One failed call and the whole shape is a guess. Better to have no map
    // than a boundary drawn half from measurement and half from an interval
    // that never got narrowed.
    if (!measured) return null;

    searches.forEach((search, patch) => {
      for (let i = 0; i < BEARINGS; i += 1) {
        const mid = (search.low[i] + search.high[i]) / 2;
        const miles = measured[patch * BEARINGS + i]?.miles ?? null;
        // Unreachable counts as too far. That is what pulls the western edge
        // off the water: no road route to a point in the Pacific, so the
        // search stops reaching for it.
        if (miles === null || miles > DELIVERY_RADIUS_MILES) search.high[i] = mid;
        else search.low[i] = mid;
      }
    });
  }

  // ——— ⚠️ Pulled in, because a vertex being inside is not the polygon being
  //     inside ———
  //
  // `low` is the last distance known to obey the rule, so every vertex sits
  // inside the boundary. The straight edge *between* two vertices does not: it
  // is a chord across a curve, and a chord cuts outside wherever the curve
  // bends away from it. Where two counters' reaches meet, the outline has a
  // notch, and an edge spanning it bulges into ground nobody serves.
  //
  // Measured, that was 154 feet of over-claim north of Studio City — small, and
  // still the one direction this map is not allowed to be wrong in. So each
  // ring is drawn a little inside its own measurement.
  //
  // The margin is the worst a chord can sag for this bearing spacing at this
  // search's reach — R(1 − cos(half a step)) — plus one search step. That is
  // the exact bound for a convex arc and headroom for a notch, and it comes to
  // a few hundred feet: about a pixel at the zoom the page opens on, and always
  // on the side of telling somebody to check rather than telling them yes.
  const sag = 1 - Math.cos(Math.PI / BEARINGS);
  return {
    rings: searches.map((search) => {
      const ceiling = Math.max(...search.high);
      const inset = ceiling * sag + ceiling / 2 ** STEPS;
      return search.low.map((miles, i) =>
        project(search.centre, (i * 360) / BEARINGS, Math.max(0, miles - inset)),
      );
    }),
    origins,
    // The framing centre, across every patch — what the map opens on. Not one
    // of the patch centres: with two lobes, opening on either one puts the
    // other off screen.
    centre: [
      origins.reduce((sum, [lat]) => sum + lat, 0) / origins.length,
      origins.reduce((sum, [, lng]) => sum + lng, 0) / origins.length,
    ],
    radiusMiles: DELIVERY_RADIUS_MILES,
  };
}

// ——— The cache ———
//
// The in-flight promise is shared as well as the result: without that, the
// first two visitors after a deploy each start their own seven-call
// measurement.
//
// Still seven calls however many counters there are, not seven per counter:
// they ride in as extra origins on the calls the contour was already making.
//
// ——— ⚠️ An hour, and it used to be a day ———
//
// A day was chosen against how often the *road network* changes, and that was
// the wrong question. What this holds is a shape derived from the counter list,
// and the counter list changes whenever the shop opens or closes a shop — which
// is exactly when somebody looks at this map to check their work.
//
// A counter opened and did not appear on the published map, because the shape
// drawn before it opened was still inside its day. Nothing was wrong with the
// measurement; it was answering a question asked before the shop had five
// shops.
//
// So the two things the old number was conflating are now separate: how often
// the boundary is *measured* (an hour, seven Routes calls, still nothing), and
// how long a stale one may be *published* (see the endpoint's Cache-Control,
// which is now minutes). Neither has to be long for the other to be cheap.
const TTL_MS = 60 * 60 * 1000;

/** What the cached shape was measured from.
 *
 *  ⚠️ The clock is not enough on its own. A cache that only expires by time
 *  will keep serving a four-counter map for the rest of its window after a
 *  fifth opens, and the window is exactly as long as somebody's patience while
 *  they refresh the page wondering what they got wrong.
 *
 *  The counter list, the typed positions and the radius, which is everything
 *  the shape depends on that a person edits. Deliberately synchronous and
 *  computed off LOCATIONS rather than off the resolved geocodes: this runs on
 *  every read, and reaching for storePlaces here would put a Geocoding attempt
 *  on the path of every request whenever Google is unreachable. */
function counterFingerprint(): string {
  return (
    deliveringStores()
      .map((store) => `${store.id}@${store.position[0]},${store.position[1]}`)
      .join("|") + `#${DELIVERY_RADIUS_MILES}`
  );
}

let cached: { at: number; area: DeliveryArea; from: string } | null = null;
let inFlight: Promise<DeliveryArea | null> | null = null;

/** The delivery boundary, measured or remembered. Null when Routes could not
 *  answer — the page renders the shop and the address check without a shaded
 *  area, rather than a shape nobody measured. */
export async function deliveryArea(): Promise<DeliveryArea | null> {
  const fingerprint = counterFingerprint();
  if (cached && cached.from === fingerprint && Date.now() - cached.at < TTL_MS) {
    return cached.area;
  }
  inFlight ??= measure()
    .catch(() => null)
    .then((area) => {
      if (area) cached = { at: Date.now(), area, from: fingerprint };
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
