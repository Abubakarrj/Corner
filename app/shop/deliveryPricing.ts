// Uber Direct's rate card for this shop, and the one rule about using it.
//
// ——— The card explains the fee. It does not set it. ———
//
// The number on the checkout comes from Uber's own quote for the address —
// /api/delivery/quote asks, and app/uberDirect.ts passes `fee` back untouched.
// That is the number the shop is billed and the number the customer is
// charged, and nothing in this file is allowed to override it.
//
// What this file is for is the sentence underneath it. "Delivery $10.99" with
// no explanation is the line people assume is a made-up markup, and on this
// shop it isn't one: it's what the courier network charges to drive to that
// address, passed through at cost. The bands below are how Uber works that
// out, so the customer can see the shape of it.
//
// Which is also why the quote wins on the screen. If Uber reprices a band, or
// adds a surcharge, or the trip crosses into a zone with different terms, the
// card here goes stale and the quote does not. Deriving the displayed fee from
// these numbers would mean showing a price the shop cannot honour — so this is
// only ever an explanation shown *next to* the real number, never the source
// of it.
//
// Contracted rates as shown on direct.uber.com. Update them here if Uber
// changes the agreement, and note that the checkout keeps working correctly in
// the meantime — it will just be explaining itself with the wrong table.

export type DeliveryBand = {
  /** Miles from the counter, exclusive of the band below it. */
  fromMiles: number;
  toMiles: number;
  feeCents: number;
};

export const DELIVERY_BANDS: readonly DeliveryBand[] = [
  { fromMiles: 0, toMiles: 5, feeCents: 799 },
  { fromMiles: 5, toMiles: 6, feeCents: 899 },
  { fromMiles: 6, toMiles: 7, feeCents: 999 },
  { fromMiles: 7, toMiles: 10, feeCents: 1099 },
];

// California adds this to every trip, and it goes to the courier rather than
// to Uber or to the shop — it's the state's minimum earnings guarantee for app
// drivers. Worth naming rather than burying, because it's the difference
// between a $7.99 rate card and an $10.99 line on the bill, and somebody
// comparing the two deserves to know which part is which.
//
// (New York City is $5 and Seattle is $10 under the same scheme. This shop is
// in Los Angeles, so only California's applies.)
export const CALIFORNIA_TRIP_CENTS = 300;

/** The band a distance falls in, or null past the last one. */
export function bandFor(miles: number): DeliveryBand | null {
  return DELIVERY_BANDS.find((band) => miles > band.fromMiles && miles <= band.toMiles)
    ?? (miles <= 0 ? DELIVERY_BANDS[0] : null);
}
