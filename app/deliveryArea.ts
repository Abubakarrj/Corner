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
// ——— ⚠️ Why it is affordable, and the day it stopped being ———
//
// Naively this is BEARINGS × steps route requests. Route Matrix collapses each
// step into one call for all forty-eight bearings at once, so a patch costs its
// own step count in calls, and the shape is cached until the counter list
// changes or an hour passes.
//
// The number that matters is not calls, it is *elements* — origins ×
// destinations, summed over the whole rebuild — because that is what Google
// meters. It is worth writing the history down, because every step of it looked
// harmless at the time:
//
//   4 counters, 1 patch, 7 steps      1,344 elements   the map drew
//   5 counters, 1 patch, 7 steps      1,680 elements   the map drew
//   6 counters, 2 patches, 9 steps    5,184 elements   the map disappeared
//
// Nothing in that third line is a bug on its own. A counter opened in Orange
// County, which split the counters into two patches; the wider span needed two
// more search steps; and the code asked every counter about every patch's
// probes. Each of those multiplies the others, and the product went past the
// quota in one move.
//
// It is now the sum over patches of (that patch's counters × BEARINGS × that
// patch's steps), which is linear in counters rather than counters × patches,
// and then less again because a counter too far from a probe to matter is not
// asked about at all:
//
//   6 counters, 2 patches             2,544 elements at worst
//                                     1,434 as it actually asks
//
// See MATRIX_ELEMENT_QUOTA, and tests/matrixBudget.test.ts, which computes the
// worst case from the shop's own location list and fails before a deployment
// does.
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
export const BEARINGS = 48;

/** ⚠️ Google's default Compute Route Matrix quota: elements per minute, per
 *  project.
 *
 *  ——— The limit that actually took the map down ———
 *
 *  It is easy to read this as a cost concern and it is not one. Elements are
 *  cheap. This is a *rate*, it is enforced with a 429, and a rebuild fires all
 *  of its calls back to back — so the whole minute's allowance is spent in a
 *  few seconds. Go over and a call in the middle of the binary search is
 *  refused, `measure()` returns null, and /delivery-areas draws nothing at all.
 *
 *  Every part of that failure is quiet. The page renders the address check and
 *  no map, deliberately; the endpoint answers `{known:false}`, which is a
 *  perfectly good answer to a question about a shape nobody could measure; and
 *  the only trace is a line on a hosting dashboard. The shop finds out by
 *  looking at its own website.
 *
 *  ⚠️ It is a *default*, and it can be raised for free in the Cloud console
 *  under Routes API → Quotas. Being under it here is the code's job; staying
 *  under it as the shop keeps opening counters is a console setting, and
 *  tests/matrixBudget.test.ts is what says which of the two is about to run
 *  out. Written down here rather than left in a commit message because the
 *  next person to add a counter needs it, and nothing else in this file would
 *  have told them. */
export const MATRIX_ELEMENT_QUOTA = 3000;

/** How finely the boundary is resolved, in feet.
 *
 *  ——— ⚠️ A target, not a step count, and that is the fix for a real outage ———
 *
 *  This was a constant number of binary-search steps for every patch. Seven,
 *  then nine when the counters spread out and seven stopped being enough for a
 *  twenty-mile span. Both were the wrong kind of number: a step count is a
 *  statement about *cost*, and what anybody cares about is *precision*, and the
 *  two are only the same while every search has the same span.
 *
 *  They stopped being the same when Fullerton opened. The Los Angeles patch
 *  searches a twenty-mile span and needs nine steps to get here; Fullerton, on
 *  its own, searches ten and needs eight. Running both at nine bought a
 *  hundred-foot boundary nobody asked for around one shop, and paid for it in
 *  Route Matrix elements — which is the currency that ran out. See the note on
 *  MATRIX_ELEMENT_QUOTA below.
 *
 *  So the constant is the answer's precision and the step count is derived per
 *  patch. Two hundred and fifty feet is about a building, which is as exact as
 *  a published coverage map can honestly claim: the chord between two vertices
 *  sags further than that, which is why the ring is inset by both terms
 *  together at the end. */
const TARGET_FEET = 250;

/** Binary-search steps for a search of this span, each halving the interval.
 *
 *  Deliberately not clamped at the top: a patch whose span somehow grew would
 *  get more steps rather than a silently coarser boundary. It is clamped at the
 *  bottom because zero steps is a ring drawn at whatever the interval started
 *  at, which is not a measurement at all. */
