import {
  DELIVERY_RADIUS_MILES,
  addressParts,
} from "../../../(marketing)/locations/locations";
import { driveBetween, geocode } from "../../../googleMaps";
import { PREP_MINUTES } from "../../../shopFacts";
import { isUberConfigured, quoteDelivery, structuredAddress } from "../../../uberDirect";
import { deliveryOrigin, deliveryStoreFor } from "../../../storePlaces";

// What a courier will charge to take this order to this address, and when
// they'll have it there.
//
// Called from the checkout when the order is going out for delivery, so the
// fee on the summary is the fee Uber quoted for that address rather than a
// number the shop invented. The quote id comes back with it: /api/shop-order
// hands that same id to Uber when it books the courier, which is what stops
// the customer being shown one price and the shop being billed another.
//
// ——— The pin comes first, the words second ———
//
// ⚠️ When coordinates arrive with the address, they are the destination and
// this does not geocode anything. That is the point of PinPicker: the customer
// placed that point on a map, and re-deriving one from the address string
// would throw their answer away and substitute a guess — the exact thing the
// picker was built to stop.
//
// Geocoding stays as the fallback for a delivery chosen before the picker
// existed, which is a plain address in somebody's localStorage with no point
// attached.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "api.badJson" }, { status: 400 });
  }

  const body = payload as { address?: unknown; lat?: unknown; lng?: unknown } | null;
  const address = body?.address;
  if (typeof address !== "string" || address.trim().length === 0) {
    return Response.json({ error: "api.missingAddress" }, { status: 400 });
  }

  const pinLat = Number(body?.lat);
  const pinLng = Number(body?.lng);
  const pinned =
    Number.isFinite(pinLat) &&
    Number.isFinite(pinLng) &&
    Math.abs(pinLat) <= 90 &&
    Math.abs(pinLng) <= 180;

  // Resolved from the shop's address rather than the pair typed beside it.
  // This is the point a courier collects from; a block's worth of error in it
  // is somebody walking up and down S Catalina Street with a bag. See
  // storePlaces.ts.
  //
  // Chosen against the destination when there is a pin, so the kitchen that
  // serves this address is the one that gets the job. Without a pin there is
  // no destination to choose against until the geocode lands, so the first
  // delivering kitchen biases that lookup and the real origin is taken after.
  const origin = await deliveryOrigin(pinned ? [pinLat, pinLng] : undefined);

  const place = pinned
    ? { address: address.trim(), lat: pinLat, lng: pinLng }
    : await geocode(address.trim(), origin);

  if (!place) {
    return Response.json(
      { error: "api.addressNotFound" },
      { status: 404 },
    );
  }

  // Now that the destination is known either way, settle which kitchen it
  // leaves from. Identical to `origin` above on the pinned path and on a
  // one-shop deployment; different on a geocoded address that turned out to be
  // nearer a second kitchen.
  //
  // The store and not only its point, because the courier is handed an address
  // as well as a coordinate and those two have to name the same counter.
  const { store, place: pickup } = await deliveryStoreFor([place.lat, place.lng]);
  const from = pickup.position;

  const drive = await driveBetween(from, [place.lat, place.lng]);

  // ——— Road miles or no verdict ———
  //
  // The shop's rule is ten *driving* miles, so it is enforced on a driving
  // distance or it is not enforced. A straight-line stand-in was tried here
  // and taken out again: it reads about a third short in this grid, so a
  // ten-mile rule applied to it is a thirteen-mile rule, applied silently,
  // exactly to the addresses near the edge.
  //
  // When Routes cannot answer, this falls through to Uber rather than
  // guessing. Uber runs its own deliverability calculation between the two
  // points and declines what it will not carry, which is a real gate rather
  // than arithmetic we would be inventing — and it is the gate that decides
  // whether a delivery actually happens.
  if (drive && drive.miles > DELIVERY_RADIUS_MILES) {
    return Response.json(
      {
        error: `That address is ${drive.miles.toFixed(1)} driving miles out; we deliver within ${DELIVERY_RADIUS_MILES}.`,
        outOfRange: true,
      },
      { status: 422 },
    );
  }
  if (!drive) {
    console.warn(
      `[delivery] no road distance for ${JSON.stringify(place.address)}.` +
        ` The ${DELIVERY_RADIUS_MILES}-mile rule is not being applied to this` +
        ` order; Uber's own deliverability check is the only gate on it.`,
    );
  }

  if (!isUberConfigured()) {
    return Response.json(
      { error: "api.deliveryDown" },
      { status: 503 },
    );
  }

  const quote = await quoteDelivery({
    pickupAddress: structuredAddress(addressParts(store)),
    pickupLat: from[0],
    pickupLng: from[1],
    dropoffAddress: place.address,
    dropoffLat: place.lat,
    dropoffLng: place.lng,
    // The courier shouldn't arrive before the food does.
    readyAt: new Date(Date.now() + PREP_MINUTES * 60_000),
  });

  if (!quote.ok) {
    console.error(`[delivery] quote failed: ${quote.reason}`);
    return Response.json(
      {
        error: quote.undeliverable
          ? "api.noCourierPickupOpen"
          : "api.noQuoteTryAgain",
        outOfRange: quote.undeliverable,
      },
      { status: quote.undeliverable ? 422 : 502 },
    );
  }

  return Response.json({
    quoteId: quote.quote.quoteId,
    feeCents: quote.quote.feeCents,
    etaMinutes: quote.quote.etaMinutes,
    expiresAt: quote.quote.expiresAt,
    address: place.address,
    // How far the driver goes, for the explainer behind the (i) on the
    // delivery line. Uber prices by distance band, so showing the distance is
    // what lets somebody check the fee rather than take it on faith.
    //
    // Road miles or nothing, and null is a real answer: driveBetween() returns
    // it whenever Routes is unreachable, and there is no substitute worth
    // printing. Uber picked its band from its own measurement of this trip, so
    // a number of ours that came from anywhere but a road route would light up
    // a band the customer was not charged for and make the shop's arithmetic
    // look padded on the one screen built to show it isn't. No number beats a
    // misleading one: the modal drops the distance line and shows the rate
    // card alone.
    miles: drive ? Number(drive.miles.toFixed(1)) : null,
  });
}
