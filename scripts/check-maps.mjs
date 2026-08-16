// Are the Google Maps APIs actually working?
//
// Enabling an API in the console and having it answer are two different
// states, and the gap between them is usually billing, propagation, or a key
// restriction that is stricter than the caller. This asks each one a real
// question and reports what came back.
//
// Run it wherever the key lives:
//
//   node scripts/check-maps.mjs                 (reads .env.local if present)
//   GOOGLE_MAPS_API_KEY=... node scripts/check-maps.mjs
//
// It prints statuses, never the key.

import { readFileSync } from "node:fs";

// .env.local, if there is one, without pulling in a dependency to parse it.
try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // No .env.local. Fine: the environment is expected to carry the key in
  // Render, and this script is most useful run there.
}

const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
if (!key) {
  console.error("GOOGLE_MAPS_API_KEY is not set. Nothing to check.");
  process.exit(1);
}

// The shop, so the questions are the ones the app actually asks.
const SHOP = [34.0612, -118.2933];
const NEARBY = [34.0522, -118.2437];

const results = [];

function record(api, ok, detail) {
  results.push({ api, ok, detail });
  console.log(`${ok ? "  ok  " : " FAIL "} ${api.padEnd(22)} ${detail}`);
}

// ——— Geocoding API ———
try {
  const params = new URLSearchParams({
    address: "650 S Catalina St, Los Angeles, CA",
    key,
    components: "country:US",
  });
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
  const body = await response.json();
  // Geocoding answers HTTP 200 with a status string, so the code alone says
  // nothing. REQUEST_DENIED here is the API not being enabled, or a referrer
  // restriction on a key being used from a server.
  record(
    "Geocoding API",
    body.status === "OK",
    body.status === "OK"
      ? body.results[0].formatted_address
      : `${body.status}: ${body.error_message ?? "(no message)"}`,
  );
} catch (error) {
  record("Geocoding API", false, `request failed: ${error.message}`);
}

// ——— Routes API ———
try {
  const point = ([lat, lng]) => ({ location: { latLng: { latitude: lat, longitude: lng } } });
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
    },
    body: JSON.stringify({
      origin: point(SHOP),
      destination: point(NEARBY),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      units: "IMPERIAL",
    }),
  });
  const body = await response.json();
  const route = body.routes?.[0];
  record(
    "Routes API",
    response.ok && typeof route?.distanceMeters === "number",
    route
      ? `${(route.distanceMeters / 1609.344).toFixed(1)} mi, ${route.duration}`
      : `${response.status}: ${body.error?.message ?? JSON.stringify(body).slice(0, 160)}`,
  );
} catch (error) {
  record("Routes API", false, `request failed: ${error.message}`);
}

// ——— Places API (New) ———
//
// The *new* one, which is a separate toggle in the console from the legacy
// "Places API". Enabling the old one does not enable this.
try {
  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify({
      input: "650 S Catalina",
      includedPrimaryTypes: ["street_address", "premise", "subpremise"],
      includedRegionCodes: ["us"],
      locationBias: { circle: { center: { latitude: SHOP[0], longitude: SHOP[1] }, radius: 20000 } },
    }),
  });
  const body = await response.json();
  const count = body.suggestions?.length ?? 0;
  record(
    "Places API (New)",
    response.ok && count > 0,
    response.ok
      ? `${count} suggestion${count === 1 ? "" : "s"}`
      : `${response.status}: ${body.error?.message ?? JSON.stringify(body).slice(0, 160)}`,
  );
} catch (error) {
  record("Places API (New)", false, `request failed: ${error.message}`);
}

// ——— The shop's own pin ———
//
// Not an API check. This is the one that answers "is the address on the map
// accurate", which is a different question from "does Geocoding answer".
//
// app/storePlaces.ts resolves each shop's address at runtime and refuses an
// answer more than half a mile from the coordinates typed in locations.ts,
// because a lookup that lands somewhere else entirely should not silently
// relocate the shop. That refusal is invisible in production — the map keeps
// working, on the old approximate pair — so this is where you find out it
// happened. A drift under about 0.05 miles is the correction working: the
// typed pair is the block, the resolved one is the door.
try {
  const params = new URLSearchParams({
    address: "650 S Catalina St, Los Angeles, CA 90005",
    key,
    components: "country:US",
  });
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
  const body = await response.json();
  const found = body.results?.[0]?.geometry?.location;

  if (body.status !== "OK" || !found) {
    record("Shop position", false, `${body.status}: ${body.error_message ?? "(no message)"}`);
  } else {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(found.lat - SHOP[0]);
    const dLon = toRad(found.lng - SHOP[1]);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(SHOP[0])) * Math.cos(toRad(found.lat)) * Math.sin(dLon / 2) ** 2;
    const drift = 2 * 3958.8 * Math.asin(Math.sqrt(a));
    record(
      "Shop position",
      drift <= 0.5,
      drift <= 0.5
        ? `${drift.toFixed(3)} mi from the typed pair — ${found.lat.toFixed(5)}, ${found.lng.toFixed(5)}`
        : `${drift.toFixed(2)} mi away, so storePlaces will refuse it and keep the typed pair. ` +
          `Check the address in locations.ts.`,
    );
  }
} catch (error) {
  record("Shop position", false, `request failed: ${error.message}`);
}

