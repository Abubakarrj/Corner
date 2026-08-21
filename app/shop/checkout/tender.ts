// How an order is paid for, named once for both sides of the wire.
//
// ——— ⚠️ Why this is its own module ———
//
// The tender used to be a type in PaymentSection.tsx, which is a client
// component, and the server could not import it. So /api/shop-order decided
// whether to charge with a string comparison of its own:
//
//     const payingNow = readText(body, "tender", 16) === "card";
//
// That worked while there were exactly two tenders and one of them took money.
// It is a trap the moment a third arrives: a wallet tender would sail through
// that check as "not card", the endpoint would place the order without
// charging, and the customer would be told they had paid. An order that reaches
// the kitchen unpaid is the worst bug this checkout can have, and it would have
// been introduced by adding a word to a union in a different file.
//
// So the answer lives here, in a module with no "use client" on it, and both
// the browser and the endpoint read the same one. Adding a tender means adding
// it to one of the two lists below, deliberately, rather than remembering to
// grep for a string.

/** The ways to pay. `wallet` is Apple Pay: a different sheet, the same
 *  single-use token, charged through the same processor as a typed card. */
export type Tender = "counter" | "card" | "wallet";

/** The tenders that take the money before the order goes to the kitchen.
 *
 *  ⚠️ Paying at the window is not an unpaid order — it is the tender this shop
 *  has always had, settled at the counter. What this set decides is only which
 *  ones the *server* must charge before it accepts anything. */
const PAYS_NOW: readonly string[] = ["card", "wallet"];

/** Whether this tender means money moves now.
 *
 *  Takes a string rather than a Tender because the server's caller is a request
 *  body: anything can arrive, and an unrecognised word has to be false — an
 *  order that skips the charge is recoverable at the counter, and one that
 *  claims a charge that never happened is not. */
export function paysNow(tender: string): boolean {
  return PAYS_NOW.includes(tender);
}
