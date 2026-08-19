import { LOCATIONS } from "../../(marketing)/locations/locations";
import { offered } from "../../pickupSchedule";

// The times a counter can still promise, for the checkout to show before
// anybody pays.
//
// ——— Why the browser cannot work this out ———
//
// It knows the hours and it knows the clock, so it could draw a grid of ten
// minute marks on its own. What it cannot know is which of them are sold, and
// that is the entire feature: an app that offers 7:15 to everyone who asks is
// the wall of tickets at opening, drawn beautifully.
//
// So the list comes from here, where the bookings are.
//
// ——— Read-only, deliberately ———
//
// Nothing is held by asking. Somebody who opens the checkout, looks at the
// time and closes the tab has taken nothing from the morning. The seat is
// taken by /api/shop-order at the moment the order is placed, and that is the
// only place a time becomes a promise.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const locationId = new URL(request.url).searchParams.get("locationId");
  const store = LOCATIONS.find((location) => location.id === locationId);
  // A counter we do not have. Not an error worth a body: the checkout asks
  // with whatever the fulfillment store is holding, and a stale id from an
  // old browser should draw no times rather than a red line.
  if (!store) return Response.json({ slots: [] }, { status: 200 });

  const slots = await offered(store);
  // Null means the bookings could not be read. Empty would say "no times
  // left", which is a different and much worse claim — see slotCounts.
  if (slots === null) {
    return Response.json({ error: "api.scheduleUnavailable" }, { status: 503 });
  }

  return Response.json(
    { slots: slots.map((at) => at.toISOString()) },
    // No caching. The whole value of the answer is that it is current, and a
    // list of free times cached for a minute is a list of times that may have
    // been taken for a minute.
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
