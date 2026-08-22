// Measure the delivery boundary once, and commit the answer.
//
// ——— ⚠️ Run this when you open, close or move a counter ———
//
//     npm run measure:delivery
//
// It needs GOOGLE_MAPS_API_KEY (from .env.local or the environment) and it
// spends real money: about 2,640 Route Matrix elements, roughly $13 at the
// Essentials rate. That is the whole point. It used to be spent on every cold
// start, by a cache that lived in a module-level variable and died with the
// process — around forty-five times in a month, for a shape that had not moved.
// Now it is spent deliberately, by a person, when the thing it measures has
// actually changed.
//
// ⚠️ It writes app/deliveryShape.json. Commit that file with the change to
// locations.ts that made it necessary, in the same commit — a shop opening and
// its boundary are one fact, and splitting them across two commits is how the
// map ends up describing a shop list that no longer exists.
//
// ——— What it will refuse to do ———
//
// Overwrite a good measurement with a bad one. If Routes cannot answer, or the
// shape comes back with no outline, it exits non-zero and leaves the committed
// file alone. A boundary is what tells somebody whether this shop delivers to
// them; an empty one is not a smaller version of that answer, it is a map that
// says nobody is covered.

import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "app", "deliveryShape.json");

// .env.local, if there is one, without a dependency to parse it. Same five
// lines as scripts/check-maps.mjs, and the same reason.
try {
  for (const line of readFileSync(join(here, "..", ".env.local"), "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // No .env.local. The variable is expected in the environment.
}

// ⚠️ Before the imports below run. deliveryArea() reads this at module scope to
// decide whether to serve the committed shape or measure, and the whole purpose
// of this script is to force the measurement.
process.env.DELIVERY_AREA_LIVE = "1";

const { deliveryArea, shapeFingerprint, elementsFor, resolutionFor } = await import(
  "../app/deliveryArea"
);
const { LOCATIONS } = await import("../app/(marketing)/locations/locations");
const { googleMapsKey } = await import("../app/googleMaps");

async function main() {
  if (!googleMapsKey()) {
    console.error("\nNo GOOGLE_MAPS_API_KEY. This script measures against Google Routes.\n");
    process.exit(1);
  }

  const counters = LOCATIONS.length;
  const rung = resolutionFor(counters);
  const elements = elementsFor(rung, counters);
  console.log(`\nMeasuring the boundary for ${counters} counters.`);
  console.log(`  ${rung.bearings} bearings, ${rung.targetFeet}ft target`);
  console.log(`  ⚠️ about ${elements.toLocaleString()} Route Matrix elements — this costs money.\n`);

  const started = Date.now();
  const area = await deliveryArea();
  const took = ((Date.now() - started) / 1000).toFixed(1);

  // ⚠️ Refuse rather than overwrite. See the header.
  if (!area) {
    console.error(`Routes did not answer after ${took}s. Nothing written.\n`);
    process.exit(1);
  }
  if (!Array.isArray(area.outline) || area.outline.length === 0) {
    console.error(`The measurement came back with no outline. Nothing written.\n`);
    process.exit(1);
  }

  const shape = {
    measuredFrom: shapeFingerprint(),
    measuredAt: new Date().toISOString(),
    area,
  };
  writeFileSync(OUT, `${JSON.stringify(shape, null, 2)}\n`);

  const points = area.outline.reduce((sum, loop) => sum + loop.length, 0);
  const kb = (Buffer.byteLength(JSON.stringify(shape)) / 1024).toFixed(0);
  console.log(`Measured in ${took}s.`);
  console.log(`  ${area.outline.length} loop(s), ${points} points, ${area.rings.length} rings`);
  console.log(`  written to app/deliveryShape.json (${kb} KB)`);
  console.log(`\n⚠️ Commit it with the locations.ts change that made it necessary.\n`);
  process.exit(0);
}

void main();
