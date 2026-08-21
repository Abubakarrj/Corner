// Several overlapping loops, drawn as one outline.
//
// ——— ⚠️ What this is for ———
//
// The delivery map measures a ring around every counter and shows their union.
// Google unions the *fill* correctly and does not union the *stroke*, so nine
// counters drew nine outlines crossing each other — a picture of the algorithm
// rather than a picture of where the shop delivers.
//
// app/polygonUnion.ts computes the boundary properly. This is a geometry
// routine with no natural place to fail loudly: a wrong answer is a map that
// still draws, still looks like a shape, and is quietly the wrong shape. So the
// assertions are about the properties that make it right rather than about
// vertex counts, and each one names a way the union could be wrong while
// looking fine.

import { inRing, unionRings, type Ring } from "../app/polygonUnion";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

/** A regular polygon, wound the way deliveryArea winds its rings: bearing
 *  increasing, which on [lat, lng] is clockwise. */
function circle(centre: [number, number], radius: number, points = 36): Ring {
  return Array.from({ length: points }, (_, i) => {
    const angle = (i / points) * 2 * Math.PI;
    return [centre[0] + radius * Math.cos(angle), centre[1] + radius * Math.sin(angle)] as
      [number, number];
  });
}

/** Whether a point is inside any of these loops. */
const insideAny = (point: [number, number], rings: Ring[]) =>
  rings.some((ring) => inRing(point, ring));

// ——— The cases that must cost nothing ———
console.log("\n— nothing to do —");
ok("no rings is no rings", unionRings([]).length === 0);
const one = circle([0, 0], 1);
const alone = unionRings([one]);
ok("one ring comes back as itself", alone.length === 1 && alone[0] === one);
ok("a degenerate ring is dropped", unionRings([[[0, 0], [1, 1]]]).length === 0);

// ——— ⚠️ Two that overlap become one ———
//
// The case the map is full of: Koreatown and Larchmont are a mile and a half
// apart with ten-mile reaches.
console.log("\n— two overlapping —");
const a = circle([0, 0], 1);
const b = circle([0, 1], 1);
const joined = unionRings([a, b]);
ok("⚠️ they come back as one loop", joined.length === 1, `${joined.length} loops`);

// The properties that say the loop is the *union* and not something else that
// happens to be a single loop.
console.log("\n— and it is the right one —");
// Every point that was inside either circle is inside the result.
let missing = 0;
for (let x = -1.5; x <= 2.5; x += 0.05) {
  for (let y = -1.5; y <= 1.5; y += 0.05) {
    const point: [number, number] = [y, x];
    if (insideAny(point, [a, b]) && !insideAny(point, joined)) missing += 1;
  }
}
ok("⚠️ nothing that was covered has been lost", missing === 0, `${missing} points dropped`);
// And nothing that was outside both has been gained. This is the direction
// that matters on a delivery map: a union that grew would claim addresses the
// checkout refuses, which is the failure app/deliveryArea.ts is written around.
let gained = 0;
for (let x = -1.5; x <= 2.5; x += 0.05) {
  for (let y = -1.5; y <= 1.5; y += 0.05) {
    const point: [number, number] = [y, x];
    if (!insideAny(point, [a, b]) && insideAny(point, joined)) gained += 1;
  }
}
ok("⚠️ and nothing has been gained", gained === 0, `${gained} points added`);

// ⚠️ The seam is gone. The whole point of the exercise: no vertex of the result
// sits deep inside the other circle, because those are the arcs that were being
// drawn across the middle of the shape.
const buried = joined
  .flat()
  .filter((point) => {
    const inA = Math.hypot(point[0], point[1]) < 0.98;
    const inB = Math.hypot(point[0], point[1] - 1) < 0.98;
    return inA || inB;
  }).length;
ok("⚠️ no part of the outline runs through the inside", buried === 0,
   `${buried} buried vertices`);

// ——— Two that do not touch stay two ———
//
// San Clemente is thirty miles from anything. Joining it to the rest would draw
// a line across ground nobody serves, which is the same over-claim in a
// different shape.
console.log("\n— two apart —");
const far = unionRings([circle([0, 0], 1), circle([0, 10], 1)]);
ok("⚠️ separate loops stay separate", far.length === 2, `${far.length} loops`);
ok("and neither has grown",
   far.every((loop) => loop.every((p) => Math.hypot(p[0], p[1]) < 1.01 ||
     Math.hypot(p[0], p[1] - 10) < 1.01)));

// ——— A chain, which is the shape Los Angeles actually makes ———
console.log("\n— a chain of five —");
const chain = [0, 1, 2, 3, 4].map((i) => circle([0, i * 1.4], 1));
const linked = unionRings(chain);
ok("a chain of overlapping circles is one loop", linked.length === 1, `${linked.length} loops`);
let chainMissing = 0;
for (let x = -1.5; x <= 7; x += 0.05) {
  for (let y = -1.5; y <= 1.5; y += 0.05) {
    const point: [number, number] = [y, x];
    if (insideAny(point, chain) && !insideAny(point, linked)) chainMissing += 1;
  }
}
ok("⚠️ and covers everything the five did", chainMissing === 0, `${chainMissing} dropped`);

// ——— One inside another ———
//
// Two counters on the same block: the smaller reach is entirely inside the
// larger, and every one of its arcs is swallowed.
console.log("\n— one swallowed —");
const swallowed = unionRings([circle([0, 0], 2), circle([0, 0.2], 0.5)]);
ok("the inner ring contributes nothing", swallowed.length === 1, `${swallowed.length} loops`);
ok("and the outer one is unchanged in extent",
   Math.max(...swallowed[0].map((p) => Math.hypot(p[0], p[1]))) < 2.01);

// ——— The real arrangement ———
//
// Nine counters at their real spread, to prove the routine survives the input
// it exists for rather than only the tidy cases above.
console.log("\n— the shop's own shape —");
const counters: [number, number][] = [
  [34.0617, -118.3006], [34.0776, -118.3245], [34.06, -118.4432],
  [34.14, -118.39], [34.145, -118.1503], [33.8712, -117.9345],
  [33.759, -118.1293], [33.8573, -118.294], [33.4626, -117.6414],
];
// A tenth of a degree is about seven miles, so these overlap roughly the way
// ten-mile road reaches do.
const real = counters.map((c) => circle(c, 0.145));
const shape = unionRings(real);
console.log(`  ${real.length} rings → ${shape.length} loops, ` +
            `${shape.reduce((n, l) => n + l.length, 0)} vertices`);
ok("it produces some loops", shape.length > 0);
ok("⚠️ fewer than it was given, which is the entire point",
   shape.length < real.length, `${shape.length} vs ${real.length}`);
ok("San Clemente is still its own island",
   shape.some((loop) => loop.every((p) => p[0] < 33.7)), "the far south merged");
let realGained = 0;
for (let lat = 33.2; lat <= 34.4; lat += 0.02) {
  for (let lng = -118.7; lng <= -117.4; lng += 0.02) {
    const point: [number, number] = [lat, lng];
    if (!insideAny(point, real) && insideAny(point, shape)) realGained += 1;
  }
}
// ⚠️ The assertion that matters most on a published map: the union never
// claims ground none of the rings covered.
ok("⚠️ and it claims nothing the counters did not", realGained === 0,
   `${realGained} points gained`);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
