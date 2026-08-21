import "server-only";

import { driveMatrixMin } from "./googleMaps";
import { unionRings } from "./polygonUnion";
import { deliveryOrigins } from "./storePlaces";
import {
  DELIVERY_RADIUS_MILES,
  deliveringStores,
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
// of a ten-mile reach around each of them.
//
// ——— ⚠️ One ring per counter, and the centroid version that failed ———
//
// This drew a single ring for a whole cluster of counters: rays out from their
// centroid, each probe asking how far the *nearest* counter was. It was cheap
// and it was wrong in a way that took a sweep to catch.
//
// A ray search can only describe a region that is star-shaped about the point
// the rays start from — go outward and once you leave, you stay out. A ten-mile
// reach around one counter is very nearly that. The union of eight counters
// strung thirty miles from Studio City down to Fullerton is not: it bends, and
// there are directions from the centroid that leave the served area, cross
// ground nobody serves, and enter it again on the far side. The straight edge
// drawn between two neighbouring rays then cuts right across the gap.
//
// Measured, with counters in Torrance and San Clemente added: twenty points in
// a 1,333-point sweep were inside the drawn boundary and outside the rule, the
// worst by 4,587 feet. Nearly a mile of a published map promising delivery to
// addresses the checkout would refuse — the one failure the top of this file
// says a coverage map cannot have.
//
// So the ring is per counter now. Rays start at the counter itself and search
// zero to the radius, which is the one arrangement where "once you are out you
// stay out" is a fair assumption about a road network.
//
// ——— ⚠️ And then the rings are unioned, because overlapping outlines are not
//     a shape ———
//
// Handed to Google as several paths in one Polygon, the fill unions and the
// stroke does not: every ring draws its whole outline including the arcs buried
// inside its neighbours. Nine counters came out as nine red circles crossing
// each other — a picture of the algorithm rather than a picture of where the
// shop delivers.
//
// So `outline` is the boundary of the union, computed in app/polygonUnion.ts,
// and it is what the map draws. `rings` stays as the per-counter measurements
// because that is what the assertions in tests/deliveryArea.test.ts are about:
// whether each shop's reach was measured correctly is a different question
// from how the total is drawn, and collapsing them would leave the first one
// with no test.
//
// It is also simpler. There is no clustering heuristic any more, no centroid,
// no question of whether two counters belong in the same group — the shape of
// the answer is one ring per shop, which is what the sentence on the page says.
//
// ——— ⚠️ Why it is affordable, and the day it stopped being ———
//
// Route Matrix collapses a whole ring of bearings into one call per search
// step, so a counter costs its step count in calls and the shape is cached
// until the counter list changes or an hour passes.
//
// The number that matters is not calls, it is *elements* — origins ×
// destinations, summed over the rebuild — because that is what Google meters,
// at a default of MATRIX_ELEMENT_QUOTA a minute, and a rebuild spends its whole
// allowance in a few seconds. The history is worth writing down, because every
// step of it looked harmless at the time:
//
//   4 counters, one ring from the centroid       1,344 elements   drew
//   5 counters, one ring                         1,680 elements   drew
//   6 counters, two rings, every counter asked
//     about every ring's probes                  5,184 elements   disappeared
//
// Nothing in that third line is a bug on its own. A counter opened in Orange
// County, which split the counters in two; the wider span needed more search
// steps; and the code asked every counter about every group's probes. Each
// multiplies the others, and the product went past the quota in one move.
//
// Per-counter rings make it linear and legible: BEARINGS × steps × counters,
// one origin per call, nothing asked twice.
//
//   9 counters, nine rings                       2,592 elements
//
// ⚠️ Linear is still growth. Somewhere around eleven counters this passes the
// default quota and the Cloud console raise stops being optional — Routes API
// → Quotas → Compute Route Matrix elements per minute, which is free.
// tests/matrixBudget.test.ts computes it from the location list and names the
// counter that does it.
//
// ——— What it is not ———
//
// Not a guarantee. Uber can still refuse a specific job, the checkout still
// asks for a live quote, and this file never decides whether an order is
// accepted — app/api/delivery/quote does, from the same constant. This draws
// the rule; it does not enforce it, and the two cannot disagree because
// neither one is a copy of the other.

// How many directions each counter's reach is sampled in.
//
// ——— ⚠️ Thirty-six, and it was forty-eight ———
//
// Forty-eight was chosen for one ring drawn around a whole city, where the
// polygon was twenty miles across and its facets showed. A ring is now a single
// counter's ten-mile reach, so thirty-six bearings put a vertex every 1.7 miles
// of circumference — finer than forty-eight ever managed on the old shape, and
// nine of them overlapping read as a blob rather than as a polygon.
//
// The other half of the reason is the quota. Bearings multiply every ring, so
// this is the one number that costs nine times whatever it is set to, and
// forty-eight would put a nine-counter rebuild over the default allowance on
// its own. See the element arithmetic above.
export const BEARINGS = 36;

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
  /** ⚠️ The outline of the union: what the map draws.
   *
   *  One closed loop per connected piece of the area, with the seams between
   *  overlapping counters gone. Fewer loops than `rings` whenever two counters
   *  reach the same ground, and the same number when none of them do.
   *
   *  This exists because Google unions the *fill* of several paths in one
   *  Polygon and does not union the *stroke*: every ring drew its whole
   *  outline, including the arcs buried inside its neighbours, so nine counters
   *  came out as nine red circles crossing each other. See app/polygonUnion.ts.
   *
   *  It covers exactly the ground `rings` covers — no more, which is the
   *  direction that matters on a published map, and no less. */
  outline: [number, number][][];
  /** The per-counter measurements, each a closed loop of [lat, lng] pairs.
   *
   *  ⚠️ Not what the map draws — see `outline`. Kept because it is the thing
   *  that was actually *measured*, one ring per shop, and whether each shop's
   *  reach came out right is a different question from how the total is
   *  rendered. tests/deliveryArea.test.ts asks the first question of these.
   *
   *  ——— ⚠️ Why there is more than one of them ———
   *
   *  A single ring can only describe one connected patch, and the shop stopped
   *  being one connected patch when it opened in Fullerton — twenty-three miles
   *  from the nearest other counter, which is more than twice the radius. Their
   *  reaches do not touch, so what the shop serves is two areas with a gap in
   *  between, and a polygon has no way to say "not here".
   *
   *  ⚠️ One ring for the whole shop did not merely look wrong, it over-claimed:
   *  measured, it covered points around Pico Rivera that are eleven miles from
   *  any counter. That is the exact failure the note at the top of this file
   *  says a coverage map cannot have — somebody reads it, fills a basket, and
   *  finds out at the checkout. */
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

/** The reach of one counter, as a closed ring of points.
 *
 *  ——— ⚠️ Rays from the counter, and only that counter as the origin ———
 *
 *  Both halves matter and they are the same decision. Starting the rays at the
 *  shop is what makes "once you are out of range you stay out" a fair
 *  assumption — see the header for the thirty-mile bent shape where it stopped
 *  being one. Asking only this counter is what makes the ring mean "how far
 *  *this* shop reaches", which is the thing the union is a union of, and it
 *  costs one origin per element rather than nine.
 *
 *  Null when a call fails, so the caller can refuse to publish half a shape. */
async function ringFor(counter: [number, number]): Promise<[number, number][] | null> {
  // Straight-line bounds on the answer. Zero at the near end; the radius at the
  // far end, and that is safe because a road route is never shorter than the
  // straight line — a point more than the radius away in a straight line is
  // more than the radius away by road, so the boundary is always inside this.
  const low = new Array<number>(BEARINGS).fill(0);
  const high = new Array<number>(BEARINGS).fill(DELIVERY_RADIUS_MILES);
  const steps = stepsFor(DELIVERY_RADIUS_MILES);

  for (let step = 0; step < steps; step += 1) {
    const probes: [number, number][] = [];
    const mids: number[] = [];
    for (let i = 0; i < BEARINGS; i += 1) {
      const mid = (low[i] + high[i]) / 2;
      mids.push(mid);
      probes.push(project(counter, (i * 360) / BEARINGS, mid));
    }

    const measured = await driveMatrixMin([counter], probes);
    // One failed call and the whole shape is a guess. Better to have no map
    // than a boundary drawn half from measurement and half from an interval
    // that never got narrowed.
    if (!measured) return null;

    for (let i = 0; i < BEARINGS; i += 1) {
      const miles = measured[i]?.miles ?? null;
      // Unreachable counts as too far. That is what pulls the western edge off
      // the water: no road route to a point in the Pacific, so the search stops
      // reaching for it.
      if (miles === null || miles > DELIVERY_RADIUS_MILES) high[i] = mids[i];
      else low[i] = mids[i];
    }
  }

  // ——— ⚠️ Pulled in, because a vertex being inside is not the polygon being
  //     inside ———
  //
  // `low` is the last distance known to obey the rule, so every vertex sits
  // inside the boundary. The straight edge *between* two vertices does not: it
  // is a chord across a curve, and a chord cuts outside wherever the curve
  // bends away from it.
  //
  // The margin is the worst a chord can sag at this bearing spacing and this
  // reach — R(1 − cos(half a step)) — plus one search step. That is the exact
  // bound for a convex arc, and unlike the centroid version this arc really is
  // roughly convex: it is one shop's own reach, not a chain of eight shops'.
  // A few hundred feet, always on the side of telling somebody to check.
  const sag = 1 - Math.cos(Math.PI / BEARINGS);
  const inset = DELIVERY_RADIUS_MILES * (sag + 1 / 2 ** steps);
  return low.map((miles, i) =>
    project(counter, (i * 360) / BEARINGS, Math.max(0, miles - inset)),
  );
}

async function measure(): Promise<DeliveryArea | null> {
  // Every counter a delivery can leave from, at its resolved address rather
  // than the coordinates typed beside it — the same points the courier is
  // actually sent to. See storePlaces.ts.
  const origins = await deliveryOrigins();
  if (origins.length === 0) return null;

  // ——— ⚠️ The rings in parallel, the steps inside each one in sequence ———
  //
  // The binary search cannot be parallelised — each step's probes are chosen
  // from the last step's answers — but the counters are independent, and a ring
  // is eight round trips. Nine rings one after another is seventy-two calls
  // deep and takes the best part of half a minute; nine at once is eight deep
  // and takes seconds. The first visitor after a deploy waits for this, so the
  // difference is somebody looking at a page with no map on it.
  //
  // ⚠️ It costs nothing extra against the quota, which is the part worth being
  // clear about: the quota is elements per *minute*, and a rebuild spends the
  // same 2,592 either way. Concurrency changes how long it takes, not how much
  // it takes. An earlier draft of this loop was sequential on the reasoning
  // that firing nine at once would blow the allowance, and that reasoning was
  // simply wrong about which unit the allowance is in.
  const drawn = await Promise.all(origins.map((counter) => ringFor(counter)));
  if (drawn.some((ring) => ring === null)) return null;
  const rings = drawn as [number, number][][];

  return {
    // ⚠️ Computed once, here, rather than in the browser. It is a few hundred
    // segment intersections — nothing — but it is also the answer to "what
    // shape is this", and an answer worked out separately by every visitor is
    // an answer that can differ between them.
    outline: unionRings(rings),
    rings,
    origins,
    // The framing centre — what the map opens on before it fits the bounds.
    // Not one of the counters: with rings from Studio City to San Clemente,
    // opening on any single shop puts most of the others off screen.
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
