// The delivery radius, now that it is a reach around every counter.
//
// The Maps calls are stubbed, because what is being tested is the arithmetic
// the app does around them: which origins get asked, whether the smallest
// answer is the one that counts, and whether a counter that cannot possibly be
// in range is offered as one. A real Route Matrix would test Google.

import { LOCATIONS, DELIVERY_RADIUS_MILES, milesBetween }
  from "../app/(marketing)/locations/locations";
import { kitchensFor } from "../app/storePlaces";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

const la = (hour: number) => new Date(Date.UTC(2026, 7, 19, hour + 7, 0));
const noon = la(12);

const wilshire = LOCATIONS.find((l) => l.id === "wilshire")!;
const figueroa = LOCATIONS.find((l) => l.id === "figueroa")!;
const western = LOCATIONS.find((l) => l.id === "western")!;

// ——— The reach is a union, and the union is bigger ———
//
// A point due south of the USC store: inside its ten miles, outside Wilshire's.
// This is the whole of what the change buys, expressed as one address.
// Found by walking rather than by a hand-picked offset: a degree of latitude
// is not a round number of miles, and the first version of this probe put the
// point at 11.1 miles and called the app wrong for agreeing.
const south: [number, number] = (() => {
  for (let d = 0; d < 0.4; d += 0.001) {
    const p: [number, number] = [figueroa.position[0] - d, figueroa.position[1]];
    if (
      milesBetween(p, figueroa.position) <= DELIVERY_RADIUS_MILES &&
      milesBetween(p, wilshire.position) > DELIVERY_RADIUS_MILES
    ) return p;
  }
  throw new Error("no such point");
})();
const toFig = milesBetween(south, figueroa.position);
const toWil = milesBetween(south, wilshire.position);
console.log(`  south point: ${toFig.toFixed(1)}mi from USC, ${toWil.toFixed(1)}mi from Wilshire`);
ok("it is inside the USC counter's reach", toFig <= DELIVERY_RADIUS_MILES);
ok("and outside Wilshire's, so one origin would have refused it",
   toWil > DELIVERY_RADIUS_MILES, toWil.toFixed(1));

// ——— A counter that cannot be in range is never offered ———
//
// Twenty miles out, where every counter is beyond the radius in a straight
// line and therefore beyond it by road. Nothing is filtered to nothing: the
// order is out of range whichever counter is named, and the quote is where
// that gets said with a road distance.
const faraway: [number, number] = [wilshire.position[0] + 0.30, wilshire.position[1]];
const farPool = kitchensFor([], noon, faraway);
ok("nothing survives being unreachable, so the pool is left whole",
   farPool.length === LOCATIONS.filter((l) => l.delivery !== false).length,
   farPool.map((s) => s.id).join(","));

// Eleven miles from Western but two from Wilshire: Western is provably out of
// range and must not be picked, however much the outlet preference likes it.
const nearWilshireFarWestern: [number, number] = [
  wilshire.position[0],
  wilshire.position[1] + 0.02,
];
const pool = kitchensFor(["single-bagel"], noon, nearWilshireFarWestern);
ok("a near address still uses the outlet when the outlet is near",
   pool.map((s) => s.id).join(",") === "western", pool.map((s) => s.id).join(","));

// Now a point 10.5 miles east of Western but 9.8 from Wilshire. Western is
// beyond the radius in a straight line, so it is beyond it by road, so it is
// not a candidate — and without the reachability filter the outlet preference
// would have chosen it and the quote would have refused the order.
const east: [number, number] = (() => {
  // Walk east from Wilshire until Western is out of radius and Wilshire is in.
  for (let d = 0; d < 0.5; d += 0.001) {
    const p: [number, number] = [wilshire.position[0], wilshire.position[1] + d];
    if (
      milesBetween(p, western.position) > DELIVERY_RADIUS_MILES &&
      milesBetween(p, wilshire.position) <= DELIVERY_RADIUS_MILES
    ) return p;
  }
  throw new Error("no such point");
})();
console.log(
  `  east point: ${milesBetween(east, western.position).toFixed(1)}mi from Western, ` +
    `${milesBetween(east, wilshire.position).toFixed(1)}mi from Wilshire`,
);
const eastPool = kitchensFor(["single-bagel"], noon, east).map((s) => s.id);
ok("an out-of-range outlet is not preferred", !eastPool.includes("western"), eastPool.join(","));
ok("and a counter that is in range is", eastPool.includes("wilshire"), eastPool.join(","));

// ——— No destination changes nothing ———
ok("with no destination the pool is unfiltered",
   kitchensFor([], noon).length === LOCATIONS.filter((l) => l.delivery !== false).length);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
