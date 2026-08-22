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
import {
  RESOLUTION_FLOOR,
  elementsFor,
  insetMilesFor,
  readMatrixQuota,
  resolutionFor,
  resolutionLadder,
  stepsFor,
} from "../app/deliveryArea";
import { MATRIX_MAX_ELEMENTS } from "../app/googleMaps";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

const counters = deliveringStores();
const { quota, from: quotaFrom } = readMatrixQuota();
const resolution = resolutionFor(counters.length, quota);
const steps = stepsFor(DELIVERY_RADIUS_MILES, resolution.targetFeet);

/** Elements for a rebuild with this many counters, at the rung that many can
 *  afford. Exact, not a ceiling: one origin per call, every probe asked once. */
const costOf = (shops: number) => elementsFor(resolutionFor(shops, quota), shops);

console.log("\n— today —");
console.log(`  ${counters.length} counters: ${counters.map((s) => s.name).join(", ")}`);
console.log(`  quota: ${quota} elements a minute` + {
  default: " (Google's default; ROUTES_MATRIX_QUOTA is unset)",
  env: " (from ROUTES_MATRIX_QUOTA)",
  ignored: ` (⚠️ ROUTES_MATRIX_QUOTA is set to "${process.env.ROUTES_MATRIX_QUOTA}",` +
    " which is not a usable number of elements, so it was ignored)",
}[quotaFrom]);
ok("⚠️ the quota in the environment was usable, or is not set at all",
   quotaFrom !== "ignored", `ROUTES_MATRIX_QUOTA="${process.env.ROUTES_MATRIX_QUOTA}"`);
console.log(`  each ring: ${resolution.bearings} bearings × ${steps} steps` +
            ` = ${resolution.bearings * steps} elements in ${steps} calls`);
const today = costOf(counters.length);
console.log(`  rebuild: ${today} elements in ${counters.length * steps} calls ` +
            `(${Math.round((today / quota) * 100)}% of a minute's quota)`);

// ——— ⚠️ The assertion the outage would have failed ———
console.log("\n— against the quota —");
ok("⚠️ a rebuild fits inside one minute's element quota",
   today < quota, `${today} vs ${quota}`);
// ⚠️ Headroom, not just "fits". A rebuild is a burst; every address check on
// the site shares the same per-minute allowance, and a deploy that restarts two
// instances has two cold caches. Ninety per cent is the line: past it the map
// works until something else happens in the same minute, which is the worst
// kind of working.
ok("and leaves headroom for the address checks sharing the quota",
   today <= quota * 0.9,
   `${today} is ${Math.round((today / quota) * 100)}% of ${quota}`);

// ——— ⚠️ The rung, which is chosen rather than written down ———
//
// resolutionFor picks the finest rung the budget carries, so the map gets
// better on its own when the quota is raised and coarser on its own when a
// counter opens. Both of those are improvements on what it used to do — draw
// nothing — and both are things somebody should be told about rather than left
// to notice.
const floorElements = elementsFor(RESOLUTION_FLOOR, counters.length);
const coarserThanFloor = insetMilesFor(resolution) > insetMilesFor(RESOLUTION_FLOOR);

// ⚠️ The best rung the budget can carry, worked out here rather than trusted.
// This is the assertion that survives whatever the quota is: picking a rung
// when a finer one was affordable is a bug in resolutionFor, and it is a
// different thing entirely from a quota that cannot afford a fine one.
const finerAffordable = resolutionLadder().filter(
  (rung) =>
    insetMilesFor(rung) < insetMilesFor(resolution) &&
    elementsFor(rung, counters.length) <= quota * 0.9,
);
ok("⚠️ no finer rung was affordable and passed over",
   finerAffordable.length === 0,
   finerAffordable.map((r) => `${r.bearings}@${elementsFor(r, counters.length)}`).join(", "));

