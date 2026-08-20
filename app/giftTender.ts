import "server-only";

// How much of an order a gift card pays for.
//
// ——— Why this is a function and not four lines in the route ———
//
// It is arithmetic on two numbers, and /api/shop-order is a thousand lines
// where a wrong number is somebody's money. Pulled out here it can be handed a
// balance and a total and asked what it thinks, which is the only way the
// edges get looked at: a card worth more than the bill, a card worth exactly
// the bill, a card with nothing on it, a bill of nothing.
//
// ⚠️ The zero case is the one to watch. A card that covers the whole order
// leaves nothing to charge, and code that reads "nothing to charge" as "no
// payment was made" refuses an order that is already paid for. That is the same
// shape as the bug that once refused every customer paying at the window, one
// clause further along, and it is why `dueNowCents === 0` is a first-class
// answer here rather than a falsy value somewhere in a condition.
//
// ——— What this deliberately does not do ———
//
// No network, no Square, no number. It is handed what a lookup already found.
// The card's number never reaches this file.

export type GiftSplit = {
  /** What the card pays. Never more than the order, and never more than the
   *  card holds. */
  appliedCents: number;
  /** What is left to settle — by card, or at the counter. Zero is a real
   *  answer and means the order is fully paid for. */
  dueNowCents: number;
};

/** Whether a card that was found is a card that can be spent.
 *
 *  ⚠️ Callers must answer every `false` here identically, and identically to a
 *  card that was not found at all. A gift account number is a bearer
 *  instrument: telling somebody "that number is real but deactivated" confirms
 *  their guess was a real number, which is the whole game. */
export function spendable(card: { state: string; balanceCents: number }): boolean {
  return card.state === "ACTIVE" && card.balanceCents > 0;
}

/** Split an order between a gift card and whatever settles the rest. */
export function giftSplit(balanceCents: number, totalCents: number): GiftSplit {
  // Defensive against both directions. A negative balance is not a thing Square
  // returns, and a negative total is not a thing this app computes, but the
  // consequence of either reaching the arithmetic is a charge for a number
  // nobody intended — so neither gets to.
  const balance = Math.max(0, Math.floor(balanceCents));
  const total = Math.max(0, Math.floor(totalCents));
  const appliedCents = Math.min(balance, total);
  return { appliedCents, dueNowCents: total - appliedCents };
}
