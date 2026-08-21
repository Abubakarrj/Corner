// What an order actually costs, in one place.
//
// Every one of these is pure integer arithmetic on cents. Money in floats is
// how a $12.08 total becomes $12.079999999999998, and a rounding rule applied
// in two places is how the checkout's total stops matching the receipt's — so
// there is one rounding rule, here, and both the client's summary and the
// server's repricing call the same functions.

// The combined sales tax rate at every counter: 9.75%. That is
// California's 7.25% statewide rate (6.00% state, 1.25% local) plus 2.50% of
// Los Angeles County district taxes. All three addresses are in the City of
// Los Angeles, in the same county, so one rate covers them and moving off S
// Catalina St did not change it. A counter outside the county would.
// Prepared food is taxable in California
// whether it's eaten in or taken away, so this applies to the whole order.
//
// It was 9.5% here until Measure A took effect on 1 April 2025, replacing
// Measure H's quarter cent with a half cent. A stale rate is not a display bug:
// the state is owed 9.75% of the sale whatever the checkout printed, so every
// order charged at 9.5% came out of the shop's own margin at remittance time.
//
// Held as a constant rather than fetched, which is a simplification with a real
// edge: tax is charged at the rate for the address the food goes to, so a
// delivery over a district line is charged at that district's rate. Toast
// computes this per order from the restaurant's configured tax rates — when
// that's wired up, the number that comes back from Toast wins over this one.
export const TAX_RATE = 0.0975;

// The tip presets, matching the ones the counter's own checkout offers.
export const TIP_PRESETS = [0.22, 0.2, 0.15] as const;

// Spend this much on food and the shop pays the courier for you.
//
// ——— What "waived" means here, precisely ———
//
// The customer is not charged. Uber still is. The courier is booked at the
// quoted price on the same quote id as always, and the difference comes out of
// the shop's margin — which is the point of the offer, not a side effect of
// it: a $10.99 fee on a $22 order is what makes somebody close the tab, and
// the shop would rather sell $40 of food and absorb the trip.
//
// So nothing about the Uber call changes. What changes is one line on the
// bill, and the order record keeps both numbers so the shop can see what it
// absorbed rather than reading a zero and wondering where the trip went.
//
// ——— Measured on the food, after any discount ———
//
// Not on the total. Tax and tip are not "spending more with the shop", and a
// threshold that counted the tip would be a threshold somebody can cross by
// tipping, which is nobody's idea of a deal. After the discount for the same
// reason the tax is: the number is what they actually spent.
//
// This replaces the free keychain that used to sit at the same $40. A gift
// nothing in the system actually put in the bag, relying on the kitchen to
// remember, against a fee the customer can see on the screen and feel.
export const FREE_DELIVERY_OVER_CENTS = 4000;

// ——— The shop pays half the courier on every other delivery ———
//
// A basket under the threshold used to carry the whole quote, and the quote is
// eleven or thirteen dollars. On a $15 order of bagels that is not a delivery
// fee, it is a second order — the total nearly doubles between the bag and the
// bill, and the number that does it lands at the last screen. The abandonment
// is not really about the money either; it is that nothing earlier in the flow
// predicted it.
//
// So the shop absorbs half. Same lever as the free-delivery threshold above,
// turned down: that one buys a big basket, this one keeps a small one from
// falling over.
//
// ⚠️ This is the shop's money, not a discount on Uber's price. The courier
// still bills the full quote, `deliveryQuotedCents` still carries it, and the
// order record keeps both numbers so the books reconcile against the invoice.
// Anything that shows a customer the halved figure has to show it as the
// shop's contribution and not as what the courier charged — see the note on
// deliveryCoveredCents below, and DeliveryFeeInfo.tsx.
//
// The exposure is uncapped on purpose, because the fee it is halving is
// already bounded: the ten-mile radius puts the worst case at $10.99 + $3.00,
// so the most this can cost on one order is $6.99.
export const DELIVERY_SUBSIDY = 0.5;

// Half-up on the cent, which is what a till does. Math.round() is half-up for
// positives, but it's spelled out because "round the money" is the kind of
// line somebody later replaces with a floor and wonders why totals drift.
function toCents(value: number): number {
  return Math.round(value);
}

/** The tax on a subtotal, at a counter's rate.
 *
 *  ⚠️ `rate` is the counter's own, and `undefined` means TAX_RATE — which is
 *  Los Angeles County's. Optional rather than required on purpose: every
 *  counter but one is on the county rate, and making the common case pass a
 *  number would mean six call sites each remembering which. The one that is
 *  different says so in its record. See `taxRate` in locations.ts. */
