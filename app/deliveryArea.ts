import "server-only";

import { inThePacific } from "./coastline";
import { driveMatrixMin } from "./googleMaps";
import { deliveryShape } from "./deliveryShape";
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
// Along each of a ring of directions, binary-search outward for the point whose
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
// Per-counter rings make it linear and legible: bearings × steps × counters,
// one origin per call, nothing asked twice.
//
//   9 counters, nine rings                       2,673 elements
//
// ⚠️ Linear is still growth, and the answer to it is no longer a constant
// somebody has to remember to edit. The resolution is picked at measure time
// from what the quota will carry — see RESOLUTIONS — so a tenth counter costs
// detail rather than costing the map. tests/matrixBudget.test.ts prints the
// rung each future counter count lands on, names the one that makes the map
// coarser than it is today, and names the one past the bottom of the ladder
// that would take it away entirely.
//
// ——— What it is not ———
//
// Not a guarantee. Uber can still refuse a specific job, the checkout still
// asks for a live quote, and this file never decides whether an order is
// accepted — app/api/delivery/quote does, from the same constant. This draws
// the rule; it does not enforce it, and the two cannot disagree because
// neither one is a copy of the other.

/** How finely one rebuild measures: directions per counter, and how precisely
 *  each of those is resolved. */
export type Resolution = {
  /** Directions each counter's reach is sampled in. */
  bearings: number;
  /** How close to the true boundary each ray is driven, in feet. */
  targetFeet: number;
};

// ——— ⚠️ Why this is a ladder and not two constants ———
//
// It was two constants: thirty-six bearings, two hundred and fifty feet. They
// were chosen against the *default* quota with nine counters, and both of those
// are things that change without anybody editing this file — a shop opens, or
// somebody raises the quota in the Cloud console. When they changed, the
// constants did not, and the failure mode was the whole map disappearing.
//
// So the resolution is chosen at measure time from what the budget will carry.
// Two things follow, and both are the point:
//
//   raising the quota in the console is the only step needed to get a finer
//   map. There is no second deploy to remember, and no window where the code
//   is asking for more than the project will give;
//
//   opening a counter can no longer take the map down. It costs resolution
//   instead, which is a map that is slightly coarser rather than a page with
//   nothing on it. tests/matrixBudget.test.ts prints the rung each counter
//   count lands on and fails if the next one would drop below what is drawn
//   today.
//
// ——— ⚠️ What each rung costs, measured ———
//
// Against a 360-bearing ground truth in a simulated world, comparing the drawn
// shape with what the rule actually covers. Error is almost entirely
// *under*-claim: the map drawing less than the shop delivers.
//
//   bearings × steps   elements (9 counters)   inset    error
//        24 × 8              1,728             658 ft   43.6 sq mi
//        36 × 8              2,592             407 ft   29.5 sq mi   ← was here
//        33 × 9              2,673             342 ft   23.8 sq mi
//        48 × 9              3,888             216 ft   14.4 sq mi
//        60 × 10             5,400             124 ft    7.7 sq mi
//        72 × 10             6,480             102 ft    6.8 sq mi
//        90 × 11             8,910              58 ft    3.6 sq mi
//
// ⚠️ Steps are the better buy and that is not obvious. A step costs
// `bearings × counters`; a bearing costs `steps × counters` and you need
// several of them to move anything. Half the error was the inset rather than
// the chords — 15.8 square miles of it against 13.7 — and only steps shrink the
// half of the inset that is not sag. Thirty-three bearings and nine steps beats
// thirty-six and eight for eighty-one more elements.
//
// ⚠️ And the thing that was tried and is not here: placing bearings adaptively,
// finer where the reach changes sharply. Measured, the chord error is spread
// around the whole perimeter rather than concentrated at the coast — going from
// twenty-four bearings to a hundred and twenty only takes it from 18.7 to 7.1
// square miles. Uniform bearings at a raised quota beat anything adaptive
// placement could reach, with no second search pass and no new algorithm.
//
// Ordered finest first. The first rung the budget can afford wins.
const RESOLUTIONS: Resolution[] = [
  { bearings: 90, targetFeet: 30 },
  { bearings: 72, targetFeet: 60 },
  { bearings: 60, targetFeet: 60 },
  { bearings: 48, targetFeet: 125 },
  { bearings: 33, targetFeet: 125 },
  // ⚠️ Thirty bearings at nine steps exists for one reason: it is what ten
  // counters can afford on the default quota. Without it the tenth counter
  // dropped to eight steps and a 495ft inset — coarser than the map drew
  // before any of this — and the budget suite said so. Trading three bearings
  // for the ninth step keeps it at 392ft, which is finer.
  { bearings: 30, targetFeet: 125 },
  // ⚠️ Everything below here is coarser than the map drew in August 2026. A
  // rebuild landing on one of these is a shop that has outgrown its quota, not
  // a tuning choice. matrixBudget says so out loud.
  { bearings: 30, targetFeet: 250 },
  { bearings: 24, targetFeet: 250 },
];

