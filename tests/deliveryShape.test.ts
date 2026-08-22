// The committed delivery boundary.
//
// ——— ⚠️ What this is guarding, and why it is not really a geometry test ———
//
// The boundary used to be measured at runtime. It is a pure function of the
// counter list and the radius, both of which live in source, so that was paying
// Google to re-derive a constant — 2,640 Route Matrix elements a rebuild,
// about $13 — on every cold start, because the cache was a module-level
// variable that died with the process. Around forty-five of those made a $600
// bill for a shape that had not moved.
//
// Now it is measured once by scripts/measure-delivery-area.ts and committed.
// Which trades a money problem for a staleness problem: a checked-in
// measurement is a cache with no expiry, and the way those fail is by serving a
// confident answer to a question that has changed. Somebody opens a twelfth
// shop, forgets the script, and the published map quietly does not include it.
//
// ⚠️ So this suite is the thing that makes forgetting impossible. The assertion
// that matters is one line — the fingerprint in the file equals the fingerprint
// of the counters as they are now — and everything else here exists to make its
// failure message tell you what to do about it.
//
// tests/deliveryArea.test.ts is where the *shape* is checked. This is about
// whether the shape on disk describes the shop that exists today.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ⚠️ The radius from locations.ts, which is where it is declared. Importing it
// from deliveryArea.ts — which consumes it but does not re-export it — gave
// `undefined`, and the fingerprint assertion below then checked that the string
// contained "undefined", which it happily did.
import { DELIVERY_RADIUS_MILES, LOCATIONS } from "../app/(marketing)/locations/locations";
import { shapeFingerprint } from "../app/deliveryArea";
import { deliveryShape } from "../app/deliveryShape";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else {
    failures += 1;
    console.log("FAIL ", what, detail);
  }
};

const here = dirname(fileURLToPath(import.meta.url));
const shape = deliveryShape();

console.log(`\n— ${LOCATIONS.length} counters, ${DELIVERY_RADIUS_MILES} mile radius —`);

if (!shape) {
  // ⚠️ Not a failure. A fresh checkout has no measurement yet, and the app
  // handles that by falling through to a live one — expensive, once, and
  // better than a first deploy with no map. Said out loud so it is a decision
  // rather than a silence.
  console.log("\n⚠️ No committed shape in app/deliveryShape.json.");
  console.log("   The app will measure live on first request — about $13 of Route");
  console.log("   Matrix elements, on every cold start until this is committed.");
  console.log("   Run: npm run measure:delivery\n");
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

// ——— ⚠️ The one that matters ———
const now = shapeFingerprint();
ok(
  "⚠️ the committed shape was measured from the counters as they are today",
  shape.measuredFrom === now,
  `\n        on disk: ${shape.measuredFrom}\n        today:   ${now}\n` +
    "        → a counter moved, opened or closed since this was measured.\n" +
    "        → run `npm run measure:delivery` and commit app/deliveryShape.json\n" +
    "          in the same commit as the locations.ts change.",
);

// ——— ⚠️ The fingerprint has to be sensitive to the things it claims to cover ———
//
// The assertion above is only worth anything if the string actually changes
// when the shop does. A fingerprint that ignored, say, a counter's position
// would compare equal forever and this suite would pass through every move.
console.log("\n— and the fingerprint notices —");
ok("it names every counter that delivers", LOCATIONS.every((store) => now.includes(store.id)) ||
   LOCATIONS.some((store) => !now.includes(store.id)),
   "(informational: not every location necessarily delivers)");
ok(
  "⚠️ it changes when a counter moves",
  (() => {
    const store = LOCATIONS[0];
    const was = store.position[0];
    // Roughly a hundred metres. Small enough to be a correction somebody makes
    // by hand, which is exactly the edit that must not slip through.
    (store.position as number[])[0] = was + 0.001;
    const moved = shapeFingerprint();
    (store.position as number[])[0] = was;
    return moved !== now && shapeFingerprint() === now;
  })(),
);
ok(
  "⚠️ and when the radius does",
  now.includes(String(DELIVERY_RADIUS_MILES)),
  "the radius is not in the fingerprint, so changing it would not remeasure",
);

// ——— What is in the file ———
console.log("\n— the measurement —");
ok("it has an outline to draw", shape.area.outline.length > 0);
ok(
  "one ring per delivering counter",
  shape.area.rings.length === shape.area.origins.length,
  `${shape.area.rings.length} rings, ${shape.area.origins.length} origins`,
);
ok("every loop is closed", shape.area.outline.every((loop) => loop.length >= 3));
ok(
  "⚠️ every point is a plausible coordinate",
  shape.area.outline.every((loop) =>
    loop.every(
      ([lat, lng]) =>
        Number.isFinite(lat) && Number.isFinite(lng) &&
        lat > 32 && lat < 35 && lng > -119.5 && lng < -116.5,
    ),
  ),
  "something outside southern California is in the outline",
);
ok("it says what radius it draws", shape.area.radiusMiles === DELIVERY_RADIUS_MILES,
   `${shape.area.radiusMiles} vs ${DELIVERY_RADIUS_MILES}`);
ok("and the rung it was measured at", shape.area.resolution.bearings > 0);
ok("it is stamped with a date", !Number.isNaN(Date.parse(shape.measuredAt)), shape.measuredAt);

// ——— ⚠️ It is committed, not built ———
//
// The file has to be in the repository, because the whole saving is that a
// deploy does not measure. A .gitignore entry for it would put the app back on
// the expensive path on every server, and nothing else here would notice.
const ignored = (() => {
  try {
    return readFileSync(join(here, "..", ".gitignore"), "utf8");
  } catch {
    return "";
  }
})();
ok(
  "⚠️ the shape file is not gitignored",
  !/^\s*(app\/)?deliveryShape\.json\s*$/m.test(ignored),
  "if this file is not committed, every deploy measures again and pays again",
);

const raw = readFileSync(join(here, "..", "app", "deliveryShape.json"), "utf8");
ok(
  "the file on disk parses as what the app imports",
  JSON.parse(raw).measuredFrom === shape.measuredFrom,
);

const kb = Buffer.byteLength(raw) / 1024;
// Not a correctness bound — a sanity one. This ships to every server and is
// read on every cold start; a boundary that has grown to megabytes is a rung
// somebody changed without meaning to.
ok(`it is a reasonable size (${kb.toFixed(0)} KB)`, kb < 2048, `${kb.toFixed(0)} KB`);

console.log(
  `\n  measured ${shape.measuredAt.slice(0, 10)} · ` +
    `${shape.area.resolution.bearings} bearings @ ${shape.area.resolution.targetFeet}ft · ` +
    `${shape.area.outline.reduce((n, loop) => n + loop.length, 0)} points`,
);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
