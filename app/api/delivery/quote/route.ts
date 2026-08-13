import { DELIVERY_RADIUS_MILES } from "../../../(marketing)/locations/locations";
import { driveBetween, geocode } from "../../../googleMaps";
import { PREP_MINUTES, SHOP_ADDRESS_PARTS } from "../../../shopFacts";
import { isUberConfigured, quoteDelivery, structuredAddress } from "../../../uberDirect";
import { deliveryOrigin } from "../../../storePlaces";

// What a courier will charge to take this order to this address, and when
// they'll have it there.
//
// Called from the checkout when the order is going out for delivery, so the
// fee on the summary is the fee Uber quoted for that address rather than a
// number the shop invented. The quote id comes back with it: /api/shop-order
// hands that same id to Uber when it books the courier, which is what stops
// the customer being shown one price and the shop being billed another.
//
// The address is re-geocoded here. It arrives as text — the visitor picked it
// on the finder, and it has been sitting in localStorage since — so nothing
// about its coordinates is known until this asks.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "api.badJson" }, { status: 400 });
  }

  const address = (payload as { address?: unknown })?.address;
  if (typeof address !== "string" || address.trim().length === 0) {
    return Response.json({ error: "api.missingAddress" }, { status: 400 });
  }

  // Resolved from the shop's address rather than the pair typed beside it.
  // This is the point a courier is sent to; a block's worth of error in it is
  // somebody walking up and down W 8th Street with a bag. See storePlaces.ts.
  const origin = await deliveryOrigin();

  const place = await geocode(address.trim(), origin);
  if (!place) {
    return Response.json(
      { error: "api.addressNotFound" },
      { status: 404 },
    );
  }

  const drive = await driveBetween(origin, [place.lat, place.lng]);
  if (drive && drive.miles > DELIVERY_RADIUS_MILES) {
    return Response.json(
      {
        error: `That address is ${drive.miles.toFixed(1)} driving miles out; we deliver within ${DELIVERY_RADIUS_MILES}.`,
        outOfRange: true,
      },
      { status: 422 },
    );
  }

  if (!isUberConfigured()) {
    return Response.json(
      { error: "api.deliveryDown" },
      { status: 503 },
    );
  }

  const quote = await quoteDelivery({
    pickupAddress: structuredAddress(SHOP_ADDRESS_PARTS),
    pickupLat: origin[0],
    pickupLng: origin[1],
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
    // Road miles or nothing. driveBetween() returns null when Routes is
    // unreachable, and /api/geo falls back to a straight line there — that
    // fallback is fine for a radius check, which only has to be generous, and
    // wrong here. A straight line is always shorter than the drive, so it
    // would light up a cheaper band than the one the customer was charged and
    // make our own arithmetic look padded. No number beats a misleading one:
    // the modal drops the distance line and shows the rate card alone.
    miles: drive ? Number(drive.miles.toFixed(1)) : null,
  });
}
