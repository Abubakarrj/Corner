// Spending a gift card against a food order.
//
// ——— What this suite can and cannot reach ———
//
// Two halves, and the difference is worth stating rather than glossing.
//
// The first half is real: the arithmetic that decides what a card pays and what
// is left lives in app/giftTender.ts precisely so it can be handed numbers and
// asked. Every edge that matters is a number, and every one is here.
//
// The second half is not. /api/shop-order calls next/headers' cookies(), which
// throws outside a request scope, so this suite cannot drive that endpoint the
// way tests/giftPurchase.test.ts drives /api/gift-card. What it does instead is
// read the endpoint's own source and check the ordering invariants that make
// the money safe. ⚠️ That is a weaker test and it is labelled as one: it proves
// the lines are in the right order, not that they behave. It is here because
// the alternative — the ordering having no test at all — is how the tender
// regression at the top of tenderGate.test.ts happened.

import { readFileSync } from "node:fs";
import { giftSplit, spendable } from "../app/giftTender";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

// ——— What the card pays ———
const split = (balance: number, total: number) => giftSplit(balance, total);
const shows = (balance: number, total: number) => JSON.stringify(split(balance, total));

// A card worth less than the bill pays all of itself.
ok("a small card pays what it has",
   split(500, 1200).appliedCents === 500, shows(500, 1200));
ok("and the rest is still owed",
   split(500, 1200).dueNowCents === 700, shows(500, 1200));

// ⚠️ A card worth more than the bill pays the bill and no more. Square refuses
// an over-redemption, and a card emptied into a smaller bill is the customer's
// money gone.
ok("a big card pays only the bill",
   split(5000, 1200).appliedCents === 1200, shows(5000, 1200));
ok("and leaves nothing owed",
   split(5000, 1200).dueNowCents === 0, shows(5000, 1200));

// ⚠️ Exactly covering it. The case that reads as "no payment was made" to code
// that checks a total for truthiness, and refuses an order already paid for.
ok("a card that covers it exactly pays all of it",
   split(1200, 1200).appliedCents === 1200, shows(1200, 1200));
ok("and leaves zero, which is an answer rather than an absence",
   split(1200, 1200).dueNowCents === 0, shows(1200, 1200));

// ——— The two always add up ———
//
// Anything else is money made or lost in arithmetic.
for (const [balance, total] of [[0, 0], [1, 1], [500, 1200], [5000, 1200], [1200, 1200], [99999, 3]]) {
  const answer = split(balance, total);
  ok(`${balance} against ${total} adds back up to the total`,
     answer.appliedCents + answer.dueNowCents === total, JSON.stringify(answer));
  ok(`and neither half of ${balance}/${total} is negative`,
     answer.appliedCents >= 0 && answer.dueNowCents >= 0, JSON.stringify(answer));
  ok(`and ${balance} is never spent beyond what it holds`,
     answer.appliedCents <= balance, JSON.stringify(answer));
}

// ——— Numbers that should not arrive, and what happens if they do ———
//
// ⚠️ Not defensiveness for its own sake. Either of these reaching the
// arithmetic unchecked is a charge for a number nobody intended.
ok("a negative balance pays nothing rather than charging extra",
   split(-500, 1200).appliedCents === 0 && split(-500, 1200).dueNowCents === 1200,
   shows(-500, 1200));
ok("a negative total owes nothing rather than refunding",
   split(500, -1200).appliedCents === 0 && split(500, -1200).dueNowCents === 0,
   shows(500, -1200));
ok("fractional cents do not survive",
   Number.isInteger(split(500.7, 1200.9).appliedCents) &&
     Number.isInteger(split(500.7, 1200.9).dueNowCents),
   shows(500.7, 1200.9));

// ——— Which cards can be spent ———
//
// ⚠️ Every false here has to be answered identically by the caller, and
// identically to a card that was not found. "That number is real but
// deactivated" confirms a guess was a real number, and a real number is money.
ok("an active card with a balance is spendable",
   spendable({ state: "ACTIVE", balanceCents: 500 }) === true);