/** Every rung, finest first. Exported so tests/matrixBudget.test.ts can hold
 *  all of them to the per-call limit rather than only the one in use: a raised
 *  quota promotes the app to a finer rung with no code change, and a rung that
 *  only breaks once it is reached is a rung nobody tested. */
export function resolutionLadder(): Resolution[] {
  return RESOLUTIONS.slice();
}

/** The rung the map drew before the ladder existed, so tests and the budget
 *  report have something to say "no worse than" about. */
export const RESOLUTION_FLOOR: Resolution = { bearings: 36, targetFeet: 250 };

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

/** ⚠️ Measure the boundary live instead of serving the committed one.
 *
 *  Off everywhere by default, and it should stay off on anything real: a live
 *  rebuild is ~2,640 Route Matrix elements and it happens on every cold start,
 *  which is what the committed shape exists to stop. It is here for
 *  scripts/measure-delivery-area.mjs, which needs a real measurement to write
 *  the file, and for the rare case of debugging one by hand. */
const LIVE = process.env.DELIVERY_AREA_LIVE === "1";

/** How much of a minute's quota one rebuild may spend.
 *
 *  ⚠️ Not all of it, and the missing tenth is not caution for its own sake. The
 *  address check under the map spends one element per counter every time
 *  somebody types an address, and Riley's check_delivery spends the same. A
 *  rebuild that fills the minute leaves nothing for the people the map is for —
 *  and the failure lands on them, as an address that cannot be checked, rather
 *  than on the rebuild.
 *
 *  At the default quota this leaves three hundred elements a minute, which is
 *  thirty-three address checks against nine counters. */
const MATRIX_BUDGET_SHARE = 0.9;

/** Elements a minute this project actually has.
 *
 *  ⚠️ MATRIX_ELEMENT_QUOTA is Google's *default*, not this project's setting.
 *  Raising it under Routes API → Quotas is free and takes a minute, and once it
 *  is done the only thing standing between the shop and a finer map is telling
 *  the app about it. That is this variable.
 *
 *  Set ROUTES_MATRIX_QUOTA to the console's number and the next rebuild climbs
 *  the ladder on its own. Leave it unset and nothing changes.
 *
 *  ⚠️ Set it to what the console says and nothing else. Claiming an allowance
 *  the project does not have is exactly the outage this whole file is about: a
 *  429 in the middle of the search, `measure()` returning null, and a page with
 *  no map on it and no error anywhere a person would look. A value below the
 *  default is honoured — some projects have theirs lowered — but a value that
 *  is not a number is ignored rather than guessed at. */
export function matrixElementQuota(): number {
  return readMatrixQuota().quota;
}

/** The same answer, with whether the environment was believed.
 *
 *  ⚠️ Split out because "unset" and "set to something I could not use" are
 *  different problems with the same symptom, and telling somebody their
 *  variable is unset when they have just typed one is how an afternoon goes
 *  missing. tests/matrixBudget.test.ts prints which of the two it is. */
