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
  /** Uber's flat rate for the band, as published on their dashboard. */
  feeCents: number;
};

// Uber Direct's flat rates, transcribed from direct.uber.com.
//
// These are the whole fee for a band. They went through a spell of being
// treated as a base with California's $3 driver fee added on top, which made
// the table read $10.99 to $13.99 — the shop confirmed these are the flat
// rates Uber charges, so they are printed as they are published.
export const DELIVERY_BANDS: readonly DeliveryBand[] = [
  { fromMiles: 0, toMiles: 5, feeCents: 799 },
  { fromMiles: 5, toMiles: 6, feeCents: 899 },
  { fromMiles: 6, toMiles: 7, feeCents: 999 },
  { fromMiles: 7, toMiles: 10, feeCents: 1099 },
];

// ——— Why no row is highlighted ———
//
// There is no key that reliably picks the customer's band.
//
// By fee: a real order on this shop quoted $12.99, which is not one of the
// four numbers above. Whatever produces that gap — a surcharge, a zone, a
// surge — a fee cannot be matched back to a band it does not equal.
//
// By distance: the miles come from Google Routes and the band comes from
// Uber, and the two are separate opinions about the same drive. Google
// routing 6.9 miles where Uber priced the next band up would light the wrong
// row on a correct bill.
//
// So the table is a reference and the quote is the number. The customer's
// actual fee is printed above it, larger, and nothing claims the two are the
// same thing. A highlight that is right most of the time is worse than none
// on the one screen whose job is showing the arithmetic holds.
