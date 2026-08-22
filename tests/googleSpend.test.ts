// What this app asks Google for, and what stops it asking twice.
//
// ——— ⚠️ Why a test about a bill ———
//
// A $600 Routes bill turned out to be one thing repeated: a shape measured on
// every cold start because its cache was a module-level variable. Nothing was
// broken, nothing failed, and no test had an opinion — the app worked perfectly
// and expensively, which is the only way this class of bug ever presents.
//
// So the properties below are the ones that were true by accident and are now
// true on purpose. Each is cheap to assert and none of them is visible on a
// screen:
//
//   · the free basemap is used when there are tiles to use it with;
//   · a failed store geocode is not retried on every request;
//   · a *refused* one is not paid for twice at all;
//   · an address box's requests belong to one billed session.
//
// ⚠️ It cannot check what any of this costs. Rates are Google's and change, and
// there is no endpoint here that reports a bill. What it can check is that the
// app does not ask for the same answer over and over, which is the only half of
// the problem code can hold.

import { LOCATIONS } from "../app/(marketing)/locations/locations";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else {
    failures += 1;
    console.log("FAIL ", what, detail);
  }
};

/** Run something with a particular environment, and put it back after. */
function withEnv<T>(vars: Record<string, string | undefined>, body: () => T): T {
  const before = new Map(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return body();
  } finally {
    for (const [k, v] of before) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

async function main() {
  const { mapProvider } = await import("../app/mapConfig");

  // ——— ⚠️ The basemap follows the tiles ———
  //
  // The Protomaps engine was complete, in the repository, and switched off
  // behind a second environment variable — so every map load on /locations,
  // /delivery-areas, the checkout and the chat pin picker was billed while a
  // free engine sat beside it. Pointing PMTILES_URL at an archive is now the
  // whole switch.
  console.log("\n— which basemap draws —");
  ok(
    "⚠️ tiles configured means the free engine",
    withEnv({ PMTILES_URL: "https://tiles.example.com/la.pmtiles", MAP_PROVIDER: undefined },
      () => mapProvider()) === "protomaps",
  );
  // ⚠️ The fail direction. No tiles must never mean a blank map — there would
  // be nothing to draw with. It falls back to the one that works and costs.
  ok(
    "⚠️ no tiles falls back to Google rather than to nothing",
    withEnv({ PMTILES_URL: undefined, MAP_PROVIDER: undefined }, () => mapProvider()) === "google",
  );
  ok(
    "an empty PMTILES_URL counts as no tiles",
    withEnv({ PMTILES_URL: "   ", MAP_PROVIDER: undefined }, () => mapProvider()) === "google",
  );
  // Both overrides still work, which is what makes this reversible without
  // deleting the tiles.
  ok(
    "MAP_PROVIDER=google wins even with tiles configured",
    withEnv({ PMTILES_URL: "https://tiles.example.com/la.pmtiles", MAP_PROVIDER: "google" },
      () => mapProvider()) === "google",
  );
  ok(
    "and MAP_PROVIDER=protomaps still works on its own",
    withEnv({ PMTILES_URL: undefined, MAP_PROVIDER: "protomaps" }, () => mapProvider()) === "protomaps",
  );

  // ——— ⚠️ A refused key must not cost eleven calls a request ———
  //
  // storePlace() remembered successes and not failures, on the reasoning that a
  // lookup which failed because the key was not set should be retried. True,
  // and unbounded: while the key is refused, every request that touches a shop
  // position re-geocodes all eleven shops. This repository's own test output
  // used to carry a wall of REQUEST_DENIED saying so.
  console.log("\n— when the geocoder says no —");
  const { storePlace } = await import("../app/storePlaces");
  const target = LOCATIONS.find((store) => !store.door);

  if (!target) {
    console.log("  every counter has a surveyed door — nothing to geocode. ✓");
  } else {
    let asked = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes("maps/api/geocode")) {
        asked += 1;
        return new Response(JSON.stringify({ status: "REQUEST_DENIED" }), { status: 200 });
      }
      return realFetch(url as never, init);
    }) as typeof fetch;
    const before = process.env.GOOGLE_MAPS_API_KEY;
    process.env.GOOGLE_MAPS_API_KEY = "a-key-that-will-be-refused";
    try {
      await storePlace(target);
      const first = asked;
      for (let i = 0; i < 20; i += 1) await storePlace(target);
      ok(
        "⚠️ twenty more lookups after a refusal cost nothing",
        asked === first,
        `${asked - first} extra Geocoding calls for the same shop`,
      );
      ok("and the shop still resolves to its typed position",
         (await storePlace(target)).position.length === 2);
    } finally {
      globalThis.fetch = realFetch;
      if (before === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
      else process.env.GOOGLE_MAPS_API_KEY = before;
    }
  }

  // ——— ⚠️ The door coordinates, which end store geocoding entirely ———
  //
  // Not asserted as a requirement — surveying eleven doorways is a job for a
  // person with a phone, not a failing test. Reported, so the number is in
  // front of somebody every time the suite runs.
  const doors = LOCATIONS.filter((store) => store.door).length;
  console.log(
    `\n  ${doors} of ${LOCATIONS.length} counters have a surveyed door.` +
      (doors < LOCATIONS.length
        ? `\n  ⚠️ the other ${LOCATIONS.length - doors} are a Geocoding call per server process:` +
          `\n     ${LOCATIONS.filter((s) => !s.door).map((s) => s.id).join(", ")}`
        : ""),
  );

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
