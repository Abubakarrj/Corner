// The published delivery boundary, measured by the real code.
//
// ——— Why this stubs the network and not the algorithm ———
//
// The first version of this test transcribed the binary search out of
// app/deliveryArea.ts so a fake ruler could drive it, and guarded the copy with
// string assertions against the real source. That guard worked — it was what
// caught a deliberate revert — but it is the wrong shape: a test that asserts
// a file still *contains* a line is checking spelling, and it passes happily
// while the surrounding logic rots.
//
// So nothing is transcribed. `fetch` is replaced, the real deliveryArea() runs,
// and Google is the only thing standing in. What comes back is straight-line
// distance from the nearest counter, which makes the true boundary a shape this
// test can compute independently and compare against — three exact circles,
// unioned. A road network makes that comparison impossible, which is precisely
// why the stub is a ruler.
//
// What this does NOT test is Routes itself: the field mask, the proto3 index
// quirk, the stopover flags. scripts/check-maps.mjs asks the live API those.

import { DELIVERY_RADIUS_MILES, LOCATIONS, milesBetween, type StoreLocation }
  from "../app/(marketing)/locations/locations";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

// ——— The stub ———
//
// Answers computeRouteMatrix in Google's own shape, with straight-line miles.
// Every origin against every destination, exactly as the real API does, so the
// running minimum in driveMatrixMin is genuinely exercised rather than handed a
// single number per point.
//
// Deliberately omits destinationIndex on element zero. That is the proto3 JSON
// behaviour the app has a note about — absent means the default — and getting
// it wrong pulls one bearing in forty-eight all the way to the shop, which is a
// notch in a published map. Nothing else in the suite covers it.
let matrixCalls = 0;
let elementsAsked = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.includes("computeRouteMatrix")) return realFetch(input as never, init as never);
  matrixCalls += 1;
  const body = JSON.parse(String(init?.body ?? "{}")) as {
    origins: { waypoint: { location: { latLng: { latitude: number; longitude: number } } } }[];
    destinations: typeof body.origins;
  };
  const point = (w: (typeof body.origins)[number]): [number, number] => [
    w.waypoint.location.latLng.latitude,
    w.waypoint.location.latLng.longitude,
  ];
  const origins = body.origins.map(point);
  const destinations = body.destinations.map(point);
  elementsAsked += origins.length * destinations.length;
  const elements: unknown[] = [];
  origins.forEach((o, oi) => {
    destinations.forEach((d, di) => {
      const miles = milesBetween(o, d);
      elements.push({
        ...(oi === 0 ? {} : { originIndex: oi }),
        ...(di === 0 ? {} : { destinationIndex: di }),
        distanceMeters: Math.round(miles * 1609.344),
        duration: `${Math.round(miles * 120)}s`,
        condition: "ROUTE_EXISTS",
      });
    });
  });
  return new Response(JSON.stringify(elements), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;

process.env.GOOGLE_MAPS_API_KEY = "test-key";

async function main() {
  // Imported after the key is set and fetch is replaced, so the module reads
  // the stubbed world on first use.
  const { deliveryArea, __resetDeliveryArea } = await import(
    "../app/deliveryArea"
  );
  __resetDeliveryArea();

  const area = await deliveryArea();
  ok("a boundary was measured", area !== null);
  if (!area) {
    console.log("\n1 FAILURES");
    process.exit(1);
  }

  const origins = LOCATIONS.filter((l) => l.delivery !== false).map((l) => l.position);
  console.log(`  ${area.origins.length} origins, ${area.ring.length} vertices, ` +
    `${matrixCalls} matrix calls, ${elementsAsked} elements`);

  // ——— It asked about every counter ———
  ok("every delivering counter is an origin", area.origins.length === origins.length,
     String(area.origins.length));
  ok("and the shape carries them all for the map to pin",
     area.origins.every((o) => origins.some((p) => milesBetween(o, p) < 0.01)));
  ok("the centre is not one of the counters",
     origins.every((p) => milesBetween(area.centre, p) > 0.01));
  ok("it stayed at seven calls, not one set per counter", matrixCalls === 7,
     String(matrixCalls));
  ok("asking three counters at once, not in sequence",
     elementsAsked === 7 * origins.length * area.ring.length,
     String(elementsAsked));

  // ——— Every vertex obeys the rule ———
  const reach = (p: [number, number]) => Math.min(...origins.map((o) => milesBetween(p, o)));
  const worst = Math.max(...area.ring.map(reach));
  ok("no vertex is outside the radius", worst <= DELIVERY_RADIUS_MILES, worst.toFixed(3));
  ok("and none is more than one search step inside it",
     worst > DELIVERY_RADIUS_MILES - 0.25, worst.toFixed(3));
  // ——— Every bearing, not just the best one ———
  //
  // The max above says the ring touches the boundary somewhere. The min says
  // it touches it everywhere, which is the assertion that catches a clipped
  // shape: with a straight-line ruler the union is three exact circles, so a
  // ray from the centre meets the edge whichever way it points. A search
  // ceiling set too low pulls the far bearings in and leaves the near ones
  // alone, and a maximum cannot see that.
  const least = Math.min(...area.ring.map(reach));
  ok("every bearing reaches the boundary, not just the nearest",
     least > DELIVERY_RADIUS_MILES - 0.25, least.toFixed(3));
  // The proto3 notch: bearing zero is the destination whose index is omitted.
  ok("bearing zero is not pulled in to the shop",
     reach(area.ring[0]) > DELIVERY_RADIUS_MILES - 0.25, reach(area.ring[0]).toFixed(3));

  // ——— It is the union, checked against one computed independently ———
  //
  // With a straight-line ruler the true boundary is four exact circles. Every
  // vertex should sit on the edge of the nearest one, and a point that only the
  // Studio City counter reaches should be inside the ring.
  function inside(point: [number, number], poly: [number, number][]): boolean {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const [yi, xi] = poly[i];
      const [yj, xj] = poly[j];
      if ((yi > point[0]) !== (yj > point[0]) &&
          point[1] < ((xj - xi) * (point[0] - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }
  const ven = LOCATIONS.find((l) => l.id === "ventura")!.position;
  const wil = LOCATIONS.find((l) => l.id === "wilshire")!.position;
  // North of Studio City: deep in the Valley, inside Ventura Blvd's reach and
  // outside Wilshire's. The counter furthest from the rest is the one that
  // makes "is this really a union" a question worth asking.
  const valley: [number, number] = (() => {
    for (let d = 0; d < 0.4; d += 0.001) {
      const p: [number, number] = [ven[0] + d, ven[1]];
      if (milesBetween(p, ven) <= DELIVERY_RADIUS_MILES - 0.5 &&
          milesBetween(p, wil) > DELIVERY_RADIUS_MILES) return p;
    }
    throw new Error("no such point");
  })();
  console.log(`  valley point: ${milesBetween(valley, ven).toFixed(1)}mi from Ventura Blvd, ` +
    `${milesBetween(valley, wil).toFixed(1)}mi from Wilshire`);
  ok("a point only the Studio City counter reaches is inside the drawn ring",
     inside(valley, area.ring));

  // And the far side of Wilshire, which only Wilshire reaches, is in it too —
  // so the union grew without losing what it already covered.
  const eastOfWilshire: [number, number] = (() => {
    for (let d = 0; d < 0.4; d += 0.001) {
      const p: [number, number] = [wil[0], wil[1] + d];
      if (milesBetween(p, wil) <= DELIVERY_RADIUS_MILES - 0.5 &&
          milesBetween(p, ven) > DELIVERY_RADIUS_MILES) return p;
    }
    throw new Error("no such point");
  })();
  ok("and a point only Wilshire reaches is still inside it",
     inside(eastOfWilshire, area.ring));

  // Somewhere outside every counter's reach must be outside the ring, or the
  // shape is not a boundary at all.
  //
  // ⚠️ South, not north. This walked north from Wilshire, which used to leave
  // every counter behind and now heads straight for Studio City — it would have
  // landed inside the ring and failed for the right reason with the wrong
  // explanation.
  const faraway: [number, number] = [wil[0] - 0.45, wil[1]];
  ok("a point beyond every counter is outside the ring", !inside(faraway, area.ring),
     reach(faraway).toFixed(1));

  // ——— The search interval reaches the far edge ———
  const spread = Math.max(...origins.map((p) => milesBetween(area.centre, p)));
  const furthest = Math.max(...area.ring.map((p) => milesBetween(area.centre, p)));
  ok("no vertex is pinned at the search ceiling",
     furthest < DELIVERY_RADIUS_MILES + spread - 0.05,
     `${furthest.toFixed(2)} of ${(DELIVERY_RADIUS_MILES + spread).toFixed(2)}`);

  // ——— And it is cached ———
  const before = matrixCalls;
  await deliveryArea();
  ok("a second read costs nothing", matrixCalls === before, String(matrixCalls));

  // ——— ⚠️ But not cached past the counter list ———
  //
  // The failure this catches, in the words it happened in: a counter opened and
  // did not show up as a pin on the published map. Nothing was wrong with the
  // measurement — the shape drawn before the shop existed was still inside its
  // window, and a cache that only expires on a clock has no way to know the
  // question changed.
  //
  // So opening a counter has to invalidate the shape by itself. Asserted on the
  // measurement actually re-running and on the new counter appearing in the
  // origins, because "the cache was cleared" is satisfied by a cache that
  // cleared and then measured the old list.
  const opened: StoreLocation = {
    id: "test-new-counter", name: "New", kind: "shop",
    address: "x", city: "Los Angeles, CA", hours: "x",
    position: [34.09, -118.36], aliases: [],
  };
  LOCATIONS.push(opened);
  try {
    const after = await deliveryArea();
    ok("opening a counter remeasures rather than serving the old shape",
       matrixCalls > before, `${matrixCalls} vs ${before}`);
    ok("and the new counter is one of the origins",
       (after?.origins ?? []).some((o) => milesBetween(o, opened.position) < 0.01),
       JSON.stringify(after?.origins));
  } finally {
    LOCATIONS.pop();
  }

  // And closing one invalidates it too, which is the same rule read backwards.
  const afterClose = matrixCalls;
  const closed = await deliveryArea();
  ok("closing it remeasures as well", matrixCalls > afterClose,
     `${matrixCalls} vs ${afterClose}`);
  ok("and the shape no longer reaches out to it",
     !(closed?.origins ?? []).some((o) => milesBetween(o, opened.position) < 0.01),
     JSON.stringify(closed?.origins));

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
