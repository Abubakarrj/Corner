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
const SHOP = [34.0578, -118.296];
const NEARBY = [34.0522, -118.2437];

const results = [];

function record(api, ok, detail) {
  results.push({ api, ok, detail });
  console.log(`${ok ? "  ok  " : " FAIL "} ${api.padEnd(22)} ${detail}`);
}

// ——— Geocoding API ———
try {
  const params = new URLSearchParams({
    address: "3064 W 8th St, Los Angeles, CA",
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
      input: "3064 W 8th",
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
    `\n${failed.length} of ${results.length} failed. REQUEST_DENIED or PERMISSION_DENIED almost ` +
      `always means the API is off, billing is not enabled on the project, or the key is\n` +
      `restricted to a referrer and this is a server call, which carries none.`,
  );
  process.exit(1);
}
console.log("\nAll three server APIs answered.");
