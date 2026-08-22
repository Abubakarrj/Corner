import { DELIVERY_RADIUS_MILES } from "../../(marketing)/locations/locations";
import {
  geocode,
  geocodePlaceId,
  reverseCandidates,
  suggest,
} from "../../googleMaps";
import { deliveryOrigin, deliveryReach } from "../../storePlaces";
import { recordMiss } from "../../demand";

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
//   2. The distance is a driving distance from the shop, via the Routes API,
//      or it is not a distance at all. There used to be a straight-line
//      fallback and it is gone: on this grid five miles as the crow flies is
//      most of nine miles of driving, and the courier is not a crow. A rule
//      measured with the wrong instrument is not a lenient rule, it is a
//      different one nobody agreed to.
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
    name?: unknown;
    session?: unknown;
  } | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const placeId = typeof body?.placeId === "string" ? body.placeId.trim() : "";
  // What the customer picked it by. For a street address this is the street
  // address; for a business it is the business's name, which is the half a
  // geocoder throws away — see nameOn() below.
  const name =
    typeof body?.name === "string"
      ? body.name.replace(/[\r\n]+/g, " ").trim().slice(0, 80)
      : "";
  // Which of the two questions is being asked. "address" is a doorway to
  // deliver to; "region" is somewhere to point the map for pickup and
  // catering. They want different answers, and conflating them is what let a
  // country-shaped result through.
  const kind =
    body?.kind === "region" ? "region" : body?.kind === "city" ? "city" : "address";

  if (body?.action === "suggest") {
    if (query.length < 3) return Response.json({ suggestions: [] });
    // ⚠️ Shape-checked and capped rather than passed through. This ends up in a
    // request body to Google, and it is a string off the wire — a session id is
    // a UUID this app minted, so anything longer or stranger is not one and is
    // dropped rather than forwarded.
    const asked = body?.session;
    const session =
      typeof asked === "string" && asked.length > 0 && asked.length <= 64
        ? asked
        : undefined;
    const suggestions = await suggest(query, kind, await deliveryOrigin(), session);
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

    // Measured against every counter, nearest wins. This picked one counter
    // by straight line and measured from that, which is close but not the
    // rule: straight-line nearest and road nearest are different shops for a
    // point with a freeway on one side of it, and the rule is the shortest
    // *road* distance to any counter. One Route Matrix call answers all of
    // them. See deliveryReach below.
    //
    // Both at once. They are independent lookups against the same point and
    // the picker is waiting on the pair, so running them in sequence would
    // make a settle feel twice as slow for no reason.
    const [places, drive] = await Promise.all([
      reverseCandidates([lat, lng]),
      deliveryReach([lat, lng]),
    ]);
    // No road answer, no verdict. See the note on the resolve path below.
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
      known: drive !== null,
      miles: drive ? drive.miles : null,
      measuredBy: drive ? "road" : null,
      inRange: drive ? drive.miles <= DELIVERY_RADIUS_MILES : true,
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
    (placeId
      ? await geocodePlaceId(placeId, { requireDoorstep: kind === "address" })
      : null) ??
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

  // ——— The name a place is known by, kept on the label ———
  //
  // Somebody who works at an office knows the name and not the number, which
  // is the whole reason business search exists. Then the geocoder answers with
  // "1600 Amphitheatre Pkwy, Mountain View, CA" and the name is gone — off the
  // kitchen ticket, off the courier's screen, and off the line the customer
  // reads back to check we understood them.
  //
  // So the picked name goes in front of the resolved address. Not instead of
  // it: a courier needs the street, and a name alone is not somewhere to
  // drive. Coordinates are untouched — this is a label, and the range check
  // and the pickup point are both decided on numbers we fetched.
  //
  // Skipped when it adds nothing, which is what makes this safe to apply
  // without asking whether the pick was a business: for a street address the
  // picked name *is* the street address and is already in the answer, so the
  // test for "did this add information" is the same test either way.
  function nameOn(address: string): string {
    if (!name) return address;
    const already = address.toLowerCase().includes(name.toLowerCase());
    return already ? address : `${name}, ${address}`;
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

  // How far the nearest counter is by road. Every counter, not the one that
  // happens to be nearest in a straight line — see deliveryReach below and
  // the note on the pin path above.
  const drive = await deliveryReach([place.lat, place.lng]);

  // ——— No road answer, no verdict ———
  //
  // This used to fall back to the straight line and decide range on it. That
  // is the one substitution a delivery radius must not accept: a straight line
  // is not a shorter road, it is a different measurement, and in this grid it
  // reads about a third short. A rule of ten road miles enforced against it is
  // a rule of roughly thirteen, applied silently, to the addresses closest to
  // the edge — the exact population it exists to decide.
  //
  // So when Routes cannot answer, nothing here claims a distance. `known` says
  // we could not measure and `miles` is null rather than a number in the wrong
  // unit of truth. Range defers to the checkout, which asks Uber, and Uber is
  // doing its own deliverability calculation rather than reading ours. That is
  // the same choice /api/delivery-area already makes, in the same words.
  if (!drive) {
    console.warn(
      `[geo] no road distance for ${JSON.stringify(place.address)}. Range is` +
        ` deferred to the courier quote until Routes answers again.` +
        ` googleMaps.ts logged the reason.`,
    );
  }

  // ——— Counted when a delivery address is turned away ———
  //
  // Only `kind === "address"`, which is the delivery layer. Pickup and
  // catering search for a town or a ZIP to point a map at, and somebody
  // looking up "Pasadena" to find a counter has not told us they want
  // delivery there.
  //
  // And only this path, never the pin above. A pin can come from the device's
  // own location, and the privacy policy's promise that those coordinates are
  // not stored is one this feature must not quietly break. A typed address is
  // a person saying where they want food sent.
  if (kind === "address" && drive && drive.miles > DELIVERY_RADIUS_MILES) {
    await recordMiss([place.lat, place.lng], drive.miles, "search");
  }

  return Response.json({
    address: nameOn(place.address),
    lat: place.lat,
    lng: place.lng,
    // Whether anything was measured at all. The copy that quoted a figure
    // called it "driving miles" whether or not anything had driven anywhere,
    // and that is how a dead Routes call passed for a working one for weeks.
    known: drive !== null,
    miles: drive ? drive.miles : null,
    minutes: drive?.minutes ?? null,
    measuredBy: drive ? "road" : null,
    inRange: drive ? drive.miles <= DELIVERY_RADIUS_MILES : true,
    radiusMiles: DELIVERY_RADIUS_MILES,
  });
}
