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
// one minute's allowance. Three reasonable-looking changes multiplied:
//
//   4 counters, one ring from the centroid       1,344    the map drew
//   5 counters, one ring                         1,680    the map drew
//   6 counters, two rings, every counter asked
//     about every ring's probes                  5,184    over quota, no map
//
// ——— And why the arithmetic here is now simple ———
//
// The boundary is one ring per counter, searched from that counter with only
// that counter as the origin. So the whole rebuild is
//
//   BEARINGS × stepsFor(radius) × counters
//
// with no clustering, no centroid, and no multiplier that depends on where the
// shops happen to sit. That is the other reason the rewrite was worth doing:
// the old cost could not be worked out without knowing the geography, and a
// cost nobody can predict is a cost nobody checks.

import {
  DELIVERY_RADIUS_MILES,
  deliveringStores,
} from "../app/(marketing)/locations/locations";
import { BEARINGS, MATRIX_ELEMENT_QUOTA, stepsFor } from "../app/deliveryArea";
import { MATRIX_MAX_ELEMENTS } from "../app/googleMaps";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

const counters = deliveringStores();
const steps = stepsFor(DELIVERY_RADIUS_MILES);
const perRing = BEARINGS * steps;

/** Elements for a rebuild with this many counters. Exact, not a ceiling: one
 *  origin per call and every probe asked exactly once. */
const costOf = (shops: number) => shops * perRing;

console.log("\n— today —");
console.log(`  ${counters.length} counters: ${counters.map((s) => s.name).join(", ")}`);
console.log(`  each ring: ${BEARINGS} bearings × ${steps} steps = ${perRing} elements` +
            ` in ${steps} calls`);
const today = costOf(counters.length);
console.log(`  rebuild: ${today} elements in ${counters.length * steps} calls ` +
            `(${Math.round((today / MATRIX_ELEMENT_QUOTA) * 100)}% of a minute's quota)`);

// ——— ⚠️ The assertion the outage would have failed ———
console.log("\n— against the quota —");
ok("⚠️ a rebuild fits inside one minute's element quota",
   today < MATRIX_ELEMENT_QUOTA, `${today} vs ${MATRIX_ELEMENT_QUOTA}`);
// ⚠️ Headroom, not just "fits". A rebuild is a burst; every address check on
// the site shares the same per-minute allowance, and a deploy that restarts two
// instances has two cold caches. Ninety per cent is the line: past it the map
// works until something else happens in the same minute, which is the worst
// kind of working.
ok("and leaves headroom for the address checks sharing the quota",
   today < MATRIX_ELEMENT_QUOTA * 0.9,
   `${today} is ${Math.round((today / MATRIX_ELEMENT_QUOTA) * 100)}% of ${MATRIX_ELEMENT_QUOTA}`);

// ——— ⚠️ The counter that will need the console ———
//
// Linear growth is still growth, and the useful thing to publish is not "we are
// fine" but "which shop is the one that stops us being fine". Printed rather
// than only asserted, because it is a number somebody should read before
// signing a lease and not after a map goes blank.
console.log("\n— and the counters that have not opened yet —");
let firstOver = 0;
for (let shops = counters.length; shops <= counters.length + 8; shops += 1) {
  const cost = costOf(shops);
  const share = Math.round((cost / MATRIX_ELEMENT_QUOTA) * 100);
  const flag = cost >= MATRIX_ELEMENT_QUOTA * 0.9 ? "  ⚠️" : "";
  console.log(`  ${String(shops).padStart(2)} counters: ${cost} elements (${share}%)${flag}`);
  if (firstOver === 0 && cost >= MATRIX_ELEMENT_QUOTA * 0.9) firstOver = shops;
}
console.log(
  firstOver
    ? `\n  ⚠️ Counter ${firstOver} needs the Cloud console quota raised first.` +
        " It is free: Routes API → Quotas → Compute Route Matrix elements per" +
        " minute. Nothing in the code will do it and nothing but this line and" +
        " a blank map will mention it."
    : "\n  every projected count fits.",
);
ok("the projection reaches far enough to find the limit", firstOver > 0,
   "nothing projected goes over, so this table stopped being a warning");

// ——— One call at a time ———
console.log("\n— and one call at a time —");
const GOOGLE_PER_CALL = 625;
ok("the app's per-call budget is inside Google's per-call limit",
   MATRIX_MAX_ELEMENTS <= GOOGLE_PER_CALL, `${MATRIX_MAX_ELEMENTS} vs ${GOOGLE_PER_CALL}`);
// ⚠️ One origin and BEARINGS destinations, so a ring's step is BEARINGS
// elements and never needs splitting. Asserted so that raising BEARINGS past
// the budget is caught here rather than by a 400 in production.
ok("a ring's step is one call, not several",
   BEARINGS <= MATRIX_MAX_ELEMENTS, `${BEARINGS} vs ${MATRIX_MAX_ELEMENTS}`);

// ——— stepsFor, which is where precision is decided ———
console.log("\n— the search depth —");
const feet = (DELIVERY_RADIUS_MILES / 2 ** steps) * 5280;
ok("the radius resolves to under 250 feet", feet <= 250, `${feet.toFixed(0)}ft`);
// ⚠️ And not far under, which would be quota spent on a boundary nobody can
// see. One step less has to be too coarse, or the step count is padded.
const coarser = (DELIVERY_RADIUS_MILES / 2 ** (steps - 1)) * 5280;
ok("and one step fewer would not", coarser > 250, `${coarser.toFixed(0)}ft`);
ok("a narrower span needs fewer steps than a wider one",
   stepsFor(5) < stepsFor(20), `${stepsFor(5)} vs ${stepsFor(20)}`);
let monotonic = true;
for (let span = 1; span < 40; span += 1) {
  if (stepsFor(span + 1) < stepsFor(span)) monotonic = false;
}
ok("and a wider span never needs fewer", monotonic);

// ——— ⚠️ The chord margin, which is what BEARINGS buys ———
//
// Each ring is drawn inside its own measurement by the worst a straight edge
// can sag between two neighbouring rays. Fewer bearings is cheaper and sags
// more, so the two numbers trade against each other and the trade should be
// visible rather than buried in a constant.
const sag = 1 - Math.cos(Math.PI / BEARINGS);
const insetFeet = DELIVERY_RADIUS_MILES * (sag + 1 / 2 ** steps) * 5280;
console.log(`\n— the inset —\n  ${BEARINGS} bearings → ${insetFeet.toFixed(0)}ft pulled in`);
// A tenth of a mile on a ten-mile reach: about a pixel at the zoom the page
// opens on, and always on the side of telling somebody to check.
ok("the ring is drawn inside its measurement by under a tenth of a mile",
   insetFeet < 528, `${insetFeet.toFixed(0)}ft`);
// ⚠️ And by *something*. A zero inset means the polygon is drawn exactly on the
// measured vertices, and the straight edges between them then claim ground the
// rule refuses — which is the failure tests/deliveryArea.test.ts sweeps for.
ok("and by more than nothing", insetFeet > 100, `${insetFeet.toFixed(0)}ft`);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
