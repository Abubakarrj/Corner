// Which orders have to bring money with them.
//
// ——— The regression this exists to stop ———
//
// Wiring the charge in put a gate on the order endpoint that read
//
//   if (isSquarePaymentsConfigured()) { if (!paymentToken) refuse }
//
// which was right about card orders and catastrophic about every other one. The
// moment Square was configured, choosing "pay at the window" — the tender this
// shop had always had, and the default — was answered with "we couldn't read
// your card". Every counter order in the shop, refused, by the feature that was
// supposed to add a second way to pay rather than remove the first.
//
// ——— ⚠️ And what changed when the window went away ———
//
// Paying at the counter is gone: every order is settled online before the
// kitchen sees it. That turns the gate inside out.
//
// While the counter existed, the safe default for an unrecognised tender was
// "not paying now" — guessing that way merely skipped a charge on an order
// somebody was standing in front of. With one way to pay, that same default is
// free food: a page cached before the change sends `tender: "counter"` and no
// token, and an endpoint that still reads tenders sends a ticket to the kitchen
// for nothing.
//
// So the endpoint stopped reading the tender. It asks whether anything is owed
// and whether a token came with the order, and it refuses an order it cannot
// charge — including on a deployment with no processor at all, which used to be
// covered by the window and is now a shop giving breakfast away.

import { readFileSync } from "node:fs";
import { isTender } from "../app/shop/checkout/tender";
import { isSquarePaymentsConfigured } from "../app/squarePayments";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

/** The gate, as the endpoint states it.
 *
 *  ⚠️ No tender in it. That is the whole change: what decides is what is owed
 *  and whether a token arrived, so a stale or invented tender cannot talk its
 *  way past the charge. The source check at the bottom is what keeps this copy
 *  and the original in step. */
function mustPayNow(
  hasToken: boolean,
  dueNowCents = 1,
): "charge" | "refuse" | "unavailable" | "proceed" {
  if (!isSquarePaymentsConfigured() && dueNowCents > 0) return "unavailable";
  if (isSquarePaymentsConfigured() && dueNowCents > 0) {
    return hasToken ? "charge" : "refuse";
  }
  return "proceed";
}

const configure = () => {
  process.env.SQUARE_ACCESS_TOKEN = "token";
  process.env.SQUARE_LOCATION_ID = "L-ours";
  process.env.SQUARE_APPLICATION_ID = "sandbox-app";
};
const unconfigure = () => {
  delete process.env.SQUARE_ACCESS_TOKEN;
  delete process.env.SQUARE_LOCATION_ID;
  delete process.env.SQUARE_APPLICATION_ID;
};

configure();
ok("Square is configured for these", isSquarePaymentsConfigured() === true);

// ——— Paying, which is now the only way to order ———
ok("an order with a token is charged", mustPayNow(true) === "charge", mustPayNow(true));
// Owes money and brought nothing to pay with. A broken or stale client, and
// confirming it would promise a charge that never happened while the kitchen
// made the food.
ok("an order with no token is refused", mustPayNow(false) === "refuse", mustPayNow(false));

// ——— ⚠️ A gift card that covers the whole order ———
//
// The one case where no token is correct: there is nothing left to charge.
// Demanding one here refuses an order that is already fully paid for.
ok("a fully covered order needs no card",
   mustPayNow(false, 0) === "proceed", mustPayNow(false, 0));
ok("and is not charged a second time", mustPayNow(true, 0) === "proceed", mustPayNow(true, 0));
ok("a partly covered order still charges the difference",
   mustPayNow(true, 250) === "charge", mustPayNow(true, 250));
ok("and is still refused without a card",
   mustPayNow(false, 250) === "refuse", mustPayNow(false, 250));

// ——— ⚠️ With no processor at all ———
//
// This is the case the window used to cover, and the one that turned dangerous
// when it went. There is no second way to pay now, so an order this endpoint
// cannot charge is an order the shop makes for free. It has to be refused
// rather than placed.
unconfigure();
ok("⚠️ with no processor an order is refused, not placed unpaid",
   mustPayNow(false) === "unavailable", mustPayNow(false));
ok("⚠️ and having a token does not help, because nothing can charge it",
   mustPayNow(true) === "unavailable", mustPayNow(true));
// Still true with nothing to charge: a gift card covers it and no processor is
// needed.
ok("a fully covered order still goes through with no processor",
   mustPayNow(false, 0) === "proceed", mustPayNow(false, 0));
configure();

// ——— What counts as a tender at all ———
//
// Nothing about charging depends on this any more; it guards what gets written
// to the receipt, so a stale word cannot be printed as though it were a way to
// pay.
ok("a card is a tender", isTender("card"));
ok("and a wallet is", isTender("wallet"));
// ⚠️ The word a page cached before this change still sends.
ok("⚠️ but the counter is not, any more", !isTender("counter"));
for (const junk of ["", "cash", "COUNTER", "Card", "window", "bitcoin"]) {
  ok(`${JSON.stringify(junk)} is not a tender`, !isTender(junk));
}

// ——— And the endpoint still asks the same question ———
//
// ⚠️ Everything above tests a copy of the gate, so it is only worth anything
// while the copy and the original agree. The failure mode is somebody editing
// /api/shop-order, leaving this file alone, and getting a green suite over the
// exact regression it was written for.
const endpoint = readFileSync("app/api/shop-order/route.ts", "utf8");
ok("the charge is gated on what is owed, not on configuration alone",
   /if \(isSquarePaymentsConfigured\(\) && dueNowCents > 0\)/.test(endpoint));
// ⚠️ The line that closes the free-food hole. Without it a deployment with no
// Square credentials takes orders it cannot charge for.
ok("⚠️ and an order it cannot charge is refused rather than placed",
   /if \(!isSquarePaymentsConfigured\(\) && dueNowCents > 0\)/.test(endpoint));
ok("so no bare configuration check guards the token",
   !/if \(isSquarePaymentsConfigured\(\)\) \{\s*\n\s*if \(!paymentToken\)/.test(endpoint));
// ⚠️ The tender must not be back in the condition. That is the shape that reads
// "counter" as permission to skip the charge.
ok("⚠️ and the tender is not part of the decision",
   !/payingNow/.test(endpoint), "payingNow is back in the endpoint");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
