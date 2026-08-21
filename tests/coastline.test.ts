// The coastline data, checked against places whose side of it is not in doubt.
//
// ——— ⚠️ Why this suite is a list of neighbourhoods ———
//
// app/coastline.ts is the one file in this app that is *data* rather than
// logic: a hundred and sixteen points traced off a public shoreline. Logic can
// be argued about from first principles; a table of coordinates can only be
// checked against the world. So this is the world, written down — beach blocks
// that are certainly land, open water that is certainly not, and the counters
// themselves, which had better be on the dry side of it.
//
// ⚠️ The two directions are not equally bad, and the assertions are written to
// say so. A point of real land called water takes a neighbourhood off the
// published map. A point of water called land shades a sliver of sea. The first
// is a bug, the second is the margin doing its job.
//
// tests/deliveryOcean.test.ts is the other half: this checks the map of the
// coast, that one checks that the boundary actually stops at it.

import { LOCATIONS, milesBetween } from "../app/(marketing)/locations/locations";
import {
  SEA_MARGIN_MILES,
  inThePacific,
  milesFromShoreline,
  pacificRing,
} from "../app/coastline";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else {
    failures += 1;
    console.log("FAIL ", what, detail);
  }
};

// ——— ⚠️ Land. Every one of these is somewhere a courier can drive to ———
//
// Chosen to be *near* the line rather than safely inland, because a coastline
// test made of points ten miles from the coast would pass with the data
// deleted. Several of these are on sand spits and made ground, which is where
// a generalised shoreline is most likely to be wrong.
const LAND: [string, [number, number]][] = [
  ["Venice Beach", [33.985, -118.472]],
  ["Marina del Rey", [33.98, -118.45]],
  ["Playa del Rey", [33.96, -118.44]],
  ["Manhattan Beach", [33.8847, -118.405]],
  ["Hermosa Beach", [33.862, -118.401]],
  ["Redondo Beach", [33.845, -118.388]],
  ["Point Vicente", [33.742, -118.409]],
  ["Rancho Palos Verdes", [33.744, -118.387]],
  ["San Pedro", [33.7361, -118.287]],
  ["Terminal Island", [33.753, -118.248]],
  ["Pier 400", [33.735, -118.238]],
  ["Port of Long Beach, Pier J", [33.742, -118.183]],
  ["Naples Island", [33.754, -118.12]],
  ["Belmont Shore", [33.7596, -118.1265]],
  ["Alamitos Bay", [33.746, -118.114]],
  ["Seal Beach", [33.7414, -118.1048]],
  ["Sunset Beach", [33.718, -118.073]],
  ["Bolsa Chica", [33.695, -118.045]],
  ["Huntington Beach", [33.66, -117.999]],
  ["Lido Isle", [33.612, -117.92]],
  ["Balboa Peninsula", [33.5980, -117.89]],
  ["Dana Point harbour", [33.46, -117.698]],
  ["San Clemente pier", [33.42, -117.615]],
  ["Santa Monica", [34.01, -118.494]],
];

// ——— Open water ———
//
// Far enough out that no amount of margin should rescue them, and spread along
// the whole run so a coastline that is right in one county and wrong in the
// next cannot pass.
const WATER: [string, [number, number]][] = [
  ["off Malibu", [34.0, -118.75]],
  ["Santa Monica Bay", [34.01, -118.56]],
  ["off Manhattan Beach", [33.88, -118.47]],
  ["off Point Vicente", [33.72, -118.48]],
  ["San Pedro Bay", [33.68, -118.2]],
  ["off Huntington Beach", [33.62, -118.03]],
  ["off Newport", [33.56, -117.93]],
  ["off Dana Point", [33.41, -117.75]],
  ["off San Clemente", [33.39, -117.66]],
];

for (const [name, point] of LAND) {
  ok(`${name} is land`, !inThePacific(point));
}
for (const [name, point] of WATER) {
  ok(`${name} is water`, inThePacific(point));
}

