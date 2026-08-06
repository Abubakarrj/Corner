"use client";

// The browser's half of Google Maps: loading the library, and autocomplete.
//
// The Maps JavaScript API authenticates with a key in the page. That isn't a
// leak we can design around, it is how the library works, and Google's answer
// is an HTTP-referrer restriction in the console rather than secrecy. What we
// can control is *how* the key gets here.
//
// It is fetched at runtime from /api/maps-config rather than compiled in with
// a NEXT_PUBLIC_ prefix, for one practical reason: NEXT_PUBLIC_ values are
// baked into the bundle at build time, so setting one means a rebuild, not a
// restart. Reading it at request time means the key you paste into Render is
// live on the next request, and it means there is exactly one variable to set.

export type Suggestion = { id: string; primary: string; secondary: string };

const LAYERS = {
  address: ["street_address", "premise", "subpremise"],
  region: ["locality", "sublocality", "administrative_area_level_1", "postal_code"],
} as const;

export type SuggestKind = keyof typeof LAYERS;

// ——— The key ———

let keyPromise: Promise<string | null> | null = null;

export function mapsKey(): Promise<string | null> {
  // Once per page. The answer doesn't change under a running app, and the
  // finder mounts the map and the search box separately.
  keyPromise ??= fetch("/api/maps-config")
    .then((response) => (response.ok ? response.json() : null))
    .then((body: { key?: string } | null) => body?.key ?? null)
    .catch(() => null);
  return keyPromise;
}

// ——— Loading the library ———

declare global {
  interface Window {
    google?: typeof google;
  }
}

let loader: Promise<typeof google.maps | null> | null = null;

// Loads the Maps JavaScript API once and hands back its namespace.
//
// The bootstrap script is appended by hand rather than pulled in as a package.
// Google's own loader is a few lines of minified IIFE whose only job is to add
// this tag, and a dependency that exists to write one script element is a
// dependency that can break the build for no benefit.
export function loadMaps(): Promise<typeof google.maps | null> {
  loader ??= (async () => {
    if (window.google?.maps) return window.google.maps;

    const key = await mapsKey();
    if (!key) {
      // Said once, in the console. Without a key the map is a flat coloured
      // panel with the pins and controls still on it, and there is no way to
      // tell that apart from a broken map by looking. This is the note that
      // tells them apart. It's a deployment problem, so it goes where a
      // developer looks: putting "no map key" on the screen would be telling
      // a customer about our configuration.
      console.warn(
        "[map] GOOGLE_MAPS_API_KEY is not set, so the basemap is blank. " +
          "Enable Maps JavaScript, Places (New), Geocoding and Routes on the " +
          "project, and billing, or Google refuses all four.",
      );
      return null;
    }

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      // `libraries=places,marker` loads what the finder actually uses. Asking
      // for everything is a bigger download on a phone for no gain.
      script.src =
        `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
        `&libraries=places,marker&loading=async&v=weekly`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Google Maps failed to load"));
      document.head.appendChild(script);
    });

    return window.google?.maps ?? null;
  })().catch(() => null);

  return loader;
}

// ——— Autocomplete ———

// Suggestions for what's been typed so far.
//
// Falls back to our own /api/geo, which asks Google with the same key from the
// server, when the library couldn't load. Address search then costs an extra
// hop per keystroke but still works, which is the right way round.
export async function suggestAddresses(
  query: string,
  kind: SuggestKind,
  near: [number, number],
  signal?: AbortSignal,
): Promise<Suggestion[]> {
  const maps = await loadMaps();

  if (!maps) {
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

  const { AutocompleteSuggestion } = (await maps.importLibrary(
    "places",
  )) as google.maps.PlacesLibrary;

  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: query,
    includedPrimaryTypes: [...LAYERS[kind]],
    includedRegionCodes: ["us"],
    locationBias: {
      center: { lat: near[0], lng: near[1] },
      radius: 20000,
    },
  });

  if (signal?.aborted) return [];

  return suggestions
    .map((entry) => entry.placePrediction)
    .filter((prediction): prediction is google.maps.places.PlacePrediction => prediction !== null)
    .map((prediction) => ({
      id: prediction.placeId,
      primary: prediction.mainText?.text ?? prediction.text.text,
      secondary: prediction.secondaryText?.text ?? "",
    }));
}
