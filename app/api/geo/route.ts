import {
  DELIVERY_ORIGIN,
  DELIVERY_RADIUS_MILES,
  milesBetween,
} from "../../(marketing)/locations/locations";
import { driveBetween, geocode, geocodePlaceId, suggest } from "../../googleMaps";

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

  const body = payload as {
    action?: unknown;
    query?: unknown;
    kind?: unknown;
    placeId?: unknown;
  } | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const placeId = typeof body?.placeId === "string" ? body.placeId.trim() : "";
  // Which of the two questions is being asked. "address" is a doorway to
  // deliver to; "region" is somewhere to point the map for pickup and
  // catering. They want different answers, and conflating them is what let a
  // country-shaped result through.
  const kind = body?.kind === "region" ? "region" : "address";

  if (body?.action === "suggest") {
    if (query.length < 3) return Response.json({ suggestions: [] });
    const suggestions = await suggest(query, kind, DELIVERY_ORIGIN.position);
    return Response.json({ suggestions });
  }

  if (body?.action !== "resolve") {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }
  if (query.length === 0 && placeId.length === 0) {
    return Response.json({ error: "Enter an address." }, { status: 400 });
  }

  // The id first, the words as the fallback. Autocomplete already settled
  // which place was meant, so resolving its id skips the guesswork entirely;
  // the text path is for a deployment where the browser library never loaded
  // and there was no id to carry.
  const place =
    (placeId ? await geocodePlaceId(placeId) : null) ??
    (query
      ? await geocode(query, DELIVERY_ORIGIN.position, { allowCoarse: kind === "region" })
      : null);

  if (!place) {
    return Response.json(
      {
        error:
          kind === "region"
            ? "We couldn't find that place. Try a city, state or ZIP."
            : "We couldn't find that address. Try adding the city or ZIP.",
      },
      { status: 404 },
    );
  }

  // Pickup and catering don't need a distance, so they don't pay for one. The
  // answer there is "put the map here", and the shop is chosen from the card
  // over the map afterwards. Routing every region search was a billed call per
  // search for a number nothing read.
  if (kind === "region") {
    return Response.json({
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      miles: 0,
      minutes: null,
      inRange: true,
      radiusMiles: DELIVERY_RADIUS_MILES,
    });
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
