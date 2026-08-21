// The published boundary, against a Google that snaps waypoints to roads.
//
// ——— ⚠️ What this suite is about, and why the other one could not catch it ———
//
// tests/deliveryArea.test.ts stubs Routes with a straight-line ruler that
// answers about the point it was asked about. Real Routes does not. A waypoint
// is a coordinate, so it gets put on the nearest road first, and out in Santa
// Monica Bay that means the answer is about a road on the beach — returned as
// an ordinary success, with nothing in it to say the question was changed.
//
// The binary search read that as "in range" and pushed the ray further out, so
// the published map had the Pacific shaded in. No stub that never moves a
// waypoint can produce that, which is how it survived a suite that sweeps the
// boundary for over-claiming.
//
// So the stub here snaps. It has a coastline, it moves any destination in the
// water to the nearest shore point, and it answers about *that* — the way the
// thing it stands in for does.
//
// ⚠️ The simulated coastline is the app's own, which makes this blind to errors
// in that data by construction. tests/coastline.test.ts is what checks those,
// against places whose side of the line is not in question. What this suite
// answers is the other half: given water in a known place, does the boundary
// stay out of it?

import { DELIVERY_RADIUS_MILES, LOCATIONS, milesBetween }
  from "../app/(marketing)/locations/locations";
import {
  SEA_MARGIN_MILES,
  milesFromShoreline,
  pastTheShoreline,
  shoreline,
} from "../app/coastline";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else {
    failures += 1;
    console.log("FAIL ", what, detail);
  }
};

/** How far the simulated Routes will reach to put a waypoint on a road.
 *
 *  ⚠️ Swept rather than fixed, because Google does not publish it and the whole
 *  failure was shaped by it: the further it reaches, the further out to sea the
 *  old boundary walked — seventy-three square miles of ocean at two, a hundred
 *  and sixty at five. A fix that only works at one reach is a fix that lasts
 *  until Google tunes something.
 *
 *  Zero is the world the old code assumed: water simply refuses. */
const REACHES = [0, 1, 2, 5];

/** Road miles per straight-line mile. Los Angeles runs about 1.25 to 1.4, and
 *  the number matters: it is what decides whether a snapped answer comes back
 *  *shorter* than the straight line and gives itself away. A detour of 1.0
 *  would make the free check in deliveryArea.ts look far better than it is. */
const DETOUR = 1.3;

// The shore at a quarter mile, so "snap to the nearest road" has somewhere to
// snap to.
const SHORE: [number, number][] = [];
{
  const line = shoreline();
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i];
    const b = line[i + 1];
    const steps = Math.max(1, Math.ceil(milesBetween(a, b) / 0.25));
    for (let s = 0; s < steps; s += 1) {
      SHORE.push([a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps]);
    }
  }
  SHORE.push(line[line.length - 1]);
}

function nearestShore(point: [number, number]): [number, number] {
  let best = SHORE[0];
  let bestMiles = Infinity;
  for (const s of SHORE) {
    const miles = milesBetween(point, s);
    if (miles < bestMiles) {
      bestMiles = miles;
      best = s;
    }
  }
  return best;
}

/** ⚠️ The simulated ocean starts at the shoreline, not at the app's margin.
 *
 *  Sharing the margin would be handing the app its own answer: the band it
 *  knowingly shades would come out as land in the stub too, and the one cost
 *  this change accepts would be invisible instead of measured. */
const isWater = pastTheShoreline;

