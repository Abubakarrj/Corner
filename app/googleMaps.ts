import "server-only";

// Google Maps Platform, server side: geocoding and routing.
//
// One key does everything, which is the reason this replaced Radar. It is also
// the thing to be careful about, because "one key" and "one key you can safely
// restrict" are not the same sentence.
//
// The Maps JavaScript API runs in the browser, so its key is served to every
// visitor. There is no way around that: it is how the library authenticates.
// What protects it is an HTTP-referrer restriction in the Google Cloud
// console, which tells Google to reject calls that didn't come from your
// domains. Server-to-server calls send no referrer at all, so a referrer
// restriction on the same key would reject every request this file makes.
//
// So: one key works, and two keys are safe. See .env.example. This module
// reads GOOGLE_MAPS_API_KEY and never sends it anywhere but Google.
//
// APIs this file needs enabled on the project:
//   Geocoding API   text to coordinates
//   Routes API      driving distance and duration

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

export function googleMapsKey(): string | null {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

// The key the browser gets, which is allowed to be a different one.
//
// Set GOOGLE_MAPS_BROWSER_KEY and you get the safe configuration: that one is
// restricted by HTTP referrer to your domains and does nothing but draw the
// map and autocomplete, while GOOGLE_MAPS_API_KEY stays on the server, is
// restricted by API to Geocoding and Routes, and is never served.
//
// Leave it unset and the single key does both jobs, which works and is what a
// first deployment looks like. It just cannot be referrer-restricted, because
// the calls this file makes carry no referrer to check.
export function googleMapsBrowserKey(): string | null {
  const key = process.env.GOOGLE_MAPS_BROWSER_KEY?.trim();
  return key && key.length > 0 ? key : googleMapsKey();
}

export type GeocodedPlace = {
  address: string;
  lat: number;
  lng: number;
  // Google's own handle for this place, when the response carried one.
  //
  // Kept so a place can be named again later without spelling it out — an
  // address string round-trips through a geocoder and can come back subtly
  // different, an id does not. It is never a position: a place id resolves to
  // whatever Google thinks the address means, which is exactly the guess the
  // pin exists to replace.
  placeId?: string;
};

type GeocodeResult = {
  formatted_address?: string;
  place_id?: string;
  types?: string[];
  partial_match?: boolean;
  geometry?: {
    location?: { lat?: number; lng?: number };
    location_type?: string;
  };
};

type GeocodeBody = {
  status?: string;
  error_message?: string;
  results?: GeocodeResult[];
};

// A place too big to put a bagel in.
//
// This exists because of a genuinely nasty failure mode. We send
// `components=country:US` to keep results stateside, but when the address
// itself matches nothing, Google does not answer ZERO_RESULTS: it satisfies
// the component filter on its own and returns *the United States*, status OK,
// with the country's centroid in Kansas. That is a valid-looking result with
// coordinates 700 miles from the shop, and every caller downstream would
// believe it.
//
// So a result that names a country, a state or a county is refused for
// anything that has to be a doorway, and so is APPROXIMATE geometry, which is
// what Google returns for regions rather than buildings.
const TOO_COARSE = new Set([
  "country",
  "administrative_area_level_1",
  "administrative_area_level_2",
]);

function isDeliverable(result: GeocodeResult): boolean {
  if ((result.types ?? []).some((type) => TOO_COARSE.has(type))) return false;
  return result.geometry?.location_type !== "APPROXIMATE";
}

function toPlace(result: GeocodeResult | undefined, fallbackName: string): GeocodedPlace | null {
  const lat = result?.geometry?.location?.lat;
  const lng = result?.geometry?.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return {
    address: result?.formatted_address ?? fallbackName,
    lat,
    lng,
    ...(typeof result?.place_id === "string" ? { placeId: result.place_id } : {}),
  };
}

// Google answers 200 with a status string, so the HTTP code alone says
// nothing. REQUEST_DENIED almost always means the Geocoding API isn't enabled
// on the project, or the key is referrer-restricted and this is a server call.
// Worth logging by name rather than swallowing.
function resultsOf(body: GeocodeBody, what: string): GeocodeResult[] | null {
  if (body.status !== "OK") {
    if (body.status && body.status !== "ZERO_RESULTS") {
      console.error(`[maps] geocode ${what} ${body.status}: ${body.error_message ?? ""}`);
    }
    return null;
  }
  return body.results ?? [];
}

// Resolves one of Google's own place ids.
//
// This is the path the address field uses, and it is exact: autocomplete
// already decided which place the visitor meant, and the id names it with no
// text to re-interpret. Re-geocoding the *words* instead is what produced
// "United States" from a Wilshire Boulevard address.
//
// It is no less safe than geocoding text. The worry was never the id, it was
// coordinates: an id is a name we hand to Google ourselves, and the position
// still comes back from our own server call, which is the part that matters.

export async function geocodePlaceId(placeId: string): Promise<GeocodedPlace | null> {
  const key = googleMapsKey();
  if (!key) return null;

  // No `components` here. The id already is the answer, and the filter is
  // what turns a miss into a country.
  const params = new URLSearchParams({ place_id: placeId, key });

  const response = await fetch(`${GEOCODE_URL}?${params}`, { next: { revalidate: 60 } });
  if (!response.ok) return null;

  const results = resultsOf((await response.json()) as GeocodeBody, "place_id");
  return results ? toPlace(results[0], placeId) : null;
}

/** Addresses near a pair of coordinates, nearest first.
 *
 *  ——— Why a list and not an answer ———
 *
 *  A phone's fix is a point with a radius, and a point in Koreatown has a
 *  building on every side of it. Standing at 3545 Wilshire Blvd, the first
 *  deliverable result Google returns was 637 S Ardmore Ave — the same corner,
 *  a different door, and a courier sent to the wrong one.
 *
 *  There is no version of this that guesses correctly every time, because the
 *  information needed is which building somebody is standing in and the phone
 *  does not know. So this returns the candidates and the screen asks.
 *
 *  ——— Sorted by distance, not by Google's order ———
 *
 *  Google returns results in its own relevance order, which is not nearest
 *  first. Taking the head of that list is what produced the wrong corner.
 *  These are sorted by real distance from the fix, so the top one is at least
 *  a defensible default and the rest are ordered the way somebody scanning
 *  them expects.
 *
 *  Deliverable shapes only, deduped by address, capped — a chooser with
 *  fifteen rows on it is not a chooser.
 */
// ——— Two, not six ———
//
// Six was a list to read; two is a choice. This names a point the customer has
// already fixed with the pin, so the only question left is which building it
// should be called, and past the second-nearest door the answer is somewhere
// else on the block. A long list also reads as uncertainty about a thing that
// is not uncertain: the destination is the pin, whatever is picked here.
const NEARBY_LIMIT = 2;

// ——— How sure Google is about where a door is ———
//
// Every reverse-geocoded result carries a location_type, and the three that
// survive isDeliverable() are not equally good:
//
//   ROOFTOP             the building itself, surveyed. This is a door.
//   RANGE_INTERPOLATED  a guess, placed along the street line between two
//                       known house numbers. It is a point on the road.
//   GEOMETRIC_CENTER    the middle of a street segment or a polyline.
//
// Sorting purely by distance treated all three as the same kind of answer, and
// that is the bug: an interpolated number sitting out on the centre line is
// often *closer* to a pin than the rooftop of the building the pin is actually
// inside — a rooftop is the middle of a parcel, and the parcel is set back
// from the road. So the top result, which is the one selected for the
// customer, could be a house number Google worked out by counting along the
// kerb rather than the address that is there.
//
// Precision first, then distance inside a tier. A rooftop twenty metres away
// beats an interpolation five metres away, because one of them is a building
// and the other is arithmetic.
const PRECISION = ["ROOFTOP", "RANGE_INTERPOLATED", "GEOMETRIC_CENTER"];

function surenessOf(result: GeocodeResult): number {
  const rank = PRECISION.indexOf(result.geometry?.location_type ?? "");
  // Anything unrecognised sorts last rather than first. A location_type this
  // does not know about is not a promotion.
  return rank === -1 ? PRECISION.length : rank;
}

// ——— Whether the label is one a courier can act on ———
//
// Google's own answers are not all in the same shape. Alongside
// "3500 W 6th St, Los Angeles, CA 90020, USA" it will return records whose
// formatted_address reads "United States, California, Los Angeles, 6th Ave
// 3500": the same kind of place, written biggest-part-first, with the number
// after the street and no postal code. That is a real Google result and not a
// fault of ours, and it is still the wrong thing to hand a driver. It also
// sorted first when it happened to be a rooftop, which is how it ended up
// pre-selected under somebody's pin.
//
// So shape is the first sort key. A usable US label starts with a house
// number and carries a five-digit ZIP; anything else is demoted rather than
// dropped, because it is still a legitimate name for the point and somebody
// who recognises it should be able to pick it.
//
// Deliberately not a parser. This asks two questions of the string that a
// courier's own eye would ask, and gets them wrong in the safe direction: a
// well-formed address that somehow lacks a ZIP loses a place in a list it is
// still in.
const US_SHAPED = /^\d+\s+\S/;
const HAS_ZIP = /\b\d{5}(?:-\d{4})?\b/;

function shapeOf(address: string): number {
  return US_SHAPED.test(address.trim()) && HAS_ZIP.test(address) ? 0 : 1;
}

// The only shapes a courier can be sent to.
//
// `result_type` above asks Google for exactly these, and this checks that it
// obliged. Belt and braces on purpose: isDeliverable() rejects countries,
// states and counties, and a neighbourhood is none of those — so a
// "Koreatown, Los Angeles" with rooftop geometry would pass every existing
// filter and offer itself as a delivery address.
const A_DOOR = new Set(["street_address", "premise", "subpremise"]);

function metresBetween(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function reverseCandidates(
  point: [number, number],
): Promise<GeocodedPlace[]> {
  const key = googleMapsKey();
  if (!key) return [];

  const params = new URLSearchParams({
    latlng: `${point[0]},${point[1]}`,
    key,
    // The shapes a courier can be sent to. Without this Google mixes in the
    // neighbourhood, the postal code and the city, and they crowd out the
    // doors.
    result_type: "street_address|premise|subpremise",
  });

  const response = await fetch(`${GEOCODE_URL}?${params}`, { next: { revalidate: 60 } });
  if (!response.ok) return [];

  const results = resultsOf((await response.json()) as GeocodeBody, "reverse");
  if (!results) return [];

  const seen = new Set<string>();
  return results
    .filter(isDeliverable)
    .filter((result) => (result.types ?? []).some((type) => A_DOOR.has(type)))
    // Carried as a pair rather than sorted twice: toPlace drops the
    // location_type, and it is what the first sort key reads.
    .map((result) => ({
      place: toPlace(result, result.formatted_address ?? ""),
      sureness: surenessOf(result),
      shape: shapeOf(result.formatted_address ?? ""),
    }))
    .filter(
      (ranked): ranked is { place: GeocodedPlace; sureness: number; shape: number } =>
        ranked.place !== null,
    )
    .filter((ranked) => {
      const id = ranked.place.address.toLowerCase();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort(
      (a, b) =>
        // Shape before precision: a rooftop nobody can read off a phone at a
        // gate is worth less than a street address at the same corner.
        a.shape - b.shape ||
        a.sureness - b.sureness ||
        metresBetween(point, [a.place.lat, a.place.lng]) -
          metresBetween(point, [b.place.lat, b.place.lng]),
    )
    .slice(0, NEARBY_LIMIT)
    .map((ranked) => ranked.place);
}

// Turns text into one canonical place.
//
// Returns null rather than throwing when Google has no answer: "we don't know
// that address" is a normal outcome of somebody typing, not a fault. Biased to
// the United States and to the shop's own area, because a bare street number
// matches a hundred cities and the nearest one is almost always meant.
//
// `allowCoarse` is off by default, and the default is the safe one: every
// caller that geocodes free text is deciding where to send a courier. Only the
// finder's pickup and catering search turns it on, because there "Los Angeles"
// is a legitimate answer, and the worst it does is point a map.
export async function geocode(
  query: string,
  near?: [number, number],
  { allowCoarse = false }: { allowCoarse?: boolean } = {},
): Promise<GeocodedPlace | null> {
  const key = googleMapsKey();
  if (!key) return null;

  const params = new URLSearchParams({
    address: query,
    key,
    components: "country:US",
  });
  if (near) {
    // A 25km box around the shop. A bias, not a filter: Google still returns a
    // better match from further out, which is what we want. Somebody typing an
    // address we can't reach should see it and be told it's out of range, not
    // be quietly shown the wrong one nearby.
    const [lat, lng] = near;
    const pad = 0.25;
    params.set("bounds", `${lat - pad},${lng - pad}|${lat + pad},${lng + pad}`);
  }

  const response = await fetch(`${GEOCODE_URL}?${params}`, {
    // Geocodes are stable. A minute of caching takes the sting out of somebody
    // re-picking the same address twice.
    next: { revalidate: 60 },
  });
  if (!response.ok) return null;

  const results = resultsOf((await response.json()) as GeocodeBody, "address");
  if (!results) return null;

  const usable = allowCoarse ? results[0] : results.find(isDeliverable);
  if (!usable) {
    if (results.length > 0) {
      // Worth a line in the log. This is the shape of a typo, and it is also
      // the shape of the country fallback, and the two are worth telling apart
      // when somebody reports that an address they know is real was refused.
      console.warn(
        `[maps] no deliverable match for ${JSON.stringify(query)}; ` +
          `best was ${JSON.stringify(results[0].formatted_address ?? "")} ` +
          `(${(results[0].types ?? []).join(",")})`,
      );
    }
    return null;
  }

  return toPlace(usable, query);
}

export type Drive = {
  // Road miles, not the straight line. The difference between the two is most
  // of what makes a delivery radius mean anything on a street grid.
  miles: number;
  minutes: number;
};

export type DriveResult =
  | { ok: true; drive: Drive }
  | { ok: false; status: number | null; why: string; detail: string };

// What went wrong, from the body rather than the status code.
//
// The status alone lies here, and it cost an afternoon to notice: Routes
// answers **400** for an invalid API key, not 401 or 403. Reading only the
// number, the old version of this reported a bad key as "the request was
// malformed, which is our bug" and sent whoever read it looking through this
// file for a typo that was never there. Google puts a machine-readable
// `reason` in the payload; that is the thing worth trusting.
function explainRoutes(status: number, detail: string): string {
  if (detail.includes("API_KEY_INVALID")) {
    return (
      "the key is not a valid Google API key. Check GOOGLE_MAPS_API_KEY for a" +
      " truncated or stale value — a key that was regenerated in the Cloud" +
      " console stops working the moment the old one is replaced."
    );
  }
  if (detail.includes("SERVICE_DISABLED") || detail.includes("has not been used in project")) {
    // Google puts the exact enable-it link in the message, and the message is
    // long enough that the truncation below cut it off halfway through the
    // word "routes". Pulled to the front so it survives, because it is the one
    // part of this that is a click rather than a search.
    const project = detail.match(/project (\d+)/)?.[1];
    return (
      "Routes API is not enabled on the project this key belongs to." +
      (project
        ? ` Enable it at https://console.cloud.google.com/apis/library/routes.googleapis.com?project=${project}`
        : " Enable it in the Cloud console; the error body names the project id.") +
      " Note this is the project the *key* belongs to, which is not always the" +
      " one you were last looking at — and that Google reports it as a number" +
      " while the console usually shows an id like gen-lang-client-0000000000." +
      " Those are two names for one project, so check the number matches" +
      " before concluding the key is from somewhere else."
    );
  }
  // The second gate, and the one that catches people who have just fixed the
  // first. Enabling an API on a project and permitting a *key* to call it are
  // two separate switches in two separate screens. A key with "Restrict key →
  // Restrict API" set carries an allow-list, and a list written when this
  // project only did maps and geocoding does not have Routes on it. Turning
  // Routes on at the project level does not add it, so the call keeps failing
  // with the API freshly and correctly enabled — which reads as the fix
  // having done nothing.
  if (detail.includes("API_KEY_SERVICE_BLOCKED") || detail.includes("are blocked")) {
    return (
      "Routes API is enabled on the project, but this key is not allowed to" +
      " call it. The key has an API restriction list and Routes API is not on" +
      " it. Open the key at" +
      " https://console.cloud.google.com/apis/credentials, and under" +
      " 'API restrictions' either add Routes API to the list or set it to" +
      " 'Don't restrict key'. Enabling the API on the project and permitting" +
      " the key to use it are two separate switches; this is the second one."
    );
  }
  if (detail.includes("API_KEY_HTTP_REFERRER_BLOCKED") || detail.includes("referer")) {
    return (
      "the key is restricted by HTTP referrer. This call is made from a server" +
      " and carries no referrer, so that restriction can only ever reject it." +
      " Give the server key IP restrictions or none, and keep the" +
      " referrer-restricted key for the browser in GOOGLE_MAPS_BROWSER_KEY."
    );
  }
  if (status === 403) {
    return (
      "the key was refused. Either it is referrer-restricted — which a" +
      " server call can never satisfy — or it is not permitted to use Routes." +
      " Check the key's API restrictions and that Routes API is enabled on the" +
      " same project."
    );
  }
  if (status === 429) return "quota exceeded.";
  if (status === 400) return "the request was malformed, which is our bug.";
  return "unexpected.";
}

// Driving distance and time between two points, via the Routes API.
//
// Routes wants a field mask: it returns nothing you didn't ask for, and asking
// for less is what it bills you less for. Two fields is all this needs.
//
// This one carries the failure back instead of swallowing it. Every ordinary
// caller wants driveBetween() below and its `Drive | null`; this exists so
// /api/maps-check can say what went wrong out loud, on a deployment where
// reading the logs means opening a hosting dashboard.
export async function routeBetween(
  origin: [number, number],
  destination: [number, number],
): Promise<DriveResult> {
  const key = googleMapsKey();
  if (!key) {
    return {
      ok: false,
      status: null,
      why: "GOOGLE_MAPS_API_KEY is not set on this deployment.",
      detail: "",
    };
  }

  const point = ([lat, lng]: [number, number]) => ({
    location: { latLng: { latitude: lat, longitude: lng } },
  });

  const response = await fetch(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
    },
    body: JSON.stringify({
      origin: point(origin),
      destination: point(destination),
      travelMode: "DRIVE",
      // Live traffic would be more accurate and costs more per call. The
      // courier quote is the number that actually decides a delivery; this one
      // only has to answer "is this roughly within range".
      routingPreference: "TRAFFIC_UNAWARE",
      units: "IMPERIAL",
    }),
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // Named rather than numbered. Every caller falls back to a straight line
    // when this returns null, which is deliberate — but it means a permanently
    // broken Routes call looks exactly like a working one from outside, and
    // the only evidence is this line. So it says what to go and fix.
    //
    // 403 is overwhelmingly the one that happens, and almost always for the
    // same reason: this call is made from the server, and a key restricted by
    // HTTP referrer cannot be used from a server. Referrer restrictions only
    // apply to browser requests. A server key wants IP restrictions or none.
    const why = explainRoutes(response.status, detail);
    console.error(
      `[maps] Routes API failed (${response.status}) — ${why}` +
        ` Distances now fall back to straight-line, which reads short.` +
        ` ${detail.slice(0, 400)}`,
    );
    return { ok: false, status: response.status, why, detail: detail.slice(0, 400) };
  }

  const body = (await response.json()) as {
    routes?: { distanceMeters?: number; duration?: string }[];
  };
  const route = body.routes?.[0];
  if (!route || typeof route.distanceMeters !== "number") {
    return {
      ok: false,
      status: response.status,
      why: "Routes answered without a route. No road connects these two points,"
        + " or the request asked for something it could not satisfy.",
      detail: "",
    };
  }

  // Routes returns duration as a protobuf duration string: "1234s".
  const seconds = Number.parseInt(route.duration ?? "", 10);

  return {
    ok: true,
    drive: {
      miles: route.distanceMeters / 1609.344,
      minutes: Number.isFinite(seconds) ? Math.round(seconds / 60) : 0,
    },
  };
}

/** Road distance, or null when Routes could not say.
 *
 *  The shape every ordinary caller wants, and the reason each of them falls
 *  back to a straight line rather than failing an order over a map service. */
export async function driveBetween(
  origin: [number, number],
  destination: [number, number],
): Promise<Drive | null> {
  const result = await routeBetween(origin, destination);
  return result.ok ? result.drive : null;
}

/** Road miles from one origin to many destinations, in a single call.
 *
 *  Same data as calling routeBetween() in a loop, at a fraction of the cost
 *  and one round trip instead of N. That difference is what makes the
 *  delivery-area contour affordable: it needs a few hundred distances, and
 *  as individual route requests that is a few hundred calls.
 *
 *  Returns one entry per destination, in the order given. `null` where no
 *  road route exists — a point in the Pacific, or the far side of a closed
 *  road — which is a real answer and not an error: nothing is deliverable
 *  there either.
 *
 *  Null for the whole array when the call fails, so a caller can tell "we
 *  asked and some are unreachable" from "we could not ask".
 */
export async function driveMatrixMiles(
  origin: [number, number],
  destinations: readonly [number, number][],
): Promise<(number | null)[] | null> {
  const key = googleMapsKey();
  if (!key || destinations.length === 0) return null;

  const waypoint = ([lat, lng]: [number, number]) => ({
    waypoint: { location: { latLng: { latitude: lat, longitude: lng } } },
  });

  const response = await fetch(MATRIX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      // `condition` is not optional here the way a field mask usually is: an
      // unreachable pair comes back with no distanceMeters at all, and
      // without the condition there is no way to tell that from zero.
      "X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,condition",
    },
    body: JSON.stringify({
      origins: [waypoint(origin)],
      destinations: destinations.map(waypoint),
      travelMode: "DRIVE",
      // Same reasoning as routeBetween: this decides whether an address is in
      // range at all, and live traffic costs more to tell us something a
      // radius does not depend on.
      routingPreference: "TRAFFIC_UNAWARE",
      units: "IMPERIAL",
    }),
    // Whatever calls this does its own caching, and it caches the finished
    // shape rather than the pieces.
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      `[maps] Route Matrix failed (${response.status}) — ` +
        `${explainRoutes(response.status, detail)} ${detail.slice(0, 400)}`,
    );
    return null;
  }

  const body = (await response.json().catch(() => null)) as unknown;
  if (!Array.isArray(body)) return null;

  const miles: (number | null)[] = destinations.map(() => null);
  for (const raw of body) {
    const element = raw as {
      destinationIndex?: unknown;
      distanceMeters?: unknown;
      condition?: unknown;
    };
    const index = element.destinationIndex;
    if (typeof index !== "number" || index < 0 || index >= miles.length) continue;
    if (element.condition !== "ROUTE_EXISTS") continue;
    // Zero is a legitimate distance and `|| 0` would swallow it, so the type
    // check is explicit. A pair with no distance despite ROUTE_EXISTS stays
    // null rather than becoming a zero-mile trip.
    if (typeof element.distanceMeters !== "number") continue;
    miles[index] = element.distanceMeters / 1609.344;
  }
  return miles;
}

export type Suggestion = {
  // Google's place id, carried through so a pick can be resolved exactly. The
  // formatted text is the fallback when we only have words.
  id: string;
  primary: string;
  secondary: string;
};

// Which place types to search, by what the field is asking for. Delivery wants
// a doorway; pickup and catering want somewhere to point the map, which is a
// town or a ZIP.
const TYPES = {
  address: ["street_address", "premise", "subpremise"],
  region: ["locality", "sublocality", "administrative_area_level_1", "postal_code"],
  // Towns only, for the City box on the job application. See the note on the
  // browser-side copy of this table.
  city: ["locality", "sublocality"],
} as const;

export type SuggestKind = keyof typeof TYPES;

// The server-side half of autocomplete, using Places API (New).
//
// Normally the browser does this itself with the same key, one less hop per
// keystroke. This is what answers when no browser key is configured, so
// address search works either way.
export async function suggest(
  query: string,
  kind: SuggestKind,
  near: [number, number],
): Promise<Suggestion[]> {
  const key = googleMapsKey();
  if (!key) return [];

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify({
      input: query,
      includedPrimaryTypes: [...TYPES[kind]],
      includedRegionCodes: ["us"],
      locationBias: {
        circle: {
          center: { latitude: near[0], longitude: near[1] },
          radius: 20000,
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`[maps] autocomplete ${response.status}: ${detail.slice(0, 200)}`);
    return [];
  }

  const body = (await response.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }[];
  };

  return (body.suggestions ?? [])
    .map((entry) => entry.placePrediction)
    .filter((prediction) => typeof prediction?.placeId === "string")
    .map((prediction) => ({
      id: prediction!.placeId!,
      primary: prediction!.structuredFormat?.mainText?.text ?? prediction!.text?.text ?? "",
      secondary: prediction!.structuredFormat?.secondaryText?.text ?? "",
    }));
}
