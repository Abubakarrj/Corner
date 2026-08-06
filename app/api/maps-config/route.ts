import { googleMapsBrowserKey } from "../../googleMaps";

// The browser's Maps key, served at request time.
//
// Every other route in this app is careful never to hand a key to a browser,
// so this one needs its exception written down. The Maps JavaScript API
// authenticates from the page: the key is in the request the library makes,
// and any visitor can read it out of the network tab. That is Google's design,
// not an oversight in ours, and the protection they provide for it is an
// HTTP-referrer restriction set in the Cloud console, which rejects calls that
// didn't come from your domains.
//
// So this doesn't leak anything a NEXT_PUBLIC_ variable wouldn't. What it buys
// is that the key is read when the request arrives rather than compiled into
// the bundle, so pasting it into Render takes effect on the next request
// instead of the next build, and there is one variable to set rather than two.
//
// The one thing worth being loud about: if you use the same key for the server
// calls in app/googleMaps.ts, you cannot referrer-restrict it, because server
// requests carry no referrer. One key works. Two keys, one restricted by
// referrer for the browser and one restricted by API for the server, is the
// configuration that can't be lifted and billed to you. Set
// GOOGLE_MAPS_BROWSER_KEY to the first and this serves that instead.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ key: googleMapsBrowserKey() ?? null });
}
