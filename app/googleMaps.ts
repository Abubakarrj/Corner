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

// Turns text into one canonical place.
//
// Returns null rather than throwing when Google has no answer: "we don't know
// that address" is a normal outcome of somebody typing, not a fault. Biased to
// the United States and to the shop's own area, because a bare street number
// matches a hundred cities and the nearest one is almost always meant.
export async function geocode(
  query: string,
  near?: [number, number],
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

  const body = (await response.json()) as {
    status?: string;
    error_message?: string;
    results?: {
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
    }[];
  };

  // Google answers 200 with a status string, so the HTTP code alone says
  // nothing. REQUEST_DENIED almost always means the Geocoding API isn't
  // enabled on the project, or the key is referrer-restricted and this is a
  // server call. Worth logging by name rather than swallowing.
  if (body.status !== "OK") {
    if (body.status && body.status !== "ZERO_RESULTS") {
      console.error(`[maps] geocode ${body.status}: ${body.error_message ?? ""}`);
    }
    return null;
  }

  const first = body.results?.[0];
  const lat = first?.geometry?.location?.lat;
  const lng = first?.geometry?.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  return { address: first?.formatted_address ?? query, lat, lng };
}

export type Drive = {
  // Road miles, not the straight line. The difference between the two is most
  // of what makes a delivery radius mean anything on a street grid.
  miles: number;
  minutes: number;
};

// Driving distance and time between two points, via the Routes API.
//
// Routes wants a field mask: it returns nothing you didn't ask for, and asking
// for less is what it bills you less for. Two fields is all this needs.
export async function driveBetween(
  origin: [number, number],
  destination: [number, number],
): Promise<Drive | null> {
  const key = googleMapsKey();
  if (!key) return null;

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
    console.error(`[maps] routes ${response.status}: ${detail.slice(0, 200)}`);
    return null;
  }

  const body = (await response.json()) as {
    routes?: { distanceMeters?: number; duration?: string }[];
  };
  const route = body.routes?.[0];
  if (!route || typeof route.distanceMeters !== "number") return null;

  // Routes returns duration as a protobuf duration string: "1234s".
  const seconds = Number.parseInt(route.duration ?? "", 10);

  return {
    miles: route.distanceMeters / 1609.344,
    minutes: Number.isFinite(seconds) ? Math.round(seconds / 60) : 0,
  };
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