export function stepsFor(spanMiles: number): number {
  const target = TARGET_FEET / 5280;
  return Math.max(1, Math.ceil(Math.log2(Math.max(spanMiles, target) / target)));
}

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
export function patches(points: [number, number][]): [number, number][][] {
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

  // One search per patch, run one after another. See patches().
  const groups = patches(origins);
  // The chord margin, needed per patch below and constant across them: it is a
  // function of the bearing spacing alone.
  const sag = 1 - Math.cos(Math.PI / BEARINGS);
  const rings: [number, number][][] = [];

  for (const group of groups) {
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
    const ceiling = DELIVERY_RADIUS_MILES + spread;
    // This patch's own step count, from its own span. A tight patch converges
    // sooner and is not made to pay for a spread-out one. See stepsFor().
    const steps = stepsFor(ceiling);
    const low = new Array<number>(BEARINGS).fill(0);
    const high = new Array<number>(BEARINGS).fill(ceiling);

    for (let step = 0; step < steps; step += 1) {
      // ——— ⚠️ Only the questions whose answer is not already known ———
      //
      // This step used to be "every counter against every probe", and every
      // patch's probes were batched into one call besides. The argument was
      // that a mistake in the grouping could then only change the shape and
      // never the distances, and that the extra origins were free because the
      // call was being made anyway.
      //
      // They were not free. Google meters elements — origins × destinations —
      // and batching multiplied both sides at once: six counters against two
      // patches' probes is 576 elements a step where one patch of five had
      // been 240. Nine steps of that is 5,184 elements fired back to back
      // against a quota of 3,000 a minute, so a call in the middle of the
      // search was refused, measure() returned null, and the map vanished off
      // a public page. See MATRIX_ELEMENT_QUOTA.
      //
      // What replaces it is one inequality: a road route is never shorter than
      // the straight line between its ends. So a counter more than the radius
      // away from a probe *in a straight line* is more than the radius away by
      // road, and cannot be the counter that brings it into range. Asking is
      // spending an element on an answer already in hand.
      //
      // ⚠️ This is a filter on questions, not an approximation of them. Every
      // pair it drops is a pair whose verdict is out-of-range with certainty;
      // every pair it keeps is measured on the road exactly as before. The
      // boundary it produces is identical to the boundary the expensive
      // version produced, which is what makes it worth doing rather than a
      // trade.
      const probes: [number, number][] = [];
      const bearingOf: number[] = [];
      const midOf: number[] = [];
      for (let i = 0; i < BEARINGS; i += 1) {
        const mid = (low[i] + high[i]) / 2;
        const at = project(centre, (i * 360) / BEARINGS, mid);
        if (group.some((counter) => milesBetween(counter, at) <= DELIVERY_RADIUS_MILES)) {
          probes.push(at);
          bearingOf.push(i);
          midOf.push(mid);
        } else {
          // No counter can reach it, so it is outside the boundary, and that
          // is settled without a round trip. On the later steps of a search
          // this is most of the ray casts.
          high[i] = mid;
        }
      }
      // Every probe was ruled out on the geometry alone. Nothing to ask.
      if (probes.length === 0) continue;

      // And the same rule the other way round: a counter that is too far from
      // every probe still standing contributes nothing to this call.
      const near = group.filter((counter) =>
        probes.some((probe) => milesBetween(counter, probe) <= DELIVERY_RADIUS_MILES),
      );

      const measured = await driveMatrixMin(near, probes);
      // One failed call and the whole shape is a guess. Better to have no map
      // than a boundary drawn half from measurement and half from an interval
      // that never got narrowed.
      if (!measured) return null;

      for (let k = 0; k < probes.length; k += 1) {
        const i = bearingOf[k];
        const miles = measured[k]?.miles ?? null;
        // Unreachable counts as too far. That is what pulls the western edge
        // off the water: no road route to a point in the Pacific, so the
        // search stops reaching for it.
        if (miles === null || miles > DELIVERY_RADIUS_MILES) high[i] = midOf[k];
        else low[i] = midOf[k];
      }
    }

    // ——— ⚠️ Pulled in, because a vertex being inside is not the polygon being
    //     inside ———
    //
    // `low` is the last distance known to obey the rule, so every vertex sits
    // inside the boundary. The straight edge *between* two vertices does not:
    // it is a chord across a curve, and a chord cuts outside wherever the curve
    // bends away from it. Where two counters' reaches meet, the outline has a
    // notch, and an edge spanning it bulges into ground nobody serves.
    //
    // Measured, that was 154 feet of over-claim north of Studio City — small,
    // and still the one direction this map is not allowed to be wrong in. So
    // each ring is drawn a little inside its own measurement.
    //
    // The margin is the worst a chord can sag for this bearing spacing at this
    // search's reach — R(1 − cos(half a step)) — plus one search step. That is
    // the exact bound for a convex arc and headroom for a notch, and it comes
    // to a few hundred feet: about a pixel at the zoom the page opens on, and
    // always on the side of telling somebody to check rather than telling them
    // yes.
    //
    // ⚠️ `steps` is this patch's own, so a patch that converged in fewer steps
    // is inset by its own coarser step rather than by somebody else's finer
    // one. Reading a shared constant here is how a ring gets drawn tighter
    // than it was measured.
    const reach = Math.max(...high);
    const inset = reach * sag + reach / 2 ** steps;
    rings.push(
      low.map((miles, i) =>
        project(centre, (i * 360) / BEARINGS, Math.max(0, miles - inset)),
      ),
    );
  }

  return {
    rings,
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
