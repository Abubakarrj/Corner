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
// Set MAP_PROVIDER to pick the default. ?map=google or ?map=protomaps on
// /locations overrides it per visit, which is how you compare them on one
// deployment without a redeploy.

export type MapProvider = "google" | "protomaps";

export function mapProvider(): MapProvider {
  return process.env.MAP_PROVIDER?.trim() === "protomaps" ? "protomaps" : "google";
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
