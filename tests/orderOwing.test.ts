// What is still owed on an order, and when the app is not entitled to say.
//
// ——— The bug this is written against ———
//
// Every screen after the checkout — the confirmation, the tracker — decided
// what somebody owed from the fulfillment mode alone. A delivery said "pay the
// courier when it arrives"; anything else said "pay at the window when you
// collect". That was correct while every order in the shop was settled at a
// counter.
//
// Then the checkout learned to charge a card and to spend a gift card, and
// nothing downstream was told. Somebody who paid online opened the tracker to
// see where their food was and read an instruction to pay for it again. That is
// the worst thing a receipt can be wrong about, and it is wrong in the
// direction that costs the customer rather than the shop.
//
// amountOwing() is the one answer those screens now read, so this suite is
// about the three states it has to keep apart — owes nothing, owes the bill,
// and cannot say — and about never producing a confident number from a record
// that does not carry one.

import { amountOwing, orderTotals, type PlacedOrder } from "../app/account";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

/** An order as the checkout records one. Totals are snapshotted on every real
 *  order, so they are the default here and left out only where a test is about
 *  an old record that has none. */
function order(over: Partial<PlacedOrder> = {}): PlacedOrder {
  return {
    id: "A-1",
    placedAt: Date.parse("2026-08-21T15:00:00Z"),
    items: [],
    subtotalCents: 1000,
    taxCents: 98,
    tipCents: 200,
    totalCents: 1298,
    fulfillmentMode: "pickup",
    fulfillmentWhere: "Wilshire",
    status: "placed",
    ...over,
  };
}

// ——— Paying at the counter ———
//
// Nothing has moved, so the whole bill is outstanding — and it is the *total*,
// not the subtotal. A screen that read the subtotal here would understate what
// somebody is about to hand over by the tax and the tip.
ok("an order paying at the counter owes the whole bill",
   amountOwing(order({ settledCents: 0 })) === 1298,
   String(amountOwing(order({ settledCents: 0 }))));
ok("⚠️ and the bill means the total, not the subtotal",
   amountOwing(order({ settledCents: 0 })) !== 1000);

// ——— Paid by card ———
ok("an order settled in full owes nothing",
   amountOwing(order({ settledCents: 1298 })) === 0,
   String(amountOwing(order({ settledCents: 1298 }))));

// ——— A gift card that did not cover it ———
//
// Half the bill on a card and the rest at the window. This falls out of the
// subtraction rather than needing a case of its own, which is the reason the
// record stores one settled figure instead of a tender name.
ok("a partly covered order owes the remainder",
   amountOwing(order({ settledCents: 500 })) === 798,
   String(amountOwing(order({ settledCents: 500 }))));

// ——— A gift card worth more than the bill ———
//
// ⚠️ Never a negative. A negative would format as a minus sign in front of a
// price and read as money going the other way. Square only ever redeems up to
// the amount due, so this is a guard rather than an expectation.
ok("a card worth more than the bill still owes exactly nothing",
   amountOwing(order({ settledCents: 5000 })) === 0,
   String(amountOwing(order({ settledCents: 5000 }))));

// ——— A record from before any of this ———
//
// ⚠️ The whole reason the answer is nullable. These are sitting in people's
// localStorage right now and cannot be asked what they settled. Both guesses
// are wrong in a way that matters: zero tells somebody who owes money that they
// are paid up, and the total tells somebody who already paid to pay twice. The
// screens print nothing, which is the honest amount of nothing to say.
ok("⚠️ an order that predates the field cannot be asked",
   amountOwing(order()) === null, String(amountOwing(order())));
ok("and that is null rather than a zero",
   amountOwing(order()) !== 0);
ok("and rather than the total",
   amountOwing(order()) !== 1298);

// ——— An old record with no snapshotted totals ———
//
// orderTotals() re-derives tax for these. amountOwing has to go through it
// rather than reading order.totalCents, or an old row with a settled figure
// would be measured against undefined.
const legacy = order({
  taxCents: undefined,
  tipCents: undefined,
  totalCents: undefined,
  settledCents: 0,
});
const legacyTotal = orderTotals(legacy).totalCents;
ok("an order with no stored total is measured against the derived one",
   amountOwing(legacy) === legacyTotal, `${amountOwing(legacy)} vs ${legacyTotal}`);
ok("which is more than the subtotal, because tax is in it",
   legacyTotal > 1000, String(legacyTotal));

// ——— Delivery is not a payment state ———
//
// The original bug in one assertion: two orders identical but for how the food
// gets there must give the same answer about money.
ok("⚠️ a delivery settled in full owes no more than a pickup does",
   amountOwing(order({ fulfillmentMode: "delivery", deliveryCents: 599,
                       deliveryQuotedCents: 599, totalCents: 1897,
                       settledCents: 1897 })) === 0,
   String(amountOwing(order({ fulfillmentMode: "delivery", totalCents: 1897,
                              settledCents: 1897 }))));
ok("and an unpaid delivery owes its own total, courier fee included",
   amountOwing(order({ fulfillmentMode: "delivery", deliveryCents: 599,
                       deliveryQuotedCents: 599, totalCents: 1897,
                       settledCents: 0 })) === 1897);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