// ——— ⚠️ Coarser than it used to be, and whose problem that is ———
//
// Two very different situations look identical from here, so they are told
// apart rather than collapsed into one red line:
//
//   the quota has been raised and the map is *still* coarse — something in the
//   code is wrong, and this fails;
//
//   the quota is Google's default and the shop has outgrown it — nothing in
//   the code can fix that, the fix is a console setting, and a test that stays
//   red until somebody does it is a test people learn to ignore.
//
// The second is a warning that names the action. It is not silent and it is not
// a failure.
if (coarserThanFloor) {
  const line =
    `${resolution.bearings}×${steps} draws a ${(insetMilesFor(resolution) * 5280).toFixed(0)}ft inset,` +
    ` against ${(insetMilesFor(RESOLUTION_FLOOR) * 5280).toFixed(0)}ft at` +
    ` ${RESOLUTION_FLOOR.bearings} bearings (${floorElements} elements, ` +
    `${Math.round((floorElements / quota) * 100)}% of this quota)`;
  if (quotaFrom === "default") {
    console.log(
      `\n  ⚠️ THE PUBLISHED MAP IS COARSER THAN IT USED TO BE.\n     ${line}` +
        `\n     ${counters.length} counters do not fit a finer rung inside Google's default` +
        ` quota, and no rung on the ladder would help — fewer bearings sag more` +
        ` than the extra search step gains.` +
        `\n     The fix is free and takes a minute: Routes API → Quotas →` +
        ` Compute Route Matrix elements per minute in the Cloud console, then` +
        ` set ROUTES_MATRIX_QUOTA to the new number.`,
    );
  } else {
    ok("⚠️ the rung in use is no coarser than the map drew before the ladder existed",
       false, line);
  }
} else {
  ok("⚠️ the rung in use is no coarser than the map drew before the ladder existed", true);
}

// ——— ⚠️ The counter that will need the console ———
//
// Linear growth is still growth, and the useful thing to publish is not "we are
// fine" but "which shop is the one that stops us being fine". Printed rather
// than only asserted, because it is a number somebody should read before
// signing a lease and not after a map goes blank.
console.log("\n— and the counters that have not opened yet —");
// ⚠️ What changes as counters open is no longer whether the map draws — it is
// how well. The number to watch is the rung, and the counter to watch for is
// the one that drops it below what is drawn today.
let firstCoarser = 0;
let firstBlank = 0;
const todayInset = insetMilesFor(resolution);
for (let shops = counters.length; shops <= counters.length + 8; shops += 1) {
  const rung = resolutionFor(shops, quota);
  const cost = costOf(shops);
  const inset = insetMilesFor(rung);
  const coarser = inset > todayInset;
  // ⚠️ Past the last rung there is nowhere left to fall. The ladder stops
  // protecting the map and the old failure comes back: a 429 mid-search and a
  // page with nothing on it.
  const overflows = cost > quota;
  if (firstCoarser === 0 && coarser) firstCoarser = shops;
  if (overflows && firstBlank === 0) firstBlank = shops;
  console.log(
    `  ${String(shops).padStart(2)} counters: ${String(cost).padStart(5)} elements` +
      ` (${String(Math.round((cost / quota) * 100)).padStart(3)}%)` +
      `  ${rung.bearings} bearings × ${stepsFor(DELIVERY_RADIUS_MILES, rung.targetFeet)} steps` +
      `  ${(inset * 5280).toFixed(0).padStart(4)}ft inset` +
      `${overflows ? "  ⚠️⚠️ OVER QUOTA — no map at all" : coarser ? "  ⚠️ coarser than today" : ""}`,
  );
}
console.log(
  firstCoarser
    ? `\n  ⚠️ Counter ${firstCoarser} makes the published map coarser than it is` +
        " today. It will still draw — the rung drops instead of the map going" +
        " blank — but the fix is free and takes a minute: raise Routes API →" +
        " Quotas → Compute Route Matrix elements per minute in the Cloud" +
        " console, then set ROUTES_MATRIX_QUOTA to the new number."
    : "\n  every projected count holds today's resolution.",
);
ok("the projection reaches far enough to find where the quota starts to bite",
   firstCoarser > 0,
   "nothing projected coarsens, so this table stopped being a warning");
