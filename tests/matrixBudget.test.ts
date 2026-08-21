// The delivery boundary against Google's limit on one Route Matrix call.
//
// ——— ⚠️ The failure this exists to stop ———
//
// One computeRouteMatrix call may carry 625 elements, origins × destinations.
// Go over and the whole call is a 400, and the contour's response to a failed
// call is to return no shape — so /delivery-areas draws no map, the page says
// nothing about why, and the address check underneath goes on working. The
// shop finds out by looking.
//
// The trigger is opening a counter. Nothing about that act looks like it
// touches a Google quota, and the arithmetic that decides it is three numbers
// in two files: how many counters deliver, how many separate patches they fall
// into, and BEARINGS. Six counters in two patches is 6 × 96 = 576, which is
// inside the limit by less than one more counter.
//
// So this suite is about the size of the request the shop's own location list
// produces, checked against the budget the code splits on. It fails on a
// deployment, in a repository, before it fails on a public page.

import {
  DELIVERY_RADIUS_MILES,
  deliveringStores,
  milesBetween,
} from "../app/(marketing)/locations/locations";
import { BEARINGS, STEPS, patches } from "../app/deliveryArea";
import { MATRIX_MAX_ELEMENTS } from "../app/googleMaps";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

// Google's number, written here rather than imported, so this suite disagrees
// with the app if somebody edits the app's budget upward.
const GOOGLE_LIMIT = 625;

const counters = deliveringStores();
const points = counters.map((store) => store.position);
const groups = patches(points);

console.log("\n— what the shop's own list asks for —");
console.log(`  ${counters.length} counters: ${counters.map((s) => s.name).join(", ")}`);
groups.forEach((group, index) => {
  const names = group.map((point) => counters.find((s) => s.position === point)?.name ?? "?");
  console.log(`  patch ${index}: ${names.join(" + ")}`);
});

const probes = groups.length * BEARINGS;
const elements = counters.length * probes;
console.log(`  ${probes} probes per step, ${elements} elements if sent in one call`);

// ——— ⚠️ The budget the app splits on ———
console.log("\n— the budget —");
ok("the app's budget is inside Google's limit",
   MATRIX_MAX_ELEMENTS <= GOOGLE_LIMIT, `${MATRIX_MAX_ELEMENTS} vs ${GOOGLE_LIMIT}`);
// ⚠️ Not decoration. A budget below the number of counters would make the
// per-call destination count zero, and the split would loop forever or send
// empty calls. Six counters against a budget of 600 is 100 destinations a call.
ok("and comfortably above the number of counters",
   MATRIX_MAX_ELEMENTS > counters.length * 4, String(MATRIX_MAX_ELEMENTS));

const perCall = Math.floor(MATRIX_MAX_ELEMENTS / counters.length);
const calls = Math.ceil(probes / perCall);
console.log(`  ${perCall} destinations a call, so ${calls} call(s) a step, ` +
            `${calls * STEPS} for a rebuild`);
ok("every call stays inside the budget",
   perCall * counters.length <= MATRIX_MAX_ELEMENTS,
   String(perCall * counters.length));
ok("and inside Google's limit", perCall * counters.length <= GOOGLE_LIMIT);

// ——— ⚠️ The shape that would have broken, unsplit ———
//
// Written as an explicit list rather than as "today's numbers are fine",
// because today's numbers being fine is exactly what a shop reads right before
// opening the counter that breaks them. Each row is a plausible next step for
// this business.
console.log("\n— and the ones the shop is one decision away from —");
const futures: [string, number, number][] = [
  ["today", counters.length, groups.length],
  ["one more counter in LA", counters.length + 1, groups.length],
  ["one more counter, somewhere new", counters.length + 1, groups.length + 1],
  ["ten counters in four patches", 10, 4],
  ["twenty counters in six patches", 20, 6],
];
for (const [label, shops, patchCount] of futures) {
  const wanted = shops * patchCount * BEARINGS;
  const split = Math.floor(MATRIX_MAX_ELEMENTS / shops);
  ok(`${label}: split into calls that fit`,
     split >= 1 && split * shops <= GOOGLE_LIMIT,
     `${wanted} elements, ${split} destinations a call`);
}

// The one that documents why the split had to happen at all: two of those
// shapes are over Google's limit as a single call, and one of them is only one
// shop away.
const overs = futures.filter(([, shops, patchCount]) => shops * patchCount * BEARINGS > GOOGLE_LIMIT);
console.log("\n— unsplit, these would have been a 400 and a blank map —");
overs.forEach(([label, shops, patchCount]) =>
  console.log(`  ${label}: ${shops * patchCount * BEARINGS} elements`));
ok("⚠️ at least one plausible next counter breaks the unsplit call",
   overs.length > 0, "nothing near the limit, which makes this suite pointless");

// ——— patches(), which decides the multiplier ———
console.log("\n— the grouping —");
ok("every counter lands in exactly one patch",
   groups.reduce((sum, group) => sum + group.length, 0) === points.length,
   String(groups.reduce((sum, group) => sum + group.length, 0)));
// ⚠️ The property the ray search depends on: two counters in different patches
// must be further apart than twice the radius, or a ray leaving one patch can
// re-enter the other and the single ring drawn for it would span ground nobody
// serves. Checked here rather than assumed, because it is the reason the
// element count is a multiple of the patch count in the first place.
const touching = 2 * DELIVERY_RADIUS_MILES;
let separated = true;
groups.forEach((group, a) => {
  groups.forEach((other, b) => {
    if (a >= b) return;
    for (const here of group) {
      for (const there of other) {
        if (milesBetween(here, there) < touching) separated = false;
      }
    }
  });
});
ok("separate patches really are further apart than two radii", separated);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
