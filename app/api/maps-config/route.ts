import { googleMapsBrowserKey } from "../../googleMaps";
import { glyphsUrl, mapProvider, pmtilesUrl, spriteUrl } from "../../mapConfig";

// What the browser needs to draw a map, served at request time.
//
// Every other route in this app is careful never to hand a key to a browser,
// so the Google half needs its exception written down. The Maps JavaScript API
// authenticates from the page: the key is in the request the library makes,
// and any visitor can read it out of the network tab. That is Google's design,
// not an oversight in ours, and the protection they provide for it is an
// HTTP-referrer restriction set in the Cloud console, which rejects calls that
// didn't come from your domains.
//
// So this doesn't leak anything a NEXT_PUBLIC_ variable wouldn't. What it buys
// is that the values are read when the request arrives rather than compiled
// into the bundle, so pasting one into Render takes effect on the next request
// instead of the next build.
//
// The one thing worth being loud about: if you use the same key for the server
// calls in app/googleMaps.ts, you cannot referrer-restrict it, because server
// requests carry no referrer. One key works. Two keys, one restricted by
// referrer for the browser and one restricted by API for the server, is the
// configuration that can't be lifted and billed to you. Set
// GOOGLE_MAPS_BROWSER_KEY to the first and this serves that instead.
//
// The Protomaps half has no secret in it at all. A .pmtiles URL is a public
// file on your own storage, which is rather the point of it.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    provider: mapProvider(),
    key: googleMapsBrowserKey() ?? null,
    pmtiles: pmtilesUrl(),
    glyphs: glyphsUrl(),
    sprite: spriteUrl(),
  });
}