if (firstBlank) {
  console.log(
    `  ⚠️⚠️ And counter ${firstBlank} is past the bottom of the ladder: there is no` +
      " coarser rung to fall to, so that one takes the map away entirely. The" +
      " console raise is not optional by then.",
  );
}

// ——— One call at a time ———
console.log("\n— and one call at a time —");
const GOOGLE_PER_CALL = 625;
ok("the app's per-call budget is inside Google's per-call limit",
   MATRIX_MAX_ELEMENTS <= GOOGLE_PER_CALL, `${MATRIX_MAX_ELEMENTS} vs ${GOOGLE_PER_CALL}`);
// ⚠️ One origin and `bearings` destinations, so a ring's step is that many
// elements and never needs splitting. Asserted for every rung, not just the one
// in use: a raised quota promotes the app to a finer rung with no code change,
// and a rung whose bearings exceed the per-call budget would start splitting
// calls — which doubles the call count without changing the element count, and
// is the sort of thing that only shows up as latency.
for (const rung of resolutionLadder()) {
  ok(`a ring's step at ${rung.bearings} bearings is one call, not several`,
     rung.bearings <= MATRIX_MAX_ELEMENTS, `${rung.bearings} vs ${MATRIX_MAX_ELEMENTS}`);
}

// ——— stepsFor, which is where precision is decided ———
console.log("\n— the search depth —");
const feet = (DELIVERY_RADIUS_MILES / 2 ** steps) * 5280;
ok("the radius resolves to at least as fine as the rung asked for",
   feet <= resolution.targetFeet, `${feet.toFixed(0)}ft vs ${resolution.targetFeet}ft asked`);
// ⚠️ And not far under, which would be quota spent on a boundary nobody can
// see. One step less has to be too coarse, or the step count is padded.
const oneFewer = (DELIVERY_RADIUS_MILES / 2 ** (steps - 1)) * 5280;
ok("and one step fewer would not", oneFewer > resolution.targetFeet, `${oneFewer.toFixed(0)}ft`);
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
const insetFeet = insetMilesFor(resolution) * 5280;
console.log(`\n— the inset —\n  ${resolution.bearings} bearings × ${steps} steps` +
            ` → ${insetFeet.toFixed(0)}ft pulled in`);
// A tenth of a mile on a ten-mile reach: about a pixel at the zoom the page
// opens on, and always on the side of telling somebody to check.
ok("the ring is drawn inside its measurement by under a tenth of a mile",
   insetFeet < 528, `${insetFeet.toFixed(0)}ft`);
// ⚠️ And by *something*. A zero inset means the polygon is drawn exactly on the
// measured vertices, and the straight edges between them then claim ground the
// rule refuses — which is the failure tests/deliveryArea.test.ts sweeps for.
//
// Deliberately not a floor in feet. It used to be "over 100ft", which was true
// of every rung that existed when it was written and is false of the finest one
// now: 90 bearings and 11 steps earn a 58ft inset, and that is the map being
// better rather than the check being violated.
ok("and by more than nothing", insetFeet > 0, `${insetFeet.toFixed(0)}ft`);

// ——— ⚠️ The ladder has to be ordered, or the wrong rung gets picked ———
//
// resolutionFor takes the *first* rung the budget can afford. That is only the
// best rung if the list runs finest to coarsest, and nothing about the shape of
// the data enforces it — a rung inserted in the wrong place would quietly cost
// the map resolution it had paid for. Ordering is the invariant, so assert it
// on the thing that actually measures fineness.
const ladder = resolutionLadder();
let ordered = true;
for (let i = 1; i < ladder.length; i += 1) {
  if (insetMilesFor(ladder[i]) <= insetMilesFor(ladder[i - 1])) ordered = false;
}
ok("the rungs run finest to coarsest, which is what makes the first affordable one the best",
   ordered,
   ladder.map((r) => `${r.bearings}→${(insetMilesFor(r) * 5280).toFixed(0)}ft`).join(", "));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
