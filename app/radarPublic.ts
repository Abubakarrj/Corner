// The browser's half of Radar: autocomplete and map tiles.
//
// Both use the publishable key, which is meant to be served — it's locked to
// this app's domains in Radar's dashboard, and it can do nothing but read
// suggestions and tiles. It is the one key in this project with a
// NEXT_PUBLIC_ prefix, and the prefix is correct: see the note at the top of
// app/radar.ts for why every other one is server-side.
//
// Autocomplete runs here rather than through our own API because it fires on
// a keystroke. A proxy hop would add our server's latency to every letter
// somebody types into an address field, for no gain — the suggestions are
// suggestions, and nothing is decided on them. What the visitor *picks* goes
// to /api/geo, which re-geocodes it and measures the distance itself.

export const RADAR_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_RADAR_PUBLISHABLE_KEY?.trim() ?? "";

export type Suggestion = { id: string; primary: string; secondary: string };

const LAYERS = {
  address: "address,street",
  region: "locality,neighborhood,postalCode,state",
} as const;

export type SuggestKind = keyof typeof LAYERS;

// Radar's MapLibre styles. Two of them, because the finder follows the app's
// light/dark switch and a light basemap under a dark UI is a torch in the
// face. Both are vector styles served by Radar over OpenStreetMap data —
// which is also the answer to "what happened to the OSM tiles": nothing is
// being pulled from tile.openstreetmap.org any more. That endpoint is for
// light use and explicitly not for production traffic.
export function radarStyleUrl(theme: "light" | "dark"): string {
  const style = theme === "dark" ? "radar-default-v1" : "radar-light-v1";
  return `https://api.radar.io/maps/styles/${style}?publishableKey=${encodeURIComponent(
    RADAR_PUBLISHABLE_KEY,
  )}`;
}

type RadarAddress = {
  formattedAddress?: string;
  addressLabel?: string;
};

function toSuggestions(addresses: RadarAddress[]): Suggestion[] {
  return addresses
    .filter((entry) => typeof entry.formattedAddress === "string")
    .map((entry) => {
      const full = entry.formattedAddress!;
      const primary = entry.addressLabel ?? full.split(",")[0];
      const secondary = full.startsWith(primary)
        ? full.slice(primary.length).replace(/^,\s*/, "")
        : full;
      return { id: full, primary, secondary };
    });
}

// Suggestions for what's been typed so far.
//
// Falls back to our own /api/geo — which asks Radar with the secret key —
// when no publishable key is configured, so address search works on a
// deployment that has only set one of the two.
export async function suggestAddresses(
  query: string,
  kind: SuggestKind,
  near: [number, number],
  signal?: AbortSignal,
): Promise<Suggestion[]> {
  if (!RADAR_PUBLISHABLE_KEY) {
    const response = await fetch("/api/geo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suggest", query, kind }),
      signal,
    });
    if (!response.ok) throw new Error("Address search failed.");
    const body = (await response.json()) as { suggestions?: Suggestion[] };
    return body.suggestions ?? [];
  }

  const url =
    `https://api.radar.io/v1/search/autocomplete?query=${encodeURIComponent(query)}` +
    `&near=${near[0]},${near[1]}&limit=8&countryCode=US&layers=${LAYERS[kind]}`;

  const response = await fetch(url, {
    headers: { Authorization: RADAR_PUBLISHABLE_KEY },
    signal,
  });
  if (!response.ok) throw new Error("Address search failed.");
  const body = (await response.json()) as { addresses?: RadarAddress[] };
  return toSuggestions(body.addresses ?? []);
}
