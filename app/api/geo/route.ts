import {
  DELIVERY_ORIGIN,
  DELIVERY_RADIUS_MILES,
  milesBetween,
} from "../../(marketing)/locations/locations";
import { driveBetween, geocode, suggest } from "../../googleMaps";

// Resolving an address, and deciding whether we'll deliver to it.
//
// The browser does its own autocomplete against the Maps JavaScript API (see
// app/googleMapsPublic.ts), so nothing here fires per keystroke. What arrives
// here is the one address somebody actually chose.
//
// Two things then happen, in this order, and both on the server:
//
//   1. The address is geocoded from scratch. Autocomplete already returned a
//      place, but that came through the browser, and a coordinate that came
//      through the browser is a coordinate the browser can change. Delivery
//      range is an authorization decision, "will we send a courier here", so
//      it gets made on numbers we fetched.
//
//   2. The distance is a driving distance from the shop, via the Routes API.
//      The straight line is still here as a fallback, but it is a worse
//      answer: on a street grid five miles as the crow flies can be nine
//      miles of driving, and the courier is not a crow.
//
// `suggest` is here too, as the fallback for when the Maps library couldn't
// load in the browser.

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const body = payload as { action?: unknown; query?: unknown; kind?: unknown } | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";

  if (body?.action === "suggest") {
    if (query.length < 3) return Response.json({ suggestions: [] });
    const kind = body.kind === "region" ? "region" : "address";
    const suggestions = await suggest(query, kind, DELIVERY_ORIGIN.position);
    return Response.json({ suggestions });
  }

  if (body?.action !== "resolve") {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }
  if (query.length === 0) {
    return Response.json({ error: "Enter an address." }, { status: 400 });
  }

  const place = await geocode(query, DELIVERY_ORIGIN.position);
  if (!place) {
    return Response.json(
      { error: "We couldn't find that address. Try adding the city or ZIP." },
      { status: 404 },
    );
  }

  const drive = await driveBetween(DELIVERY_ORIGIN.position, [place.lat, place.lng]);
  // Falling back to the straight line rather than refusing: a routing failure
  // shouldn't stop somebody ordering. It reads short, so the radius is the
  // generous end of the truth — which is the right way to be wrong here, since
  // the courier quote later is the real gate on whether a delivery happens.
  const miles = drive?.miles ?? milesBetween(DELIVERY_ORIGIN.position, [place.lat, place.lng]);

  return Response.json({
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    miles,
    minutes: drive?.minutes ?? null,
    inRange: miles <= DELIVERY_RADIUS_MILES,
    radiusMiles: DELIVERY_RADIUS_MILES,
  });
}