export function readMatrixQuota(): { quota: number; from: "default" | "env" | "ignored" } {
  const set = process.env.ROUTES_MATRIX_QUOTA;
  if (set === undefined || set.trim() === "") {
    return { quota: MATRIX_ELEMENT_QUOTA, from: "default" };
  }
  const raw = Number(set);
  // One call's worth is the floor. Below that nothing can be measured at all,
  // and a value that small is a typo rather than a quota.
  if (!Number.isFinite(raw) || raw < 600) {
    return { quota: MATRIX_ELEMENT_QUOTA, from: "ignored" };
  }
  return { quota: Math.floor(raw), from: "env" };
}

/** The finest rung this many counters can afford.
 *
 *  Falls back to the coarsest rung when nothing fits, rather than refusing to
 *  measure: a coarse map is worse than a fine one and far better than none, and
 *  the shop is told which it is getting by tests/matrixBudget.test.ts rather
 *  than by the map quietly going away. */
export function resolutionFor(
  counters: number,
  quota: number = matrixElementQuota(),
): Resolution {
  const budget = quota * MATRIX_BUDGET_SHARE;
  const affordable = RESOLUTIONS.find(
    (rung) => elementsFor(rung, counters) <= budget,
  );
  return affordable ?? RESOLUTIONS[RESOLUTIONS.length - 1];
}

/** What one rebuild costs at this rung: exact, not a ceiling. One origin per
 *  call, every probe asked once, nothing asked twice. */
export function elementsFor(resolution: Resolution, counters: number): number {
  return resolution.bearings * stepsFor(DELIVERY_RADIUS_MILES, resolution.targetFeet) * counters;
}

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
 *  So the number asked for is the answer's precision and the step count is
 *  derived from it. Two hundred and fifty feet is about a building; the rungs
 *  above it in RESOLUTIONS ask for less, which costs a step each time it halves.
 *
 *  ⚠️ The precision asked for here is not the accuracy of the drawn boundary.
 *  The chord between two vertices sags further than this, and the ring is inset
 *  by both terms together at the end — see insetMilesFor. */
const DEFAULT_TARGET_FEET = 250;

/** Binary-search steps for a search of this span, each halving the interval.
 *
 *  Deliberately not clamped at the top: a patch whose span somehow grew would
 *  get more steps rather than a silently coarser boundary. It is clamped at the
 *  bottom because zero steps is a ring drawn at whatever the interval started
 *  at, which is not a measurement at all. */
