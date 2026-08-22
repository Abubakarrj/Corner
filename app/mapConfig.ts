import "server-only";

// Which map draws the basemap, and what it needs to do it.
//
// There are two, and they are a real choice rather than a migration half
// done. They differ in what they cost and in what they oblige you to show:
//
//   google      One key, already enabled, nothing to host. Draws its own logo
//               and "Map data ©" and Terms along the base of the canvas, and
//               the Maps Platform terms forbid modifying or obscuring any of
//               it. Billed per map load.
//
//   protomaps   OpenStreetMap data as a single .pmtiles file on your own
//               storage, drawn by MapLibre. No key, no per-load bill, and the
//               whole attribution requirement is a small pill reading
//               "Protomaps © OpenStreetMap". You host the file and refresh it
//               when you want newer data.
//
// ——— ⚠️ Which one is the default, and why that changed ———
//
// It used to be google unless MAP_PROVIDER said otherwise, which meant the
// free engine was fully built, sitting in the repository, and switched off —
// and every map load on /locations, /delivery-areas, the checkout and the chat
// pin picker was billed. Two variables had to be set to stop that, and one of
// them existed only to say "yes, really".
//
// So the tiles decide. Point PMTILES_URL at an archive and that is the map;
// leave it unset and there is nothing to draw with, so it is Google. The
// failure direction is the one that matters: a missing PMTILES_URL falls back
// to a map that works and costs money, never to a blank canvas.
//
// MAP_PROVIDER still wins when it is set, both ways — including
// MAP_PROVIDER=google with tiles configured, which is how you go back without
// deleting anything. ?map=google or ?map=protomaps on /locations overrides it
// per visit, for comparing them on one deployment without a redeploy.

export type MapProvider = "google" | "protomaps";

export function mapProvider(): MapProvider {
  const asked = process.env.MAP_PROVIDER?.trim();
  if (asked === "protomaps" || asked === "google") return asked;
  // ⚠️ Read through pmtilesUrl() rather than process.env directly, so "set to
  // an empty string" means the same thing in both places. It is declared below
  // this; function declarations hoist, and keeping the export order as it was
  // matters more than reading top to bottom here.
  return pmtilesUrl() ? "protomaps" : "google";
}

// Where the .pmtiles archive lives.
//
// It has to be somewhere that answers HTTP range requests with CORS open,
// because that is the whole trick: MapLibre reads the few kilobytes it needs
// out of a multi-gigabyte file rather than downloading it. Object storage does
// this (R2, S3, B2); some static hosts do not. Build an extract for the area
// you serve at build.protomaps.com.
export function pmtilesUrl(): string | null {
  const url = process.env.PMTILES_URL?.trim();
  return url && url.length > 0 ? url : null;
}

// Fonts and icons for the labels. Vector tiles carry the *text*, not the
// glyphs to draw it with, so a style needs somewhere to fetch those from.
//
// Defaulted to Protomaps' own asset host, which is a small static endpoint and
// not an API: no key, no account, no per-request bill. Overridable because
// serving them yourself is the way to owe nobody anything, and it is a
// directory of files copied into public/.
export function glyphsUrl(): string {
  return (
    process.env.MAP_GLYPHS_URL?.trim() ||
    "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf"
  );
}

export function spriteUrl(): string {
  return (
    process.env.MAP_SPRITE_URL?.trim() ||
    "https://protomaps.github.io/basemaps-assets/sprites/v4/light"
  );
}
