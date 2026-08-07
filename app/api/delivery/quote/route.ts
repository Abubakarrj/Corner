import { DELIVERY_ORIGIN, DELIVERY_RADIUS_MILES } from "../../../(marketing)/locations/locations";
import { driveBetween, geocode } from "../../../googleMaps";
import { PREP_MINUTES, SHOP_ADDRESS_PARTS } from "../../../shopFacts";
import { isUberConfigured, quoteDelivery, structuredAddress } from "../../../uberDirect";

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

  const place = await geocode(address.trim(), DELIVERY_ORIGIN.position);
  if (!place) {
    return Response.json(
      { error: "api.addressNotFound" },
      { status: 404 },
    );
  }

  const drive = await driveBetween(DELIVERY_ORIGIN.position, [place.lat, place.lng]);
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
    pickupLat: DELIVERY_ORIGIN.position[0],
    pickupLng: DELIVERY_ORIGIN.position[1],
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
  });
}
