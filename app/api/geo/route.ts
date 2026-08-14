import {
  DELIVERY_RADIUS_MILES,
  milesBetween,
} from "../../(marketing)/locations/locations";
import {
  driveBetween,
  geocode,
  geocodePlaceId,
  reverseCandidates,
  suggest,
} from "../../googleMaps";
import { deliveryOrigin } from "../../storePlaces";

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
    return Response.json({ error: "api.badJson" }, { status: 400 });
  }

  const body = payload as {
    action?: unknown;
    query?: unknown;
    kind?: unknown;
    placeId?: unknown;
    point?: unknown;
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
    const suggestions = await suggest(query, kind, await deliveryOrigin());
    return Response.json({ suggestions });
  }

  // Coordinates back into an address, for the locate button in delivery mode.
  //
  // Its own action rather than a flag on "resolve", because the input is a
  // different shape and so is the failure: a phone standing in a park has a
  // real position and no doorway, which is not the same as a typo.
  if (body?.action === "reverse") {
    const point = body?.point;
    const lat = Array.isArray(point) ? Number(point[0]) : NaN;
    const lng = Array.isArray(point) ? Number(point[1]) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return Response.json({ error: "api.enterAddress" }, { status: 400 });
    }
    // The whole list, nearest first. One point has a building on every side
    // of it, and picking for somebody is how a courier ends up at the wrong
    // door on the right corner — see reverseCandidates.
    const places = await reverseCandidates([lat, lng]);
    if (places.length === 0) {
      return Response.json({ error: "api.addressNotFound" }, { status: 404 });
    }
    return Response.json({ places, place: places[0] });
  }

  // A dropped pin: what is under it, and whether we deliver there.
  //
  // ——— Why this is not "reverse" plus "resolve" ———
  //
  // Those two would answer the same question about two different points. The
  // reverse gives back a doorway *near* the pin, resolve then geocodes that
  // doorway's words, and the coordinates that come back are the geocoder's
  // idea of the address rather than the point somebody actually chose. The
  // range check would then be measuring to a place the customer never touched.
  //
  // Here the pin is the point, start to finish. The address is a label read
  // off it and nothing is measured to anything else — which is the whole
  // reason the picker exists.
  //
  // A pin with no doorway near it is a success here, not a 404 — the range
  // verdict is still a real answer about a real point, and that is what this
  // endpoint was asked for.
  //
  // The picker is stricter, and deliberately: it will not let somebody confirm
  // a destination whose address came back empty, because a blank line under
  // "Deliver to" on the kitchen's ticket is not something a courier can be
  // read out. Two different rules about the same response, and both are right
  // for where they sit. See the note on `noLabel` in PinPicker.tsx.
  if (body?.action === "pin") {
    const point = body?.point;
    const lat = Array.isArray(point) ? Number(point[0]) : NaN;
    const lng = Array.isArray(point) ? Number(point[1]) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return Response.json({ error: "api.enterAddress" }, { status: 400 });
    }

    const origin = await deliveryOrigin();
    // Both at once. They are independent lookups against the same point and
    // the picker is waiting on the pair, so running them in sequence would
    // make a settle feel twice as slow for no reason.
    const [places, drive] = await Promise.all([
      reverseCandidates([lat, lng]),
      driveBetween(origin, [lat, lng]),
    ]);
    // Same fallback as the resolve path below, and the same caveat: a straight
    // line reads short, so while Routes is down the radius is quietly wider
    // than it says. The courier quote is the real gate.
    const miles = drive?.miles ?? milesBetween(origin, [lat, lng]);

    return Response.json({
      // The whole list, nearest first, because the picker offers it. One
      // point in Koreatown has a building on every side of it and the tower
      // above it, and which of those names the customer's home is a question
      // only they can answer — but a *name* is all it decides, since the
      // destination is the pin they already placed. That is the difference
      // between this list and the one it replaced.
      places: places.map((place) => ({ address: place.address, placeId: place.placeId })),
      address: places[0]?.address ?? "",
      lat,
      lng,
      miles,
      measuredBy: drive ? "road" : "straight-line",
      inRange: miles <= DELIVERY_RADIUS_MILES,
      radiusMiles: DELIVERY_RADIUS_MILES,
    });
  }

  if (body?.action !== "resolve") {
    return Response.json({ error: "api.unknownAction" }, { status: 400 });
  }
  if (query.length === 0 && placeId.length === 0) {
    return Response.json({ error: "api.enterAddress" }, { status: 400 });
  }

  // The id first, the words as the fallback. Autocomplete already settled
  // which place was meant, so resolving its id skips the guesswork entirely;
  // the text path is for a deployment where the browser library never loaded
  // and there was no id to carry.
  const place =
    (placeId ? await geocodePlaceId(placeId) : null) ??
    (query
      ? await geocode(query, await deliveryOrigin(), { allowCoarse: kind === "region" })
      : null);

  if (!place) {
    return Response.json(
      {
        error:
          kind === "region"
            ? "api.placeNotFound"
            : "api.addressNeedsCity",
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

  // The shop's real coordinates, not the ones typed next to its address —
  // this is the centre the delivery radius is measured out of. See
  // storePlaces.ts.
  const origin = await deliveryOrigin();
  const drive = await driveBetween(origin, [place.lat, place.lng]);
  // Falling back to the straight line rather than refusing: a routing failure
  // shouldn't stop somebody ordering. It reads short, so the radius is the
  // generous end of the truth — which is the right way to be wrong here, since
  // the courier quote later is the real gate on whether a delivery happens.
  const miles = drive?.miles ?? milesBetween(origin, [place.lat, place.lng]);

  if (!drive) {
    // Loud, because the fallback is invisible from the outside and it moves the
    // boundary. A straight line reads shorter than the road, so while Routes is
    // failing the eight-mile radius is quietly larger than eight miles: an
    // address nine road miles out measures about seven in a straight line and
    // is accepted. Nothing breaks — the courier quote is the real gate, and it
    // refuses what it cannot serve — but the shop should know its radius is not
    // the number it set. googleMaps.ts logged the reason a moment ago.
    console.warn(
      `[geo] no road distance for "${place.address}" — using straight-line` +
        ` (${miles.toFixed(1)} mi). The delivery radius is wider than` +
        ` ${DELIVERY_RADIUS_MILES} miles until Routes answers again.`,
    );
  }

  return Response.json({
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    miles,
    minutes: drive?.minutes ?? null,
    // Which ruler was used. The copy that quoted a figure called it "driving
    // miles" whether or not anything had driven anywhere, and that is how a
    // dead Routes call passed for a working one for weeks.
    measuredBy: drive ? "road" : "straight-line",
    inRange: miles <= DELIVERY_RADIUS_MILES,
    radiusMiles: DELIVERY_RADIUS_MILES,
  });
}