// ——— The distance from the counter to a doorway ———
//
// The number every delivery decision is made on: /api/geo accepts or refuses
// an address by it, /api/delivery/quote refuses on it again, and the fee
// explainer picks a rate band with it. "Routes answered" above does not say it
// is *right* — a metre read as a mile answers just as cheerfully.
//
// So these check the answer against things that are true regardless of what
// the real distance is, which is what makes them checks rather than a second
// guess:
//
//   a road route is never shorter than the straight line
//   in a street grid it is rarely more than twice it
//   somewhere around the corner is under a mile
//   the far side of the county is outside a ten-mile rule
//
// Any of those failing means a unit, a field or an origin is wrong, and it
// does not need anybody to know the true mileage to say so.
function straightLineMiles([lat1, lon1], [lat2, lon2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(a));
}

async function roadMiles(from, to) {
  const point = ([lat, lng]) => ({ location: { latLng: { latitude: lat, longitude: lng } } });
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
    },
    body: JSON.stringify({
      origin: point(from),
      destination: point(to),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      units: "IMPERIAL",
    }),
  });
  const body = await response.json();
  const metres = body.routes?.[0]?.distanceMeters;
  // Same conversion app/googleMaps.ts does. Written out rather than imported
  // because this script runs against a deployment's key without a build.
  return typeof metres === "number" ? metres / 1609.344 : null;
}

// A block east, downtown, and the pier. Coordinates rather than addresses so
// this measures routing and not geocoding — the geocode is checked above, and
// mixing the two makes a failure ambiguous.
const AROUND_THE_CORNER = [34.0612, -118.2915];
const PIER = [34.0086, -118.4977];
const RADIUS_MILES = 10;

try {
  const [corner, downtown, pier] = await Promise.all([
    roadMiles(SHOP, AROUND_THE_CORNER),
    roadMiles(SHOP, NEARBY),
    roadMiles(SHOP, PIER),
  ]);

  if (corner === null || downtown === null || pier === null) {
    record("Delivery distance", false, "Routes did not return a distance for one of the three");
  } else {
    const line = straightLineMiles(SHOP, NEARBY);
    const ratio = downtown / line;
    const sane =
      downtown >= line &&
      ratio < 2 &&
      corner < 1 &&
      pier > RADIUS_MILES;
    record(
      "Delivery distance",
      sane,
      `around the corner ${corner.toFixed(2)} mi · downtown ${downtown.toFixed(1)} mi ` +
        `road vs ${line.toFixed(1)} straight (${ratio.toFixed(2)}x) · pier ${pier.toFixed(1)} mi` +
        (sane
          ? ""
          : downtown < line
            ? " — road shorter than the straight line, which is impossible: check the units"
            : corner >= 1
              ? " — a block away measures over a mile: check the origin in locations.ts"
              : pier <= RADIUS_MILES
                ? " — Santa Monica measures inside the radius: check the origin"
                : " — road is more than twice the straight line, which is odd for this grid"),
    );
  }
} catch (error) {
  record("Delivery distance", false, `request failed: ${error.message}`);
}

// ——— Route Matrix, and the index it may not send ———
//
// The delivery-area map is measured with computeRouteMatrix, and elements come
// back in an arbitrary order, so each one is filed by its destinationIndex.
// Routes is proto3 over REST, and proto3's JSON mapping omits a field holding
// its default — which would mean the element for destination 0 arrives with no
// index on it at all.
//
// app/googleMaps.ts reads an absent index as zero, which is correct under the
// spec whichever way Google serialises it. This says which way that is, and
// checks that both destinations come back either way — a dropped destination
// is a notch in the published delivery boundary and nothing else.
try {
  const waypoint = ([lat, lng]) => ({
    waypoint: { location: { latLng: { latitude: lat, longitude: lng } } },
  });
  const response = await fetch(
    "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,condition",
      },
      body: JSON.stringify({
        origins: [waypoint(SHOP)],
        destinations: [waypoint(NEARBY), waypoint(AROUND_THE_CORNER)],
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        units: "IMPERIAL",
      }),
    },
  );
  const body = await response.json();
  if (!Array.isArray(body)) {
    record(
      "Route Matrix",
      false,
      `${response.status}: ${body?.error?.message ?? JSON.stringify(body).slice(0, 160)}`,
    );
  } else {
    // The same read app/googleMaps.ts does, so this fails where the app would.
    const miles = [null, null];
    for (const element of body) {
      const index = element.destinationIndex ?? 0;
      if (element.condition !== "ROUTE_EXISTS") continue;
      miles[index] = (element.distanceMeters ?? 0) / 1609.344;
    }
    const first = body.find((element) => (element.destinationIndex ?? 0) === 0);
    const spellsZero = first !== undefined && "destinationIndex" in first;
    record(
      "Route Matrix",
      miles[0] !== null && miles[1] !== null,
      `${body.length} elements, destination 0 ` +
        (spellsZero ? "carries its index" : "omits its index (absent means 0)") +
        ` · ${miles.map((m) => (m === null ? "none" : `${m.toFixed(1)} mi`)).join(", ")}`,
    );
  }
} catch (error) {
  record("Route Matrix", false, `request failed: ${error.message}`);
}

// ——— Maps JavaScript API ———
//
// Not checkable from here, and saying so is better than a green tick that
// means nothing. The loader script this fetches returns 200 for any key: the
// key is validated by a second request the library makes from the page, with
// the referrer attached. So the only real test is opening the page.
console.log(
  `${"  --  "} ${"Maps JavaScript API".padEnd(22)} only validates in a browser, open /locations`,
);

const failed = results.filter((result) => !result.ok);
if (failed.length > 0) {
  console.log(
    `\n${failed.length} of ${results.length} checks failed. REQUEST_DENIED or PERMISSION_DENIED almost ` +
      `always means the API is off, billing is not enabled on the project, or the key is\n` +
      `restricted to a referrer and this is a server call, which carries none.`,
  );
  process.exit(1);
}
console.log("\nAll server APIs answered and the shop's pin resolves.");
