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
};

type GeocodeResult = {
  formatted_address?: string;
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
  return { address: result?.formatted_address ?? fallbackName, lat, lng };
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
    return (
      "Routes API is not enabled on the project this key belongs to. Enable it" +
      " in the Cloud console; the error body names the project id."
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
        ` ${detail.slice(0, 200)}`,
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