export function stepsFor(spanMiles: number, targetFeet: number = DEFAULT_TARGET_FEET): number {
  const target = targetFeet / 5280;
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
  /** The rung this rebuild could afford. Carried so a person looking at a
   *  coarse map can find out why it is coarse without reading this file. */
  resolution: Resolution;
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
/** How far inside its own measurement each ring is drawn, in miles.
 *
 *  The worst a straight edge can sag between two rays at this bearing spacing
 *  and this reach — R(1 − cos(half a step)) — plus one search step. A few
 *  hundred feet, always on the side of telling somebody to check.
 *
 *  ⚠️ Named rather than inlined because two places need the same number: the
 *  ring that gets pulled in by it, and the union that has to know a gap this
 *  narrow between two rings is the margin rather than a measurement. See
 *  closeGapsUnderMiles in app/polygonUnion.ts. */
export function insetMilesFor({ bearings, targetFeet }: Resolution): number {
  const sag = 1 - Math.cos(Math.PI / bearings);
  const steps = stepsFor(DELIVERY_RADIUS_MILES, targetFeet);
  return DELIVERY_RADIUS_MILES * (sag + 1 / 2 ** steps);
}

/** Slack on the "a road is never shorter than the straight line" test, in
 *  miles. Two hundred and sixty feet, which is not a claim about roads — it is
 *  the gap between two geodesics and a rounding to whole metres, plus the few
 *  yards Google moves a waypoint to put it on the kerb. */
const SNAP_SLACK_MILES = 0.05;

/** Whether a reported drive distance is too short to be a drive to the point
 *  that was asked about.
 *
 *  ——— ⚠️ The reason the map had the Pacific shaded in ———
 *
 *  A waypoint is a coordinate, not an address, so Routes puts it on the nearest
 *  road before it measures anything. Ask about a point a mile out in Santa
 *  Monica Bay and the answer is not a refusal: it is the distance to a road on
 *  the beach, returned with `ROUTE_EXISTS` and no hint that the question was
 *  changed. The search reads that as "in range", pushes the ray further out,
 *  and the boundary walks into the sea until the water is wider than Google is
 *  willing to reach across.
 *
 *  Measured against a stub that snaps the way Routes does: at a two-mile reach
 *  the drawn area covered 73 square miles of ocean, at five miles 162 — and the
 *  furthest the boundary got from the shore matched the reach almost exactly,
 *  which is the fingerprint of snapping rather than of a polygon cutting a
 *  corner. Thirty-five of the three hundred and twenty-four vertices were in
 *  the water.
 *
 *  ——— What is being tested, and why it cannot be fooled ———
 *
 *  A road route between two points is never shorter than the straight line
 *  between them. It is the same fact the search's upper bound rests on, three
 *  lines above. So a reported distance *below* the straight line is not a claim
 *  about a slow road: it is proof that at least one end of the route is not
 *  where we put it, and the only end that moves is the far one.
 *
 *  ⚠️ It is exact in the direction that matters — it never rejects a point a
 *  courier could reach — and it is weak in the other. The snap has to move the
 *  point far enough for the shortfall to show, so the rejection bites once the
 *  ray is roughly as far out as the counter is from the shoreline. A few
 *  hundred yards of water can still be drawn where a counter sits on the beach.
 *  That is the trade for a test that needs no coastline, no second API and no
 *  extra element: everything it removes was certainly wrong, and everything it
 *  keeps might be right.
 *
 *  ⚠️ Exported only so tests/deliveryOcean.test.ts can state that contract in
 *  assertions. Nothing else calls it: on the coast the coastline decides, and
 *  this is what is left for the reservoirs, the closed ranges and the far side
 *  of a ridge, where there is no data to consult and a snapped answer would
 *  otherwise go through unchallenged. */
export function looksSnapped(miles: number, straightLineMiles: number): boolean {
  return miles + SNAP_SLACK_MILES < straightLineMiles;
}

async function ringFor(
  counter: [number, number],
  resolution: Resolution,
): Promise<[number, number][] | null> {
  const bearings = resolution.bearings;
  // Straight-line bounds on the answer. Zero at the near end; the radius at the
  // far end, and that is safe because a road route is never shorter than the
  // straight line — a point more than the radius away in a straight line is
  // more than the radius away by road, so the boundary is always inside this.
  const low = new Array<number>(bearings).fill(0);
  const high = new Array<number>(bearings).fill(DELIVERY_RADIUS_MILES);
  const steps = stepsFor(DELIVERY_RADIUS_MILES, resolution.targetFeet);

  for (let step = 0; step < steps; step += 1) {
    const probes: [number, number][] = [];
    const mids: number[] = [];
    for (let i = 0; i < bearings; i += 1) {
      const mid = (low[i] + high[i]) / 2;
      mids.push(mid);
      probes.push(project(counter, (i * 360) / bearings, mid));
    }

    const measured = await driveMatrixMin([counter], probes);
    // One failed call and the whole shape is a guess. Better to have no map
    // than a boundary drawn half from measurement and half from an interval
    // that never got narrowed.
    if (!measured) return null;

    for (let i = 0; i < bearings; i += 1) {
      const miles = measured[i]?.miles ?? null;
      // Unreachable counts as too far — and out in the open ocean, far enough
      // from any road, that is what comes back.
      //
      // ⚠️ Nearer in it is not, and the map spent months saying so. See
      // looksSnapped: a probe in the water a mile off Belmont Shore is not
      // refused, it is quietly answered about somewhere else.
      //
      // ⚠️ And a probe in the water is refused whatever Routes said about it.
      // That is the test that does the work; looksSnapped catches the same
      // thing anywhere else it happens — a probe in the middle of a reservoir,
      // a closed range, the far side of a ridge — where there is no coastline
      // to consult. See app/coastline.ts.
      if (
        miles === null ||
        miles > DELIVERY_RADIUS_MILES ||
        looksSnapped(miles, mids[i]) ||
        inThePacific(probes[i])
      ) {
        high[i] = mids[i];
      } else {
        low[i] = mids[i];
      }
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
  //
  // ⚠️ A bearing with nothing left after the inset contributes no vertex at
  // all, rather than one at the counter. That case is now ordinary rather than
  // theoretical: a counter on the beach has bearings pointing straight out to
  // sea, and those searches correctly converge on almost nothing. Projecting
  // them at zero would put several identical points on the shop's own doorstep
  // — a spike through the middle of the ring, and a run of zero-length edges
  // for the union to walk. Dropping them lets the outline run from the last
  // vertex on one side of the water to the first on the other, which is the
  // shape of a shop with the sea on one side.
  const inset = insetMilesFor(resolution);
  const fan: Spoke[] = [];
  low.forEach((miles, i) => {
    const reach = miles - inset;
    if (reach <= 0) return;
    fan.push({ bearing: (i * 360) / bearings, miles: reach });
  });
  return aroundTheWater(counter, fan).map((spoke) =>
    project(counter, spoke.bearing, spoke.miles),
  );
}

/** One measured direction, as drawn: the bearing and how far along it the
 *  boundary sits after the inset. */
type Spoke = { bearing: number; miles: number };

/** How far along a bearing you can go before the water starts, up to a cap.
 *
 *  Pure geometry against app/coastline.ts — no probe, no element, no call. It
 *  answers "how far could a road possibly go this way", which is an upper bound
 *  on the reach and never a claim that a road goes there.
 *
 *  ⚠️ It marches outward rather than bisecting, and that is the whole
 *  correctness of it. Bisection needs "once wet, always wet", and a bay is
 *  exactly where that is false: a ray from Garden Grove across Alamitos Bay
 *  comes down dry on the Belmont Shore peninsula, so an endpoint test says the
 *  whole ray is fine and the edge keeps its tongue across the water. The first
 *  version did that and the tongue survived it.
 *
 *  So: step out until the water starts, then bisect that step. Thirty-two steps
 *  over ten miles is a look every thousand feet, which is finer than any inlet
 *  the drawn coastline resolves. */
function dryReach(counter: [number, number], bearing: number, cap: number): number {
  const STEPS = 32;
  let dry = 0;
  let wet = -1;
  for (let i = 1; i <= STEPS; i += 1) {
    const at = (cap * i) / STEPS;
    if (inThePacific(project(counter, bearing, at))) {
      wet = at;
      break;
    }
    dry = at;
  }
  if (wet < 0) return cap;
  // Ten halvings of a thousand feet is about a foot, far finer than the
  // coastline being searched against.
  for (let i = 0; i < 10; i += 1) {
    const mid = (dry + wet) / 2;
    if (inThePacific(project(counter, bearing, mid))) wet = mid;
    else dry = mid;
  }
  return dry;
}

/** How long the straight edge between two drawn vertices is, in miles. */
function edgeMiles(counter: [number, number], a: Spoke, b: Spoke): number {
  const from = project(counter, a.bearing, a.miles);
  const to = project(counter, b.bearing, b.miles);
  return Math.hypot((to[0] - from[0]) * 69, (to[1] - from[1]) * 57.4);
}

/** Whether the straight edge between two drawn vertices passes through the sea. */
function edgeCrossesWater(counter: [number, number], a: Spoke, b: Spoke): boolean {
  const from = project(counter, a.bearing, a.miles);
  const to = project(counter, b.bearing, b.miles);
  const span = edgeMiles(counter, a, b);
  const samples = Math.max(8, Math.ceil(span / 0.1));
  for (let i = 1; i < samples; i += 1) {
    const t = i / samples;
    const at: [number, number] = [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
    ];
    if (inThePacific(at)) return true;
  }
  return false;
}

/** ⚠️ Bend the edges that cut across water back to the shore.
 *
 *  ——— Why the rays stopping at the water is not enough ———
 *
 *  Every vertex is a measured point on land — the search refuses a probe in the
 *  sea, so no ray ends there. The straight edge *between* two of them is not
 *  measured at all, and where the coast is concave it can leave the land
 *  entirely: two rays twelve degrees apart from a counter sitting inland of a
 *  bay reach the shore on either side of it, and the chord spans the water in
 *  between.
 *
 *  ⚠️ This was dismissed once, correctly and then wrongly. With nine counters
 *  it did not happen — measured, the drawn area covered a tenth of a square
 *  mile of sea. Garden Grove is five miles inland of Anaheim Bay and the same
 *  arithmetic put a two-and-a-third mile tongue across Alamitos Bay. Nothing
 *  about the code changed; the geometry of where the shops are did.
 *
 *  ——— What it does ———
 *
 *  An edge over water gets a vertex in the middle of it, at the bearing between
 *  its two ends and no further out than three things allow: either neighbour's
 *  reach, and the point where that bearing meets the sea. Repeated a few times,
 *  the edge walks around the head of the bay instead of across it.
 *
 *  ⚠️ It only ever claims *less*. Every inserted vertex is nearer the counter
 *  than the chord it replaces, so the shape this returns is contained in the
 *  shape it was given. That is what makes it safe to do with geometry rather
 *  than with measurement: it cannot invent coverage, only decline some.
 *
 *  It costs no probes, no elements and no round trips, which is the other
 *  reason it is here rather than in the bearing count. Buying the same fix with
 *  bearings would have cost the whole remaining quota and fixed it everywhere
 *  except where it matters. */
function aroundTheWater(counter: [number, number], fan: Spoke[]): Spoke[] {
  if (fan.length < 3) return fan;

  // ⚠️ Until the edges are dry, not a fixed number of passes.
  //
  // Each pass halves the angular gap of an offending edge, so the polyline
  // creeps toward the shoreline and stops when nothing crosses. Three passes
  // was the first guess and it was not enough: Alamitos Bay took three
  // insertions and still had two and a quarter miles of water under the edge,
  // which looked exactly like the fix not working rather than like the fix
  // being rationed.
  //
  // Both bounds below are there so a coastline nobody anticipated costs a
  // slightly wrong map rather than a request that never returns: eight passes,
  // and no more than twice the original vertex count. Neither is reached by
  // any counter the shop has.
  const CEILING = fan.length * 2;
  let current = fan;
  for (let pass = 0; pass < 8; pass += 1) {
    if (current.length >= CEILING) break;
    const next: Spoke[] = [];
    let inserted = 0;
    for (let i = 0; i < current.length; i += 1) {
      const a = current[i];
      const b = current[(i + 1) % current.length];
      next.push(a);
      // ⚠️ Below this the edge is shorter than the coastline it is being
      // checked against, and subdividing stops converging on anything: the
      // trace showed the same bearing inserted eight times, each pass halving a
      // hundred-foot edge because one sample of it landed in a sliver of
      // drawn-in water. A vertex every hundred feet is finer than the data
      // deserves.
      if (edgeMiles(counter, a, b) < 0.05) continue;
      if (!edgeCrossesWater(counter, a, b)) continue;
      // The bearing halfway between them, the short way round.
      let sweep = b.bearing - a.bearing;
      if (sweep < 0) sweep += 360;
      const bearing = (a.bearing + sweep / 2) % 360;
      const cap = Math.min(a.miles, b.miles);
      const miles = dryReach(counter, bearing, cap);
      // A midpoint with nothing left is a spike at the counter. Leaving the
      // edge alone is the better of the two: it is the shape that was already
      // being drawn, rather than a new and worse one.
      if (miles > 0) {
        next.push({ bearing, miles });
        inserted += 1;
      }
    }
    current = next;
    if (inserted === 0) break;
  }
  return current;
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
  //
  // ⚠️ The resolution is chosen once, here, from the counter list this rebuild
  // is actually measuring — not per ring. Rings measured at different rungs
  // would carry different insets, and unionRings is handed one gap threshold
  // for the whole shape.
  const resolution = resolutionFor(origins.length);
  const drawn = await Promise.all(origins.map((counter) => ringFor(counter, resolution)));
  if (drawn.some((ring) => ring === null)) return null;
  const rings = drawn as [number, number][][];

  return {
    // ⚠️ Computed once, here, rather than in the browser. It is a few hundred
    // segment intersections — nothing — but it is also the answer to "what
    // shape is this", and an answer worked out separately by every visitor is
    // an answer that can differ between them.
    // ⚠️ Gaps narrower than the inset are closed. Every ring here was already
    // pulled in by that much, so two reaches that meet in the measurement can
    // come out of it with a few hundred feet of daylight between them — a red
    // needle on the map, drawn from a margin rather than from a road. Real
    // gaps are miles across and stay. See closeGapsUnderMiles.
    outline: unionRings(rings, { closeGapsUnderMiles: insetMilesFor(resolution) }),
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
    resolution,
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
/** ⚠️ What the *geometry* depends on: the counters and the radius, and nothing
 *  else. This is what the committed shape in app/deliveryShape.ts is stamped
 *  with, and it is deliberately narrower than counterFingerprint() below.
 *
 *  The quota is not in here. It decides how finely a live rebuild can afford to
 *  measure, which is a property of the measurement rather than of the area —
 *  and a committed shape carries the rung it was measured at inside it. Putting
 *  the quota in this string would make a shape look stale the moment somebody
 *  changed an environment variable that cannot move a boundary by an inch. */
export function shapeFingerprint(): string {
  return (
    deliveringStores()
      .map((store) => `${store.id}@${store.position[0]},${store.position[1]}`)
      .join("|") + `#${DELIVERY_RADIUS_MILES}`
  );
}

function counterFingerprint(): string {
  // ⚠️ The quota is in here as well as the counters. It is read from the
  // environment, so a deploy that raises it would otherwise keep serving the
  // coarse shape measured before it — for an hour, which is exactly as long as
  // somebody's patience while they refresh the page wondering whether the
  // console change took.
  const quota = matrixElementQuota();
  return (
    deliveringStores()
      .map((store) => `${store.id}@${store.position[0]},${store.position[1]}`)
      .join("|") + `#${DELIVERY_RADIUS_MILES}@${quota}`
  );
}

let cached: { at: number; area: DeliveryArea; from: string } | null = null;
let inFlight: Promise<DeliveryArea | null> | null = null;

/** The delivery boundary, measured or remembered. Null when Routes could not
 *  answer — the page renders the shop and the address check without a shaded
 *  area, rather than a shape nobody measured. */
export async function deliveryArea(): Promise<DeliveryArea | null> {
  // ——— ⚠️ The committed shape comes first, and usually there is nothing else ———
  //
  // The boundary is a pure function of the counter list and the radius, both of
  // which live in source. Measuring it at runtime was paying Google to re-derive
  // a constant on every cold start — 2,640 Route Matrix elements, about $13 a
  // time, and the cache that was supposed to prevent it was a module-level
  // variable that died with the process. Forty-five cold starts made a $600
  // bill for a shape that had not moved.
  //
  // So it is measured once, by scripts/measure-delivery-area.mjs, and committed.
  // See app/deliveryShape.ts.
  // ⚠️ !LIVE first. Without it the script that exists to produce this file
  // would find a matching shape, return it, and write back exactly what it read
  // — a measurement tool that measures nothing, and the only sign would be an
  // unchanged `measuredAt`.
  const committed = LIVE ? null : deliveryShape();
  if (committed && committed.measuredFrom === shapeFingerprint()) return committed.area;

  // ——— ⚠️ And when it does not match ———
  //
  // Somebody moved a counter or opened one and did not re-run the script. The
  // published map is then missing that shop's reach, which is wrong — but it is
  // an hour-of-staleness kind of wrong, and the alternative is re-opening the
  // hole that produced the bill, silently, at the exact moment somebody is
  // deploying a change.
  //
  // So the stale shape is served and the mismatch is made loud in three places
  // that are hard to miss and none of which cost money: this log, the
  // /api/maps-check diagnostic, and tests/deliveryShape.test.ts, which fails.
  // A live measurement happens only when somebody asks for one by name.
  if (committed) {
    console.warn(
      "[delivery-area] ⚠️ the committed shape does not match the counters — " +
        "run `npm run measure:delivery` and commit app/deliveryShape.ts. " +
        "Serving the shape as measured; the map is stale.",
    );
    return committed.area;
  }

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
