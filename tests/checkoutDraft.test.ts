// What survives leaving the checkout and coming back.
//
// ——— The one-way door ———
//
// "Edit basket" sits on the checkout and goes to the cart. Coming back was a
// fresh mount: name, phone, note, tip, the delivery unit, the courier
// instructions and the step all back to their starting values. So a customer
// who wanted to change the quantity of one bagel paid for it by typing
// everything again, on a phone, and landed back on the first step while they
// were at it.
//
// The same round trip is the back button, a restored tab, and a phone that
// discarded the page while somebody read a text.
//
// ⚠️ What is stored is a name and a phone number, which is why it is
// sessionStorage rather than localStorage and why it is cleared the moment an
// order is placed. Those two properties are asserted here rather than left to
// the comment in draft.ts.

import { readDraft, writeDraft, clearDraft, type CheckoutDraft } from "../app/shop/checkout/draft";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

// A sessionStorage that records which store was used, so "it saved" and "it
// saved in the right place" are different assertions.
const session = new Map<string, string>();
const local = new Map<string, string>();
const fake = (backing: Map<string, string>) => ({
  getItem: (k: string) => backing.get(k) ?? null,
  setItem: (k: string, v: string) => void backing.set(k, v),
  removeItem: (k: string) => void backing.delete(k),
});
(globalThis as { window?: unknown }).window = {
  sessionStorage: fake(session),
  localStorage: fake(local),
};

const filled: CheckoutDraft = {
  firstName: "Ada",
  lastName: "Lovelace",
  phone: "213 555 0147",
  note: "no onions",
  curbside: true,
  utensils: true,
  tipCents: 215,
  deliveryDetail: "Apt 4B",
  handoff: "door",
  courierNote: "gate code 1234",
  onPayment: true,
};

// ——— The round trip ———
writeDraft(filled);
const back = readDraft();
ok("the name comes back", back.firstName === "Ada" && back.lastName === "Lovelace",
   JSON.stringify(back));
ok("the phone comes back", back.phone === "213 555 0147", back.phone);
ok("the note comes back", back.note === "no onions", back.note);
ok("the tip comes back", back.tipCents === 215, String(back.tipCents));
ok("the toggles come back", back.curbside === true && back.utensils === true);
// Typed while looking at a map of their own building, three screens ago.
ok("the delivery unit comes back", back.deliveryDetail === "Apt 4B", back.deliveryDetail);
ok("and the courier's instructions", back.courierNote === "gate code 1234", back.courierNote);
ok("leave at door is remembered", back.handoff === "door", back.handoff);
ok("and so is the step, so Edit basket is not a one-way door",
   back.onPayment === true, String(back.onPayment));

// ——— Where it is kept ———
ok("it is in sessionStorage, which the tab clears",
   session.size === 1, `session ${session.size}`);
// ⚠️ A name and a phone number on a shared shop phone must not outlive the
// visit. The cart is allowed to; this is not.
ok("and not in localStorage, which outlives the visit",
   local.size === 0, `local ${local.size}`);

// ——— The step is earned, not restored ———
//
// Landing somebody on the payment step with an empty name is a worse welcome
// than the first step, so the details that gate it have to still hold.
writeDraft({ ...filled, firstName: "", onPayment: true });
ok("no name means the payment step is not restored",
   readDraft().onPayment === false, String(readDraft().onPayment));

writeDraft({ ...filled, phone: "555", onPayment: true });
ok("half a phone number means the payment step is not restored",
   readDraft().onPayment === false, String(readDraft().onPayment));

writeDraft({ ...filled, onPayment: false });
ok("and a customer who never reached it does not arrive there",
   readDraft().onPayment === false, String(readDraft().onPayment));

// ——— Placing the order ends it ———
writeDraft(filled);
clearDraft();
const after = readDraft();
ok("a placed order leaves nothing behind", after.firstName === "" && after.phone === "",
   JSON.stringify(after));
ok("and the store is actually empty", session.size === 0, `session ${session.size}`);

// ——— Storage a person can edit ———
//
// This is readable and writable from a console. None of it should be able to
// throw on the way into a checkout, and none of it should be able to price an
// order.
session.set("cb-checkout-draft-v1", "{not json");
ok("an unparseable draft reads as blanks", readDraft().firstName === "",
   JSON.stringify(readDraft()));

session.set("cb-checkout-draft-v1", JSON.stringify({ firstName: 42, tipCents: "lots" }));
const junk = readDraft();
ok("a name that is not a string reads as blank", junk.firstName === "", String(junk.firstName));
// A tip restored as NaN prices the whole order as NaN.
ok("and a tip that is not a number reads as zero", junk.tipCents === 0, String(junk.tipCents));

session.set("cb-checkout-draft-v1", JSON.stringify({ ...filled, tipCents: -500 }));
ok("a negative tip reads as zero", readDraft().tipCents === 0, String(readDraft().tipCents));

session.set("cb-checkout-draft-v1", JSON.stringify({ ...filled, firstName: "x".repeat(9000) }));
ok("an enormous name is capped", readDraft().firstName.length === 100,
   String(readDraft().firstName.length));

session.set("cb-checkout-draft-v1", JSON.stringify({ ...filled, handoff: "somewhere-else" }));
ok("an unknown handoff falls back to handing it over in person",
   readDraft().handoff === "hand", readDraft().handoff);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