export function taxFor(subtotalCents: number, rate?: number): number {
  return toCents(subtotalCents * (rate ?? TAX_RATE));
}

// A tip is a percentage of the food, before tax — tipping on the tax is a
// thing some checkouts quietly do and it isn't defensible.
export function tipFor(subtotalCents: number, rate: number): number {
  return toCents(subtotalCents * rate);
}

export type OrderTotals = {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  /** What the customer is charged for delivery. Zero when it's waived. This
   *  is the one that goes into the total. */
  deliveryCents: number;
  /** What the courier quoted, waived or not. The shop pays this either way,
   *  so it is what the receipt shows crossed out and what the order record
   *  keeps. Zero on a pickup order. */
  deliveryQuotedCents: number;
  /** The part of the quote the shop is absorbing — the whole thing when the
   *  basket cleared the threshold, half of it otherwise, zero on a pickup.
   *
   *  No screen shows it. It is here for the books: the shop's cost on a
   *  delivery is the gap between what Uber invoices and what was charged, and
   *  stating it once beside the two numbers it comes from is better than
   *  leaving whoever reconciles the invoice to work out which subtraction was
   *  meant. Also what the arithmetic is asserted on. */
  deliveryCoveredCents: number;
  /** Whether the shop picked up the whole courier on this one. Still means the
   *  whole thing, not "some of it" — the half-subsidy is on every delivery and
   *  a flag that is true always says nothing. */
  deliveryWaived: boolean;
  tipCents: number;
  totalCents: number;
};

// The whole bill. Discount comes off the food first, so it reduces the tax
// too — which is correct: you don't owe tax on money you didn't spend.
//
// The delivery fee is Uber Direct's quote for this address, passed in rather
// than assumed: a flat rate is a bet that every address costs the same, and
// the shop covers the difference on the far ones. It sits outside the taxable
// base — a delivery charge by a third-party courier isn't part of the sale of
// the food — and outside the tip, which is the kitchen's, not the courier's.
export function totalsFor({
  subtotalCents,
  discountCents = 0,
  deliveryCents = 0,
  tipCents = 0,
  taxRate,
}: {
  subtotalCents: number;
  discountCents?: number;
  deliveryCents?: number;
  tipCents?: number;
  /** The counter's sales tax rate. Undefined is TAX_RATE — see taxFor.
   *
   *  ⚠️ Which counter's, for a delivery, is a question this module cannot
   *  answer and does not pretend to. California sources district tax on
   *  prepared food to the seller's location for a counter sale, and a delivery
   *  across a district line is a harder question than a constant. The callers
   *  pass the kitchen the order leaves from, which is right for pickup and is
   *  the best available answer for delivery until Toast's own per-order tax
   *  is wired up and wins over this — see the note on TAX_RATE. */
  taxRate?: number;
}): OrderTotals {
  // A discount can't take the order below zero, and it can't take the tax
  // negative on the way.
  const discount = Math.min(Math.max(discountCents, 0), subtotalCents);
  const taxed = subtotalCents - discount;
  const taxCents = taxFor(taxed, taxRate);
  const tip = Math.max(tipCents, 0);
  const quoted = Math.max(deliveryCents, 0);

  // The waiver is decided here and nowhere else, which is the whole reason it
  // is in this file. The checkout's summary and the order endpoint's repricing
  // both call this, so they cannot come to different answers about whether a
  // basket cleared the threshold — and "shown one number, charged another" is
  // the failure this module exists to make impossible.
  const waived = quoted > 0 && taxed >= FREE_DELIVERY_OVER_CENTS;
  // Floor, not round. Half of an odd number of cents has to fall somewhere and
  // it falls the customer's way: on a $10.99 quote they pay $5.49 and the shop
  // pays $5.50. One cent is not the point — the point is that the direction is
  // decided once here rather than by whichever rounding somebody reaches for.
  const delivery = waived ? 0 : Math.floor(quoted * (1 - DELIVERY_SUBSIDY));

  return {
    subtotalCents,
    discountCents: discount,
    taxCents,
    deliveryCents: delivery,
    deliveryQuotedCents: quoted,
    deliveryCoveredCents: quoted - delivery,
    deliveryWaived: waived,
    tipCents: tip,
    totalCents: taxed + taxCents + delivery + tip,
  };
}