let reach = REACHES[0];
let elements = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.includes("computeRouteMatrix")) return realFetch(input as never, init as never);
  const body = JSON.parse(String(init?.body ?? "{}")) as {
    origins: { waypoint: { location: { latLng: { latitude: number; longitude: number } } } }[];
    destinations: { waypoint: { location: { latLng: { latitude: number; longitude: number } } } }[];
  };
  const point = (w: (typeof body.origins)[number]): [number, number] => [
    w.waypoint.location.latLng.latitude,
    w.waypoint.location.latLng.longitude,
  ];
  const origins = body.origins.map(point);
  const destinations = body.destinations.map(point);
  elements += origins.length * destinations.length;
  const out: unknown[] = [];
  origins.forEach((origin, oi) => {
    destinations.forEach((destination, di) => {
      const head = {
        ...(oi === 0 ? {} : { originIndex: oi }),
        ...(di === 0 ? {} : { destinationIndex: di }),
      };
      let target = destination;
      if (isWater(destination)) {
        const shore = nearestShore(destination);
        // Too far from any road even for Routes. This is the one case the old
        // code handled, and it is why the boundary looked right off Malibu and
        // wrong off Long Beach.
        if (milesBetween(destination, shore) > reach) {
          out.push({ ...head, condition: "ROUTE_NOT_FOUND" });
          return;
        }
        target = shore;
      }
      const miles = milesBetween(origin, target) * DETOUR;
      out.push({
        ...head,
        distanceMeters: Math.round(miles * 1609.344),
        duration: `${Math.round(miles * 120)}s`,
        condition: "ROUTE_EXISTS",
      });
    });
  });
  return new Response(JSON.stringify(out), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;

process.env.GOOGLE_MAPS_API_KEY = "test-key";

function inLoop(p: [number, number], loop: [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
    const [yi, xi] = loop[i];
    const [yj, xj] = loop[j];
    if (yi > p[0] !== yj > p[0] && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Google's own fill rule: overlapping paths fill, opposite-wound ones cut
 *  holes. The same helper tests/polygonUnion.test.ts uses, for the same reason
 *  — a sweep of the published shape has to ask what Google paints, not what an
 *  even-odd rule would. */
function filled(p: [number, number], loops: [number, number][][]): boolean {
  let winding = 0;
  for (const loop of loops) {
    if (!inLoop(p, loop)) continue;
    let twice = 0;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
      twice += loop[j][1] * loop[i][0] - loop[i][1] * loop[j][0];
    }
    winding += twice > 0 ? 1 : -1;
  }
  return winding !== 0;
}

// How far past the shoreline the boundary may get: the margin the coastline is
// deliberately generous by, plus the half search step the ring is drawn inside
// its own measurement. Anything beyond that is the search walking into the sea.
const ALLOWED = SEA_MARGIN_MILES + 0.25;
const STEP = 0.004; // about a quarter mile
const CELL_SQ_MILES = STEP * 69 * (STEP * 69 * Math.cos((33.8 * Math.PI) / 180));

async function main() {
  // ——— ⚠️ The free half of the fix, on its own ———
  //
  // A road route is never shorter than the straight line, so a distance under
  // it proves the far end of the route is not where the probe was put. That
  // holds everywhere, not only at the coast, and it is the only thing standing
  // between the search and a probe that snapped across a reservoir or a closed
  // range — places with no coastline to consult.
  //
  // Asserted here because the sweep below cannot reach it: on the coast the
  // coastline decides first, so deleting this check leaves every integration
  // assertion in this file passing. It did, when that was tried.
  const { looksSnapped } = await import("../app/deliveryArea");
  ok("a route the length of the straight line is not snapped", !looksSnapped(4, 4));
  ok("a route longer than the straight line is not snapped", !looksSnapped(5.2, 4));
  ok("a route a mile shorter than the straight line is snapped", looksSnapped(3, 4));
  ok(
    "⚠️ a shortfall inside the slack is not snapped, because geodesics disagree",
    !looksSnapped(3.99, 4),
  );
  ok("a zero-length probe is not snapped", !looksSnapped(0, 0));

  // ⚠️ The premise. A counter in the stub's ocean would have every probe
  // refused, and everything below would be measuring the coastline rather than
  // the code that reads it.
  const wet = LOCATIONS.filter((store) => isWater(store.position));
  ok("every counter is on dry land", wet.length === 0, wet.map((s) => s.id).join(", "));

  const { deliveryArea, __resetDeliveryArea } = await import("../app/deliveryArea");

  for (const r of REACHES) {
    reach = r;
    elements = 0;
    __resetDeliveryArea();
    const area = await deliveryArea();
    if (!area) {
      ok(`a boundary was measured with a ${r} mile reach`, false);
      continue;
    }

    const vertices = area.rings.flat();
    const worstVertex = vertices
      .filter(isWater)
      .reduce((worst, v) => Math.max(worst, milesFromShoreline(v)), 0);
    ok(
      `reach ${r} mi: no ring vertex is out at sea`,
      worstVertex <= ALLOWED,
      `furthest ${worstVertex.toFixed(2)} mi past the shoreline`,
    );

    // The shape the map actually paints, on a quarter-mile grid.
    const lats = area.outline.flat().map((p) => p[0]);
    const lngs = area.outline.flat().map((p) => p[1]);
    let shaded = 0;
    let beyond = 0;
    let worst = 0;
    for (let lat = Math.min(...lats); lat <= Math.max(...lats); lat += STEP) {
      for (let lng = Math.min(...lngs); lng <= Math.max(...lngs); lng += STEP) {
        const p: [number, number] = [lat, lng];
        if (!isWater(p) || !filled(p, area.outline)) continue;
        shaded += 1;
        const out = milesFromShoreline(p);
        if (out > worst) worst = out;
        if (out > ALLOWED) beyond += 1;
      }
    }
    ok(
      `reach ${r} mi: nothing past the margin is shaded as delivered`,
      beyond === 0,
      `${(beyond * CELL_SQ_MILES).toFixed(1)} sq mi, furthest ${worst.toFixed(2)} mi out`,
    );
    console.log(
      `      ${elements} elements | ${area.rings.length} rings → ${area.outline.length} loops` +
        ` | ${(shaded * CELL_SQ_MILES).toFixed(1)} sq mi of water inside the margin`,
    );
  }

  // ——— ⚠️ And the other direction: it must not eat the land ———
  //
  // Every assertion above is satisfied by a map that draws nothing at all. So
  // the coastal counters have to still cover their own neighbourhoods, at every
  // reach — including the ones where most of their probes are being refused.
  const coastal = LOCATIONS.filter(
    (store) => store.kind === "shop" && milesFromShoreline(store.position) < 6,
  );
  ok("there are coastal counters to check", coastal.length >= 2, `${coastal.length} found`);

  for (const r of REACHES) {
    reach = r;
    __resetDeliveryArea();
    const area = await deliveryArea();
    if (!area) continue;
    for (const store of coastal) {
      // A mile inland of the counter, which is unambiguously served: it is well
      // under the radius and it is not in the water.
      const inland: [number, number] = [store.position[0] + 0.014, store.position[1] + 0.014];
      const served =
        !isWater(inland) &&
        milesBetween(store.position, inland) < DELIVERY_RADIUS_MILES &&
        filled(inland, area.outline);
      ok(`reach ${r} mi: ${store.id} still covers the block inland of it`, served);
    }
  }

  console.log(failures === 0 ? "\nAll good." : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
