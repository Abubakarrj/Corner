// What an order actually costs, in one place.
//
// Every one of these is pure integer arithmetic on cents. Money in floats is
// how a $12.08 total becomes $12.079999999999998, and a rounding rule applied
// in two places is how the checkout's total stops matching the receipt's — so
// there is one rounding rule, here, and both the client's summary and the
// server's repricing call the same functions.

// Los Angeles County combined sales tax: 9.5% (6.00% state, 0.25% county,
// 3.25% district). Prepared food is taxable in California whether it's eaten
// in or taken away, so this applies to the whole order.
//
// Held here as a constant rather than fetched, which is a simplification with
// a real edge: tax is charged at the rate for the address the food goes to,
// so a delivery over a district line is charged at that district's rate. Toast
// computes this per order from the restaurant's configured tax rates — when
// that's wired up, the number that comes back from Toast wins over this one.
export const TAX_RATE = 0.095;

// The tip presets, matching the ones the counter's own checkout offers.
export const TIP_PRESETS = [0.22, 0.2, 0.15] as const;

// Half-up on the cent, which is what a till does. Math.round() is half-up for
// positives, but it's spelled out because "round the money" is the kind of
// line somebody later replaces with a floor and wonders why totals drift.
function toCents(value: number): number {
  return Math.round(value);
}

export function taxFor(subtotalCents: number): number {
  return toCents(subtotalCents * TAX_RATE);
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
  deliveryCents: number;
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
}: {
  subtotalCents: number;
  discountCents?: number;
  deliveryCents?: number;
  tipCents?: number;
}): OrderTotals {
  // A discount can't take the order below zero, and it can't take the tax
  // negative on the way.
  const discount = Math.min(Math.max(discountCents, 0), subtotalCents);
  const taxed = subtotalCents - discount;
  const taxCents = taxFor(taxed);
  const tip = Math.max(tipCents, 0);
  const delivery = Math.max(deliveryCents, 0);
  return {
    subtotalCents,
    discountCents: discount,
    taxCents,
    deliveryCents: delivery,
    tipCents: tip,
    totalCents: taxed + taxCents + delivery + tip,
  };
}
