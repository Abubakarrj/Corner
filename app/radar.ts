import "server-only";

// Radar — geocoding and routing, server side.
//
// Radar splits its keys in two, and the split is the whole reason this file
// has a client-side twin (app/radarPublic.ts) rather than proxying everything:
//
//   prj_live_pk_…  publishable. Designed to be served to a browser, locked to
//                  your domains in Radar's dashboard. This is the one that
//                  does autocomplete as somebody types and fetches map tiles.
//   prj_live_sk_…  secret. Never leaves the server. Geocoding, routing, and
//                  anything whose answer the app acts on.
//
// The division isn't cosmetic. Autocomplete is a suggestion — the worst a
// tampered one can do is put the wrong words in a text field. Whether an
// address is inside the delivery radius is a decision, and a decision made in
// the browser is a decision anyone can make for us. So the address the visitor
// picks is re-geocoded here, from scratch, and the distance is measured here,
// and the client's own numbers are never read back.
//
// Endpoints used, from Radar's API:
//
//   GET /v1/geocode/forward?query=…&country=US
//   GET /v1/route/distance?origin=lat,lng&destination=lat,lng&modes=car&units=imperial
//   GET /v1/search/autocomplete?query=…&near=lat,lng&layers=…
//
// Auth is the bare key in an Authorization header — no "Bearer".

const RADAR_API = "https://api.radar.io/v1";

export function radarSecret(): string | null {
  const key = process.env.RADAR_SECRET_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

// The publishable key, read on the server so the layout can hand it to the
// browser. NEXT_PUBLIC_ is correct here and only here — see the note at the
// top. Every other key in this project is server-only and a NEXT_PUBLIC_
// prefix on one of them would be a leak.
export function radarPublishable(): string | null {
  const key = process.env.NEXT_PUBLIC_RADAR_PUBLISHABLE_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

async function radarGet(path: string, key: string) {
  const response = await fetch(`${RADAR_API}${path}`, {
    headers: { Authorization: key },
    // Geocodes are stable and routes change slowly. Caching them for a minute
    // takes the sting out of somebody re-picking the same address twice.
    next: { revalidate: 60 },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { ok: false as const, status: response.status, detail: detail.slice(0, 200) };
  }
  return { ok: true as const, body: (await response.json()) as unknown };
}

// Radar's address object, trimmed to what's used here.
export type RadarAddress = {
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  addressLabel?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  layer?: string;
};

export type GeocodedPlace = {
  address: string;
  lat: number;
  lng: number;
};

// Turns text into one canonical place. Returns null rather than throwing when
// Radar has no answer: "we don't know that address" is a normal outcome of a
// visitor typing, not a fault.
export async function geocode(query: string): Promise<GeocodedPlace | null> {
  const key = radarSecret();
  if (!key) return null;

  const result = await radarGet(
    `/geocode/forward?query=${encodeURIComponent(query)}&country=US`,
    key,
  );
  if (!result.ok) return null;

  const first = ((result.body as { addresses?: RadarAddress[] })?.addresses ?? [])[0];
  if (!first || typeof first.latitude !== "number" || typeof first.longitude !== "number") {
    return null;
  }
  return {
    address: first.formattedAddress ?? query,
    lat: first.latitude,
    lng: first.longitude,
  };
}

export type Drive = {
  // Road miles, not the straight line — the difference between the two is
  // most of what makes a five-mile radius mean something on a street grid.
  miles: number;
  minutes: number;
};

// Driving distance and time between two points.
export async function driveBetween(
  origin: [number, number],
  destination: [number, number],
): Promise<Drive | null> {
  const key = radarSecret();
  if (!key) return null;

  const result = await radarGet(
    `/route/distance?origin=${origin[0]},${origin[1]}` +
      `&destination=${destination[0]},${destination[1]}` +
      `&modes=car&units=imperial`,
    key,
  );
  if (!result.ok) return null;

  const car = (
    result.body as {
      routes?: {
        car?: {
          distance?: { value?: number };
          duration?: { value?: number };
        };
      };
    }
  )?.routes?.car;

  // Radar reports distance in the requested units (miles) and duration in
  // minutes.
  const miles = car?.distance?.value;
  const minutes = car?.duration?.value;
  if (typeof miles !== "number" || typeof minutes !== "number") return null;
  return { miles, minutes };
}

export type Suggestion = {
  // Radar has no place id to carry between calls — the formatted address is
  // the handle, and it's what gets re-geocoded on the way back.
  id: string;
  primary: string;
  secondary: string;
};

// Which of Radar's layers to search, by what the field is asking for.
// Delivery wants a doorway; pickup and catering want somewhere to point the
// map, which is a town or a ZIP.
const LAYERS = {
  address: "address,street",
  region: "locality,neighborhood,postalCode,state",
} as const;

export type SuggestKind = keyof typeof LAYERS;

// The server-side half of autocomplete. Normally the browser does this itself
// with the publishable key — one less hop per keystroke — and this is what
// answers when no publishable key is configured, so search works either way.
export async function suggest(
  query: string,
  kind: SuggestKind,
  near: [number, number],
): Promise<Suggestion[]> {
  const key = radarSecret();
  if (!key) return [];

  const result = await radarGet(
    `/search/autocomplete?query=${encodeURIComponent(query)}` +
      `&near=${near[0]},${near[1]}&limit=8&countryCode=US&layers=${LAYERS[kind]}`,
    key,
  );
  if (!result.ok) return [];

  return toSuggestions((result.body as { addresses?: RadarAddress[] })?.addresses ?? []);
}

// Shared with the browser path so both produce identically shaped rows —
// exported because app/api/geo/route.ts and the client both format Radar's
// addresses, and two copies of this would drift.
export function toSuggestions(addresses: RadarAddress[]): Suggestion[] {
  return addresses
    .filter((entry) => typeof entry.formattedAddress === "string")
    .map((entry) => {
      const full = entry.formattedAddress!;
      // Radar's formattedAddress is "3064 W 8th St, Los Angeles, CA 90005".
      // The first comma splits the thing from where it is, which is the two
      // lines the results list wants.
      const primary = entry.addressLabel ?? full.split(",")[0];
      const secondary = full.startsWith(primary)
        ? full.slice(primary.length).replace(/^,\s*/, "")
        : full;
      return { id: full, primary, secondary };
    });
}
