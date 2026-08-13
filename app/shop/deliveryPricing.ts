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
  /** The contracted rate for the band, before the trip fee below. This is the
   *  number on Uber's rate card and it is never what anybody pays. */
  baseCents: number;
};

export const DELIVERY_BANDS: readonly DeliveryBand[] = [
  { fromMiles: 0, toMiles: 5, baseCents: 799 },
  { fromMiles: 5, toMiles: 6, baseCents: 899 },
  { fromMiles: 6, toMiles: 7, baseCents: 999 },
  { fromMiles: 7, toMiles: 10, baseCents: 1099 },
];

// California adds this to every trip, and it goes to the courier rather than
// to Uber or to the shop — it's the state's minimum earnings guarantee for app
// drivers.
//
// (New York City is $5 and Seattle is $10 under the same scheme. This shop is
// in Los Angeles, so only California's applies.)
export const CALIFORNIA_TRIP_CENTS = 300;

/** What a band actually costs. Uber's quote comes back with the trip fee
 *  already in it — a 6–7 mile delivery quotes at $12.99, not $9.99 — so this
 *  is the number to put in front of a customer.
 *
 *  The first cut showed the rate card and the surcharge as separate lines and
 *  left the addition to the reader. It was accurate and it was the wrong
 *  shape: somebody checking a $12.99 line against a table found no $12.99 in
 *  it. A price explainer whose numbers don't appear on the bill it explains is
 *  doing the opposite of its job, so the table shows what is charged and the
 *  breakdown moved to a footnote. */
export function chargedCents(band: DeliveryBand): number {
  return band.baseCents + CALIFORNIA_TRIP_CENTS;
}

/** The band a quoted fee came off, or null when it matches none of them.
 *
 *  ——— Why the fee identifies the band, and the distance does not ———
 *
 *  Every band is a different price, so a $12.99 quote is the 6–7 mile band and
 *  can be nothing else. That makes the fee a better key than a distance, for a
 *  reason worth stating plainly: the fee is what Uber charged, and a distance
 *  is a second opinion about the same drive.
 *
 *  This used to match on road miles from Google Routes. Two problems, and the
 *  smaller one is that Routes can be unreachable — the shop has spent a while
 *  with a key restriction that made it answer nothing, and the explainer
 *  quietly lost its highlight. The larger one is what happens when Routes
 *  works and disagrees. Google routing 6.9 miles where Uber priced the 7–10
 *  band would light up the $12.99 row on a bill that says $13.99, and the one
 *  screen whose job is showing that the arithmetic holds would be the screen
 *  contradicting the receipt.
 *
 *  So the band comes off the fee. Null when nothing matches — a surge, a zone
 *  with different terms, a promotion — and no row lights up, which is the
 *  honest answer: the rate card did not produce this number. */
export function bandForFee(feeCents: number): DeliveryBand | null {
  return DELIVERY_BANDS.find((band) => chargedCents(band) === feeCents) ?? null;
}
