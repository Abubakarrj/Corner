// What one rebuild of the delivery boundary costs Google, against what Google
// will give us in a minute.
//
// ——— ⚠️ The outage this exists to have caught ———
//
// The map on /delivery-areas disappeared, and every part of the failure was
// quiet: the endpoint answered "no shape", the page drew the address check and
// no map, and the shop found out by looking at its own website.
//
// The cause was arithmetic nobody was doing. Google meters Compute Route Matrix
// in *elements* — origins × destinations — at a default of 3,000 a minute, and
// a rebuild fires every call back to back, so a rebuild is one burst against
// one minute's allowance. Three separate reasonable-looking changes multiplied:
//
//   4 counters, 1 patch, 7 steps      1,344    the map drew
//   5 counters, 1 patch, 7 steps      1,680    the map drew
//   6 counters, 2 patches, 9 steps    5,184    over quota, no map
//
// Opening a shop in Orange County split the counters into two patches; the
// wider span needed two more search steps; and every counter was asked about
// every patch's probes. None of those is wrong on its own and the product is a
// blank page.
//
// So this suite is the arithmetic, run against the shop's own location list,
// on every test run. It is the only thing in the repository that knows opening
// a counter can take the delivery map off the website.

import {
  DELIVERY_RADIUS_MILES,
  deliveringStores,
  milesBetween,
} from "../app/(marketing)/locations/locations";
import {
  BEARINGS,
  MATRIX_ELEMENT_QUOTA,
  patches,
  stepsFor,
} from "../app/deliveryArea";
import { MATRIX_MAX_ELEMENTS } from "../app/googleMaps";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

const counters = deliveringStores();
const points = counters.map((store) => store.position);
const groups = patches(points);
const nameOf = (point: [number, number]) =>
  counters.find((store) => store.position === point)?.name ?? "?";

/** One patch's span, the same way measure() computes it: the radius plus how
 *  far its furthest counter sits from its centre. */
function spanOf(group: [number, number][]): number {
  const centre: [number, number] = [
    group.reduce((sum, [lat]) => sum + lat, 0) / group.length,
    group.reduce((sum, [, lng]) => sum + lng, 0) / group.length,
  ];
  return (
    DELIVERY_RADIUS_MILES +
    group.reduce((furthest, point) => Math.max(furthest, milesBetween(centre, point)), 0)
  );
}

/** ⚠️ The ceiling on a rebuild, not the bill.
 *
 *  Each patch against its own counters, for its own number of steps. The real
 *  cost is lower — measure() also drops any counter more than the radius from
 *  a probe in a straight line, since a road route is never shorter, and on the
 *  later steps that is most of them. Measured against the stub in
 *  tests/deliveryArea.test.ts it comes to about 1,400 where this says 2,544.
 *
 *  The ceiling is what gets asserted, deliberately. How much the geometric
 *  filter saves depends on where the counters happen to sit, and a budget that
 *  only holds for one arrangement of shops is not a budget. */
function costOf(patchGroups: [number, number][][]): { elements: number; calls: number } {
  let elements = 0;
  let calls = 0;
  for (const group of patchGroups) {
    const steps = stepsFor(spanOf(group));
    const perCall = Math.max(1, Math.floor(MATRIX_MAX_ELEMENTS / group.length));
    calls += steps * Math.ceil(BEARINGS / perCall);
    elements += steps * group.length * BEARINGS;
  }
  return { elements, calls };
}

// ——— What the shop's own list asks for ———
console.log("\n— today —");
console.log(`  ${counters.length} counters: ${counters.map((s) => s.name).join(", ")}`);
groups.forEach((group, index) => {
  const span = spanOf(group);
  console.log(
    `  patch ${index}: ${group.map(nameOf).join(" + ")} · span ${span.toFixed(1)}mi · ` +
      `${stepsFor(span)} steps · ${stepsFor(span) * group.length * BEARINGS} elements`,
  );
});
const today = costOf(groups);
console.log(`  rebuild: at most ${today.elements} elements in ${today.calls} calls ` +
            `(${Math.round((today.elements / MATRIX_ELEMENT_QUOTA) * 100)}% of a minute's quota)`);
console.log("  the geometric filter takes the real figure well below that — see costOf()");

// ——— ⚠️ The assertion the outage would have failed ———
console.log("\n— against the quota —");
ok("⚠️ a rebuild fits inside one minute's element quota",
   today.elements < MATRIX_ELEMENT_QUOTA,
   `${today.elements} vs ${MATRIX_ELEMENT_QUOTA}`);
// ⚠️ Headroom, not just "fits". A rebuild is a burst; every address check on
// the site shares the same per-minute allowance, and a deploy that restarts
// two instances has two cold caches. Ninety per cent is the line: past it the
// map works until something else happens in the same minute, which is the
// worst kind of working.
ok("and leaves headroom for the address checks sharing the quota",
   today.elements < MATRIX_ELEMENT_QUOTA * 0.9,
   `${today.elements} is ${Math.round((today.elements / MATRIX_ELEMENT_QUOTA) * 100)}% of ${MATRIX_ELEMENT_QUOTA}`);