ok("an empty card is not", spendable({ state: "ACTIVE", balanceCents: 0 }) === false);
ok("a deactivated card is not",
   spendable({ state: "DEACTIVATED", balanceCents: 5000 }) === false);
ok("nor a pending one", spendable({ state: "PENDING", balanceCents: 5000 }) === false);
ok("nor a blocked one", spendable({ state: "BLOCKED", balanceCents: 5000 }) === false);
ok("nor one in a state nobody has heard of",
   spendable({ state: "SOMETHING_NEW", balanceCents: 5000 }) === false);

// ——— ⚠️ Source checks, which prove ordering and not behaviour ———
//
// The money is safe because of the order these three things happen in:
//
//   1. charge the card for what is left
//   2. redeem the gift card
//   3. tell the kitchen
//
// Between 1 and 2, a declined card leaves the gift card untouched — a decline
// is the common failure and this ordering makes it free. Between 2 and 3, a
// redemption that fails is still a clean stop: nothing has been made, and the
// card charge is simply given back. After 3 it is too late to say no, which is
// why 2 must not be after it.
const endpoint = readFileSync("app/api/shop-order/route.ts", "utf8");
const at = (needle: string) => endpoint.indexOf(needle);

const charge = at("payment = await chargeSquare({");
const redeem = at("const spent = await redeemGiftCard({");
const kitchen = at("const sent = await createPosOrder(posDraft);");
ok("the endpoint charges, redeems and sends to the kitchen",
   charge > 0 && redeem > 0 && kitchen > 0, `${charge} ${redeem} ${kitchen}`);
ok("⚠️ and the gift card is redeemed after the charge, so a decline costs nothing",
   charge < redeem, `charge at ${charge}, redeem at ${redeem}`);
ok("⚠️ and before the kitchen, so a failed redemption can still be undone",
   redeem < kitchen, `redeem at ${redeem}, kitchen at ${kitchen}`);

// ⚠️ The refund is of what was charged. With a gift card against the order the
// charged amount and the order total are different numbers, and refunding the
// larger one hands back money that was never taken.
ok("the refund is of what was charged, not of the order total",
   /refundSquare\(payment\.paymentId, dueNowCents, scheduleId\)/.test(endpoint),
   endpoint.slice(at("refundSquare(payment.paymentId"), at("refundSquare(payment.paymentId") + 70));
// And the other half of the same undo: a card debited for food nobody makes.
ok("and undoing a payment also puts a spent gift card back",
   /async function undoPayment[\s\S]{0,900}?refundGiftCard\(/.test(endpoint));

// The charge itself is for the remainder. Charging the total alongside a
// redemption takes the money twice.
ok("the charge is for what is left after the card, not the whole total",
   /payment = await chargeSquare\(\{[\s\S]{0,700}?amountCents: dueNowCents,/.test(endpoint));

// ⚠️ And the number is not written down anywhere on this path.
//
// Checked line by line rather than with one regex over the whole file. The
// first version of this used `console\.[a-z]+\([^)]*giftGan`, which cannot
// see past the first close-bracket in the call — so `console.warn(`...
// ${clientIp(request)} for ${giftGan}`)` sailed through it. A mutation put
// exactly that line in and the suite stayed green.
const lines = endpoint.split("\n");
const logsTheNumber = lines.filter(
  (line) => /console\.(log|info|warn|error|debug)/.test(line) && /giftGan/.test(line),
);
ok("the number is read",
   endpoint.includes("const giftGan = readText(body, \"giftCardGan\""), "");
ok("⚠️ and never logged",
   logsTheNumber.length === 0, logsTheNumber.join(" | "));
ok("and never put in the answer",
   !/giftGan/.test(endpoint.slice(at("ok: true,"))), "giftGan appears after the response opens");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