// ⚠️ The premise the whole delivery map rests on. A counter in the water would
// have every one of its probes refused and its ring would vanish.
for (const store of LOCATIONS) {
  ok(`the ${store.id} counter is on land`, !inThePacific(store.position));
}

// ——— ⚠️ The ring has to be simple ———
//
// Point-in-polygon on a self-crossing ring is not wrong so much as meaningless:
// the "inside" flips at every crossing, so a stretch of open sea can come back
// as land with nothing in the output to suggest anything went wrong. Two
// hundred segments is nothing to check exhaustively, and the data is only ever
// edited by hand.
function crosses(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
): boolean {
  const side = (p: [number, number], q: [number, number], r: [number, number]) =>
    (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
  const d1 = side(a, b, c);
  const d2 = side(a, b, d);
  const d3 = side(c, d, a);
  const d4 = side(c, d, b);
  return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0;
}

const ring = pacificRing();

/** Inside the ocean ring, ignoring the margin and the named harbour — which is
 *  the question "did the coastline data swallow this?" rather than "does the
 *  app call it water?". */
function inRingOnly(point: [number, number]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (
      yi > point[0] !== yj > point[0] &&
      point[1] < ((xj - xi) * (point[0] - yi)) / (yj - yi) + xi
    ) {
      hit = !hit;
    }
  }
  return hit;
}
let selfCrossings = 0;
for (let i = 0; i < ring.length; i += 1) {
  for (let j = i + 1; j < ring.length; j += 1) {
    if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue;
    if (crosses(ring[i], ring[(i + 1) % ring.length], ring[j], ring[(j + 1) % ring.length])) {
      selfCrossings += 1;
    }
  }
}
ok("the ocean ring does not cross itself", selfCrossings === 0, `${selfCrossings} crossings`);

// ⚠️ The closing corners are supposed to be out in open sea where nothing the
// shop can reach will ever be tested against them. If a counter got close to
// one, the straight lines between the corners would start deciding whether real
// addresses are in the water.
const corners = ring.slice(-3);
const nearestCounter = Math.min(
  ...corners.flatMap((corner) => LOCATIONS.map((store) => milesBetween(corner, store.position))),
);
ok(
  "the closing corners are far out to sea",
  nearestCounter > 25,
  `nearest counter is ${nearestCounter.toFixed(1)} mi from a corner`,
);

// ——— ⚠️ The margin, and how much room is left in it ———
//
// A land point *outside* the ocean ring is safe whatever the margin is: the
// coastline was drawn seaward of it. The margin only matters for land the ring
// swallows, and for those it is the whole defence — so it has to be bigger than
// the worst of them, and the gap is worth printing rather than assuming.
//
// The port is excluded because the margin is not what saves it. Landfill put it
// nearly two miles past a shoreline drawn before the landfill existed, and no
// margin that wide would leave any ocean to remove. It is named instead.
const isPort = (name: string) => /Terminal Island|Pier|Port of/.test(name);
const swallowed = LAND.filter(
  ([name, point]) => !isPort(name) && inRingOnly(point),
).map(([name, point]) => ({ name, out: milesFromShoreline(point) }));
const worst = swallowed.reduce((w, s) => (s.out > w.out ? s : w), { name: "none", out: 0 });

ok(
  "the margin covers every land spot-check the coastline swallows",
  worst.out < SEA_MARGIN_MILES,
  `${worst.name} is ${worst.out.toFixed(2)} mi out, margin is ${SEA_MARGIN_MILES}`,
);
console.log(
  `\n— the margin —\n  sea starts ${SEA_MARGIN_MILES} mi past the drawn shoreline` +
    `\n  ${swallowed.length} land spot-checks fall inside the coastline; ` +
    `worst is ${worst.name} at ${worst.out.toFixed(2)} mi` +
    `\n  room left: ${(SEA_MARGIN_MILES - worst.out).toFixed(2)} mi`,
);

console.log(failures === 0 ? "\nAll good." : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