// ——— The shape the old code asked for, so the fix is a number and not a claim ———
//
// Every counter against every patch's probes, at one step count for all of
// them. Kept as an explicit calculation rather than a remembered figure,
// because the whole point is that it was never calculated.
const worstSteps = Math.max(...groups.map((group) => stepsFor(spanOf(group))));
const oldWay = worstSteps * counters.length * groups.length * BEARINGS;
console.log("\n— what it cost before —");
console.log(`  every counter against every patch, ${worstSteps} steps each: ${oldWay} elements`);
ok("⚠️ the old shape really was over quota", oldWay > MATRIX_ELEMENT_QUOTA,
   `${oldWay} vs ${MATRIX_ELEMENT_QUOTA}`);
ok("and the fix is a real cut, not a rounding",
   today.elements < oldWay / 1.5, `${today.elements} vs ${oldWay}`);

// ——— ⚠️ The counters that have not opened yet ———
//
// Written out because "today's numbers are fine" is exactly what a shop reads
// on the morning it signs a lease. Each row says how many counters, in how many
// patches, and whether that rebuild still fits.
console.log("\n— and the next few counters —");
const futures: [string, number, number, number][] = [
  // label, counters, patches, span of the biggest patch
  ["one more in LA", 7, 2, 21],
  ["one more somewhere new", 7, 3, 21],
  ["ten counters, three patches", 10, 3, 25],
  ["fifteen counters, four patches", 15, 4, 30],
  ["twenty counters, five patches", 20, 5, 35],
];
for (const [label, shops, patchCount, span] of futures) {
  // Evenly split, which is the optimistic reading; a lopsided split costs the
  // same total because the total is linear in counters now.
  const steps = stepsFor(span);
  const elements = steps * shops * BEARINGS;
  const share = Math.round((elements / MATRIX_ELEMENT_QUOTA) * 100);
  console.log(`  ${label}: ${elements} elements (${share}% of quota), ${patchCount} patches`);
}
// ⚠️ Not an assertion that they all fit — several of them do not, and that is
// the honest answer. What is asserted is that somebody finds out here.
const firstOver = futures.find(
  ([, shops, , span]) => stepsFor(span) * shops * BEARINGS >= MATRIX_ELEMENT_QUOTA,
);
console.log(
  firstOver
    ? `\n  ⚠️ "${firstOver[0]}" needs the Cloud console quota raised. It is free:` +
        " Routes API → Quotas → Compute Route Matrix elements per minute."
    : "\n  every projected shape fits.",
);
ok("the projection reaches far enough to find a limit", firstOver !== undefined,
   "nothing projected goes over, so this table stopped being a warning");

// ——— One call never exceeds what Google accepts in a single request ———
console.log("\n— and one call at a time —");
const GOOGLE_PER_CALL = 625;
ok("the app's per-call budget is inside Google's per-call limit",
   MATRIX_MAX_ELEMENTS <= GOOGLE_PER_CALL, `${MATRIX_MAX_ELEMENTS} vs ${GOOGLE_PER_CALL}`);
for (const group of groups) {
  const perCall = Math.floor(MATRIX_MAX_ELEMENTS / group.length);
  ok(`patch of ${group.length} splits into calls that fit`,
     perCall >= 1 && perCall * group.length <= GOOGLE_PER_CALL,
     `${perCall} destinations a call`);
}

// ——— stepsFor, which is where precision is decided ———
console.log("\n— the search depth —");
for (const group of groups) {
  const span = spanOf(group);
  const steps = stepsFor(span);
  const feet = (span / 2 ** steps) * 5280;
  ok(`a ${span.toFixed(0)}-mile span resolves to under 250 feet`, feet <= 250, `${feet.toFixed(0)}ft`);
  // ⚠️ And not far under, which would be quota spent on a boundary nobody can
  // see. One step less has to be too coarse, or the step count is padded.
  const coarser = (span / 2 ** (steps - 1)) * 5280;
  ok(`and one step fewer would not`, coarser > 250, `${coarser.toFixed(0)}ft`);
}
// A tight patch must not pay for a spread-out one. This is the saving that
// made Fullerton cheaper than the counters it is nowhere near.
if (groups.length > 1) {
  const depths = groups.map((group) => stepsFor(spanOf(group)));
  ok("a small patch searches less deeply than a wide one",
     Math.min(...depths) < Math.max(...depths), depths.join(","));
}

// ——— patches(), which decides how the counters divide ———
console.log("\n— the grouping —");
ok("every counter lands in exactly one patch",
   groups.reduce((sum, group) => sum + group.length, 0) === points.length,
   String(groups.reduce((sum, group) => sum + group.length, 0)));
// ⚠️ The property that makes per-patch origins correct. A counter in another
// patch is more than two radii away, so it can never be the nearest counter to
// any probe in this one — which is why dropping it from the call changes the
// cost and not the answer.
const touching = 2 * DELIVERY_RADIUS_MILES;
let separated = true;
groups.forEach((group, a) => {
  groups.forEach((other, b) => {
    if (a >= b) return;
    for (const here of group) {
      for (const there of other) if (milesBetween(here, there) < touching) separated = false;
    }
  });
});
ok("⚠️ separate patches are further apart than two radii, so dropping the" +
   " other patch's counters cannot change a distance", separated);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
