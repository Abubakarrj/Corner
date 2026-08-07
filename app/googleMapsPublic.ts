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

// ——— Configuration ———

export type MapsConfig = {
  provider: "google" | "protomaps";
  key: string | null;
  pmtiles: string | null;
  glyphs: string;
  sprite: string;
};

const FALLBACK: MapsConfig = {
  provider: "google",
  key: null,
  pmtiles: null,
  glyphs: "",
  sprite: "",
};

let configPromise: Promise<MapsConfig> | null = null;

// Once per page. The answer doesn't change under a running app, and the finder
// mounts the map and the search box separately.
export function mapsConfig(): Promise<MapsConfig> {
  configPromise ??= fetch("/api/maps-config")
    .then((response) => (response.ok ? response.json() : null))
    .then((body: Partial<MapsConfig> | null) => ({ ...FALLBACK, ...(body ?? {}) }))
    .catch(() => FALLBACK);
  return configPromise;
}

export function mapsKey(): Promise<string | null> {
  return mapsConfig().then((config) => config.key);
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
// The map's own labels — street names, city names, "United States" — follow
// the chosen language too.
//
// Google takes it as a bootstrap parameter, read once when the script loads.
// There is no way to change it on a live map, so the only way to change it at
// all is to throw the library away and load it again, which is what
// `unloadMaps` below does.
//
// This used to settle the language at first load and keep it for the session,
// on the reasoning that the case that matters is picking a language and *then*
// opening the map. That reasoning had a hole in it: `loader` is a module
// promise and this is a single-page app, so once the map had loaded in any
// language, every later visit to the finder kept it — including after a full
// navigation away and back. Somebody who browsed in Chinese and switched to
// English got Chinese map labels under English chrome until they hard-reloaded
// the tab, which most people never do. "Stale until the next full load" was
// describing a load that doesn't happen.
//
// `region=US` stays fixed regardless. It biases results and disputed borders
// to the country the shop is in, which is a fact about the shop, not about
// who is reading.
let loadedLanguage: string | null = null;

export function loadMaps(language = "en"): Promise<typeof google.maps | null> {
  // A different language than the one in the page: start again. Cheap to
  // check, and it is the only thing standing between a language switch and a
  // map that disagrees with the app around it.
  if (loader && loadedLanguage !== null && loadedLanguage !== language) {
    unloadMaps();
  }
  loadedLanguage = language;
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
      // The callback is the whole point, and getting this wrong is what made
      // the map a blank panel.
      //
      // The script at maps/api/js is a *bootstrap*. It defines google.maps.Load
      // and nothing else: no Map, no InfoWindow, no importLibrary. Its only job
      // is to inject a second script that carries the actual library. So
      // script.onload fires while google.maps is still an empty shell, and
      // anything that touches it in that window throws.
      //
      // callback= is Google's own answer: they call it once the real library
      // has landed. Waiting on that instead of onload is the difference
      // between a map and a coloured rectangle.
      const done = `__cbMapsReady_${Date.now().toString(36)}`;
      const scope = window as unknown as Record<string, unknown>;
      scope[done] = () => {
        delete scope[done];
        resolve();
      };

      const script = document.createElement("script");
      // `libraries=places` is what the finder actually uses. Asking for
      // everything is a bigger download on a phone for no gain, and `marker`
      // was in this list without a single AdvancedMarkerElement behind it —
      // the pins are custom SVG on the plain Marker, deliberately, because
      // AdvancedMarkerElement needs a cloud Map ID and the point of this path
      // is one variable and no dashboard work (see engineGoogle.ts).
      //
      // ——— On `v` ———
      //
      // quarterly, not weekly. Google publishes four channels: weekly (the
      // default, and where new features land first), quarterly (the previous
      // quarter's weekly, so it has had three months of everyone else finding
      // the regressions), and beta/alpha ahead of both.
      //
      // Weekly is the right channel while you are building against something
      // new. This map is not: a styled basemap, one marker class, and Places
      // autocomplete, all of it years old. Nothing here benefits from a
      // release that is days old, and a storefront's map is exactly the
      // surface where a regression goes unnoticed — nobody opens /locations
      // during a deploy. Quarterly trades features we aren't using for changes
      // somebody else has already hit.
      //
      // Worth saying plainly: this is a stability choice and not an accuracy
      // one. Where a pin *lands* has nothing to do with which build of the
      // library drew it — that comes from the coordinates we hand it, which is
      // what storePlaces.ts is for.
      script.src =
        `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
        `&libraries=places&loading=async&v=quarterly` +
        `&language=${encodeURIComponent(language)}&region=US` +
        `&callback=${done}`;
      script.async = true;
      script.onerror = () => {
        delete scope[done];
        reject(new Error("Google Maps failed to load"));
      };
      document.head.appendChild(script);
    });

    // Belt and braces. If the callback ever fires against a half-built
    // namespace, saying so beats handing back an object with no Map on it.
    if (typeof window.google?.maps?.importLibrary !== "function") {
      console.error("[map] Google Maps loaded but importLibrary is missing.");
      return null;
    }
    return window.google.maps;
  })().catch(() => null);

  return loader;
}

// Throws the library away so the next loadMaps() fetches a fresh one.
//
// Unsupported by Google, and unavoidable: the language is a bootstrap
// parameter, so a different language means a different bootstrap, and a
// bootstrap that has already run can only be re-run by removing what it left
// behind. Three things to remove, and missing any one of them means the second
// load short-circuits and nothing changes:
//
//   window.google      loadMaps returns early if this exists, and Google's own
//                      bootstrap does the same.
//   the script tags    both the one we appended and the ones Google's
//                      bootstrap appended after it, which are the real library.
//   our loader promise the memo that would otherwise hand back the old
//                      namespace without loading anything at all.
//
// Anything still holding a Map instance from the old library keeps a dead
// object. That is the caller's problem to avoid, and StoreMap avoids it by
// remounting on a language change — see the key there.
export function unloadMaps() {
  loader = null;
  if (typeof document === "undefined") return;
  document
    .querySelectorAll('script[src*="maps.googleapis.com/maps/api/js"]')
    .forEach((script) => script.remove());
  // Reflect rather than `delete window.google`: the ambient type for it comes
  // from @types/google.maps and isn't optional there, so the operator is a
  // type error even though the property is perfectly deletable. This removes
  // the key outright, which matters — leaving it present and undefined is
  // enough for some of Google's own existence checks to take the wrong branch.
  Reflect.deleteProperty(window, "google");
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
