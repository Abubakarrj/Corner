// How an order was paid for.
//
// ——— ⚠️ What this used to decide, and no longer does ———
//
// There were three tenders and one of them, "counter", meant the money moved
// when the bag was handed over. So this module answered a question the order
// endpoint had to ask before it charged anything: *is this order paying now?*
//
// Paying at the window is gone. Every order is settled online, before it
// reaches the kitchen, so there is no longer a tender that means "do not
// charge" — and a module that still answered "does this pay now" would be
// answering yes to everything while looking like it might say no.
//
// ⚠️ The dangerous half of removing it is the direction the default now runs.
// While the counter existed, an unrecognised tender had to mean "not paying",
// because guessing wrong that way merely skipped a charge on an order somebody
// was standing in front of. With the counter gone that same default is free
// food: a page cached before this change sends `tender: "counter"` and no
// token, and a server that reads it as a counter order sends a ticket to the
// kitchen for nothing.
//
// So the endpoint stopped asking about the tender at all. What it asks now is
// whether there is anything to charge, and if there is, whether a token came
// with the order — see /api/shop-order. The tender below is a record of which
// door the money came through, and nothing branches on it but the receipt.

/** The ways to pay, both of which take the money before the kitchen sees the
 *  order. `wallet` is Apple Pay or Google Pay: a different sheet, the same
 *  single-use token, charged through the same processor as a typed card. */
export type Tender = "card" | "wallet";

/** Whether this is a tender the shop takes.
 *
 *  Takes a string rather than a Tender because the caller is a request body:
 *  anything can arrive, including "counter" from a page cached before it went
 *  away. Nothing about charging depends on this — it guards what gets written
 *  to the receipt, so a stale word cannot end up printed as though it were a
 *  way to pay. */
export function isTender(value: string): value is Tender {
  return value === "card" || value === "wallet";
}
