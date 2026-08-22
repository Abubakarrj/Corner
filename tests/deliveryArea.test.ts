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
let biggestCall = 0;
let pointlessOrigins = 0;
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
  biggestCall = Math.max(biggestCall, origins.length * destinations.length);
  // ⚠️ Every origin this call carried that could not possibly be the nearest
  // counter to any of its destinations. A counter more than the radius away in
  // a straight line is further than that by road, so it can never bring a
  // probe into range: asking about it is elements spent on an answer that is
  // already known. This is what took the map down — see the header of
  // tests/matrixBudget.test.ts.
  for (const o of origins) {
    if (destinations.every((d) => milesBetween(o, d) > DELIVERY_RADIUS_MILES)) {
      pointlessOrigins += 1;
    }
  }
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
  const { deliveryArea, __resetDeliveryArea, MATRIX_ELEMENT_QUOTA } = await import(
    "../app/deliveryArea"
  );
  __resetDeliveryArea();

  const area = await deliveryArea();
  ok("a boundary was measured", area !== null);
  if (!area) {
    console.log("\n1 FAILURES");
    process.exit(1);
  }

  // ⚠️ The shape is several loops now, not one — the counters stopped forming
  // a single connected patch when Fullerton opened. `vertices` is every point
  // on every loop, for the assertions that are about the boundary; insideAny()
  // is for the ones about whether somewhere is covered.
  const vertices = area.rings.flat();
  function inLoop(point: [number, number], poly: [number, number][]): boolean {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const [yi, xi] = poly[i];
      const [yj, xj] = poly[j];
      if ((yi > point[0]) !== (yj > point[0]) &&
          point[1] < ((xj - xi) * (point[0] - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }
  // ⚠️ The *outline*, not the per-counter rings. Everything below that asks
  // "is this covered" is asking about the shape the map draws and the page
  // publishes, and that is the union — so the sweep that decides whether the
  // map over-claims tests the thing on screen rather than the working-out
  // behind it. The per-ring assertions above stay on `rings`, because whether
  // each shop's reach was measured correctly is the other question.
  //
  // ——— ⚠️ Non-zero winding, because that is what Google paints ———
  //
  // This was `outline.some(inLoop)`, and that is not the rule a map uses. A
  // hole in the union is a loop wound the other way *inside* the outer one, so
  // "inside any loop" answers true for every point in it — the one place the
  // shape deliberately claims nothing.
  //
  // It reported eleven points as over-claimed the day an eleventh counter
  // closed a bay near Compton into a hole. Every one of them was genuinely
  // outside the shape: inside the outer loop, inside the hole, net winding
  // zero, painted as a hole by Google and by this helper now.
  //
  // The same mistake was found and fixed in tests/polygonUnion.test.ts and not
  // carried across to here, so this suite has been lenient about holes since
  // the first one appeared. It is the same helper now, in all three places.
  const insideAny = (point: [number, number]) => {
    let winding = 0;
    for (const loop of area.outline) {
      if (!inLoop(point, loop)) continue;
      let twice = 0;
      for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
        twice += loop[j][1] * loop[i][0] - loop[i][1] * loop[j][0];
      }
      winding += twice > 0 ? 1 : -1;
    }
    return winding !== 0;
  };

  const origins = LOCATIONS.filter((l) => l.delivery !== false).map((l) => l.position);
  console.log(`  ${area.origins.length} origins, ${vertices.length} vertices, ` +
    `${matrixCalls} matrix calls, ${elementsAsked} elements`);

  // ——— It asked about every counter ———
  ok("every delivering counter is an origin", area.origins.length === origins.length,
     String(area.origins.length));
  ok("and the shape carries them all for the map to pin",
     area.origins.every((o) => origins.some((p) => milesBetween(o, p) < 0.01)));
  ok("the centre is not one of the counters",
     origins.every((p) => milesBetween(area.centre, p) > 0.01));
  // ——— ⚠️ What a rebuild costs, which is what took the map down ———
  //
  // This used to assert "one Route Matrix call per search step, asking every
  // counter at once", and both halves of that were satisfied on the day the
  // delivery map disappeared from the live site. Google meters elements —
  // origins × destinations — not calls, and batching every patch into one call
  // multiplied both sides of that product at once. The assertion was measuring
  // the thing that was cheap.
  //
  // So it counts elements now, against the quota that actually refused them.
  // tests/matrixBudget.test.ts does the same arithmetic without a stub, from
  // the location list; this one proves the code really asks for what that file
  // calculates.
  ok("⚠️ a whole rebuild fits inside one minute's element quota",
     elementsAsked < MATRIX_ELEMENT_QUOTA,
     `${elementsAsked} elements in ${matrixCalls} calls, quota ${MATRIX_ELEMENT_QUOTA}`);
  // ⚠️ Zero, not "few". A counter further than the radius from every probe in
  // a call cannot be the nearest counter to any of them, so every element it
  // costs is spent on an answer already known. Six counters asked about both
  // patches was 216 of these per step; the arrangement that broke was built
  // entirely out of them.
  ok("⚠️ no call carries a counter that could not serve any of its probes",
     pointlessOrigins === 0, `${pointlessOrigins} pointless origins`);
  ok("and no single call exceeds what Google accepts in one request",
     biggestCall <= 625, String(biggestCall));

  // ——— Every vertex obeys the rule ———
  const reach = (p: [number, number]) => Math.min(...origins.map((o) => milesBetween(p, o)));
  const worst = Math.max(...vertices.map(reach));
  ok("no vertex is outside the radius", worst <= DELIVERY_RADIUS_MILES, worst.toFixed(3));
  ok("and none is more than one search step inside it",
     worst > DELIVERY_RADIUS_MILES - 0.25, worst.toFixed(3));
  // ——— ⚠️ Every bearing, and why the old form of this had to go ———
  //
  // This asserted that the *nearest* vertex is also out at the radius: with one
  // ring from a centroid and a straight-line ruler, every ray meets the edge
  // whichever way it points, so a single pulled-in vertex meant a clipped
  // shape. Per-counter rings break that premise honestly. A ray west from San
  // Clemente or Long Beach runs into the Pacific, finds no road route, and the
  // search correctly stops at eight tenths of a mile. The vertex is short
  // because the ocean is there.
  //
  // So the shape of the claim moves from "no vertex is short" to "no *ring* is
  // short all the way round". A ring whose every bearing came back pulled in is
  // a ring that was clipped; a ring with a few short bearings is a ring by the
  // sea.
  //
  // ⚠️ Measured from the ring's *own* counter, not from the nearest one. The
  // first cut of this used `reach`, which is the minimum across every counter,
  // and Larchmont failed at 8.4 miles — correctly, because Larchmont is ringed
  // by Koreatown, Westwood and Studio City, so no point ten miles from it is
  // ten miles from all of them. That is a fact about the shop's density and
  // says nothing about whether the ring was drawn properly. A ring belongs to
  // one counter, so it is checked against that counter.
  //
  // rings[i] is the ring for origins[i]: measure() maps one over the other, and
  // this assertion is the only thing that would notice if that stopped being
  // true.
  for (let r = 0; r < area.rings.length; r += 1) {
    const own = (p: [number, number]) => milesBetween(p, area.origins[r]);
    const out = Math.max(...area.rings[r].map(own));
    ok(`ring ${r} reaches the boundary somewhere`,
       out > DELIVERY_RADIUS_MILES - 0.25, out.toFixed(3));
  }

  // ——— ⚠️ The proto3 notch ———
  //
  // Bearing zero is the destination whose index Google may omit, and reading
  // that as "no index, skip it" would drop it on every call — one notch per
  // ring, pulled all the way in to the shop, on a published map.
  //
  // Checked across every ring rather than on the first vertex of the first one,
  // and that is the point: a coastal ring can legitimately have a short bearing
  // zero, but *all nine* being the shortest in their ring at once is not
  // geography, it is the bug. Written as "how many rings have their minimum at
  // bearing zero", which is at most a couple by chance and exactly nine when
  // the index is being dropped.
  // ——— ⚠️ What this suite cannot check: the inset ———
  //
  // Each ring is drawn a few hundred feet inside its own measurement, to cover
  // the straight edge between two rays cutting outside a curve that bends away
  // from it. Deleting that inset changes nothing here, and it is worth saying
  // why rather than leaving somebody to discover the assertion is asleep: the
  // stub's ruler is straight-line distance, so every ring is a circle, and the
  // chord between two points on a circle is always inside it. The inset exists
  // for road distance, where the boundary between two rays can dip inward and
  // the chord then spans a notch — which no straight-line stub can produce.
  //
  // So the inset is checked for being a sane size in tests/matrixBudget.test.ts
  // and for its arithmetic in app/deliveryArea.ts, and the thing it guards
  // against is only visible against the live API. The sweep below catches the
  // large-scale version of the same failure, which is what it was added for.
  const zeroIsWorst = area.rings.filter((loop, r) => {
    const radii = loop.map((p) => milesBetween(p, area.origins[r]));
    return radii[0] === Math.min(...radii);
  }).length;
  ok("⚠️ bearing zero is not pulled in on every ring at once",
     zeroIsWorst < area.rings.length,
     `${zeroIsWorst} of ${area.rings.length} rings have their shortest bearing at zero`);

  // ——— It is the union, checked against one computed independently ———
  //
  // With a straight-line ruler the true boundary is four exact circles. Every
  // vertex should sit on the edge of the nearest one, and a point that only the
  // Studio City counter reaches should be inside the ring.
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
     insideAny(valley));

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
     insideAny(eastOfWilshire));

  // Somewhere outside every counter's reach must be outside the ring, or the
  // shape is not a boundary at all.
  //
  // ⚠️ South, not north. This walked north from Wilshire, which used to leave
  // every counter behind and now heads straight for Studio City — it would have
  // landed inside the ring and failed for the right reason with the wrong
  // explanation.
  const faraway: [number, number] = [wil[0] - 0.45, wil[1]];
  ok("a point beyond every counter is outside the ring", !insideAny(faraway),
     reach(faraway).toFixed(1));

  // ——— ⚠️ The sweep: the map never claims what the checkout would refuse ———
  //
  // This is the assertion the whole file is for, and it is here because the
  // shape got it wrong. With counters in Los Angeles and one in Fullerton the
  // single ring bridged the twenty-three miles between them, and points around
  // Pico Rivera — eleven miles from any counter — were drawn inside it. Read
  // off a published map that is somebody filling a basket and being turned down
  // at the end.
  //
  // Everything above tests the boundary. This tests the inside: a grid across
  // the whole area, every point asked twice — is it drawn, and is it within the
  // rule — with over-claiming the only outcome that fails. Under-claiming is
  // allowed and expected, because the polygon is conservative by up to one
  // search step and a 48-gon sits inside the curve it approximates.
  //
  // The assertions above cannot see this. They check that every *vertex* obeys
  // the rule, and a vertex on each side of a gap can both be right while the
  // edge between them crosses a county nobody serves.
  const lats = origins.map(([lat]) => lat);
  const lngs = origins.map(([, lng]) => lng);
  const pad = DELIVERY_RADIUS_MILES / 60; // a bit over the radius, in degrees
  let swept = 0;
  const overclaimed: string[] = [];
  for (let lat = Math.min(...lats) - pad; lat <= Math.max(...lats) + pad; lat += 0.02) {
    for (let lng = Math.min(...lngs) - pad; lng <= Math.max(...lngs) + pad; lng += 0.02) {
      const point: [number, number] = [lat, lng];
      swept += 1;
      const nearest = Math.min(...origins.map((o) => milesBetween(point, o)));
      if (insideAny(point) && nearest > DELIVERY_RADIUS_MILES) {
        overclaimed.push(`${lat.toFixed(3)},${lng.toFixed(3)} is ${nearest.toFixed(4)}mi out (${((nearest - DELIVERY_RADIUS_MILES) * 5280).toFixed(0)} ft over)`);
      }
    }
  }
  ok(`swept ${swept} points across the area`, swept > 1000, String(swept));
  ok("⚠️ nothing is drawn that the rule would refuse",
     overclaimed.length === 0,
     `${overclaimed.length} points: ${overclaimed.slice(0, 4).join(" | ")}`);

  // And the shape is genuinely in pieces, which is the fact that made the
  // sweep necessary. Asserted so that a future change merging them back into
  // one ring has to explain itself here.
  // ——— ⚠️ The union, which is what stops the map being a pile of circles ———
  console.log("\n— one shape, not nine —");
  console.log(`  ${area.rings.length} rings measured → ${area.outline.length} loops drawn, ` +
    `${area.outline.reduce((n, l) => n + l.length, 0)} vertices`);
  ok("⚠️ overlapping counters are drawn as one loop, not one each",
     area.outline.length < area.rings.length,
     `${area.outline.length} vs ${area.rings.length}`);
  ok("and every drawn loop is closed and real",
     area.outline.every((loop) => loop.length >= 3));
  // ⚠️ The union must cover what the rings covered. A seam-removal that also
  // removed area would be a map that quietly stopped offering delivery to
  // somewhere the shop serves — the opposite failure to over-claiming, and
  // just as invisible.
  let lost = 0;
  for (let lat = 33.2; lat <= 34.5; lat += 0.02) {
    for (let lng = -118.8; lng <= -117.4; lng += 0.02) {
      const point: [number, number] = [lat, lng];
      const inRings = area.rings.some((loop) => inLoop(point, loop));
      if (inRings && !insideAny(point)) lost += 1;
    }
  }
  ok("⚠️ and covers everything the rings did", lost === 0, `${lost} points lost`);

  ok("the counters are drawn as more than one patch", area.rings.length > 1,
     `${area.rings.length} ring(s)`);
  // ⚠️ This used to assert every ring had the *same* number of vertices, which
  // was a fair proxy for "a full fan of bearings" right up until rings stopped
  // being full fans. Two things break it now and both are deliberate: a bearing
  // pointing out to sea contributes no vertex, and an edge that would cut
  // across water gets extra ones bent back to the shore. So the assertions are
  // about what a drawn patch has to be rather than about a count.
  ok("and every patch is a closed loop of its own",
     area.rings.every((loop) => loop.length >= 3),
     area.rings.map((l) => l.length).join(","));
  ok("⚠️ and no patch collapsed to a sliver",
     area.rings.every((loop) => loop.length > area.resolution.bearings / 2),
     `${area.resolution.bearings} bearings → ${area.rings.map((l) => l.length).join(",")}`);
  // The bound aroundTheWater is written to respect. Past it something is
  // subdividing without converging, which is a request path that gets slower
  // every time somebody opens a shop near a bay.
  ok("and none grew past twice its bearing count",
     area.rings.every((loop) => loop.length <= area.resolution.bearings * 2),
     area.rings.map((l) => l.length).join(","));
  ok("with no repeated vertex, which would be a zero-length edge for the union",
     area.rings.every((loop) =>
       loop.every((p, i) => {
         const next = loop[(i + 1) % loop.length];
         return Math.abs(p[0] - next[0]) > 1e-9 || Math.abs(p[1] - next[1]) > 1e-9;
       })),
     "a ring repeats a point");

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
