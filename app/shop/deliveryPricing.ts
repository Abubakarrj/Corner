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
  /** Uber's distance rate for the band, as published on their dashboard.
   *  Not the whole fee — TRIP_FEE_CENTS is added to it. */
  feeCents: number;
};

// Uber Direct's distance rates, transcribed from direct.uber.com.
//
// These are the distance component and not the whole fee — see the trip fee
// below, which is added to every one of them.
export const DELIVERY_BANDS: readonly DeliveryBand[] = [
  { fromMiles: 0, toMiles: 5, feeCents: 799 },
  { fromMiles: 5, toMiles: 6, feeCents: 899 },
  { fromMiles: 6, toMiles: 7, feeCents: 999 },
  { fromMiles: 7, toMiles: 10, feeCents: 1099 },
];

// California's driver benefits fee, added to every trip in the state under
// Prop 22. Uber bills it on top of the distance rate rather than inside it.
//
// ——— This number has been in and out twice, so: the evidence ———
//
// It was removed on the understanding that the table above was already
// all-in. Two real quotes say otherwise, and both reconcile exactly:
//
//   0.9 mi  →  $7.99 (0–5 band)  + $3.00  =  $10.99  quoted
//   ~6.5 mi →  $9.99 (6–7 band)  + $3.00  =  $12.99  quoted
//
// The $12.99 is the one that mattered: it is not on the card at all, and for
// months there was no way to explain it, because Routes was disabled and the
// distance that picks the band was never known. With Routes answering, the
// arithmetic closes.
//
// It is still only two data points, which is why nothing below asserts the
// sum — explainFee() checks it against the quote every time and declines to
// explain anything it cannot make add up.
export const TRIP_FEE_CENTS = 300;

/** The band a distance falls in, or null past the delivery radius. */
export function bandForMiles(miles: number): DeliveryBand | null {
  if (!Number.isFinite(miles) || miles < 0) return null;
  return DELIVERY_BANDS.find((band) => miles <= band.toMiles) ?? null;
}

export type FeeExplanation = {
  band: DeliveryBand;
  tripFeeCents: number;
  totalCents: number;
};

// The arithmetic behind a quoted fee — but only when it actually is the
// arithmetic behind that quoted fee.
//
// ——— Why this is allowed to give up ———
//
// The quote is the number the customer pays and the number the shop is
// billed; this file never sets it. So an explanation is a claim about
// somebody else's pricing, checked against their answer, and there are
// ordinary reasons for the check to fail: Uber repricing a band, a surge, a
// zone with different terms, or this constant going stale.
//
// When it fails, the sheet shows the quote by itself. A breakdown that is
// right most of the time is worse than none on the one screen whose entire
// job is to show that the number is not padded — being caught out by a
// customer with a calculator is exactly the suspicion it exists to answer.
export function explainFee(
  miles: number | null | undefined,
  feeCents: number | null | undefined,
): FeeExplanation | null {
  if (typeof miles !== "number" || typeof feeCents !== "number") return null;
  const band = bandForMiles(miles);
  if (!band) return null;
  if (band.feeCents + TRIP_FEE_CENTS !== feeCents) return null;
  return { band, tripFeeCents: TRIP_FEE_CENTS, totalCents: feeCents };
}
