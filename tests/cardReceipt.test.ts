// Naming the card on the receipt, for a card this app never saw.
//
// ——— The bug this is written against ———
//
// The confirmation prints "Visa ending 4242" from two fields on the order
// record, and those fields were filled from `describeCard(number)` — the local
// card state. That worked while nothing charged anybody.
//
// Once the shop took real payments the number stopped being in that state: it
// is typed into Square's iframes and our JavaScript cannot read it, which is
// the entire point of them. `describeCard("")` returns the unknown brand and an
// empty string, `order.cardLast4` came out as "", and the confirmation's
// truthiness check fell through. So the receipt named the card on exactly the
// orders where no card was charged, and said nothing on the ones that paid.
//
// ⚠️ Note the shape of the failure. Nothing threw, nothing logged, and every
// intermediate value was a perfectly good string. An empty last four passes
// every check but the last one, which is why last4Of() below returns null: a
// missing value should be missing early, where it is still obvious.

import { BRAND_LABEL, describeCard, labelForSquareBrand, last4Of } from "../app/shop/checkout/card";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

// ——— Square's vocabulary, mapped onto ours ———
ok("Visa", labelForSquareBrand("VISA") === "Visa", labelForSquareBrand("VISA"));
ok("Mastercard", labelForSquareBrand("MASTERCARD") === "Mastercard",
   labelForSquareBrand("MASTERCARD"));
// Square spells this out; the receipt says what is printed on the card.
ok("American Express is Amex on a receipt",
   labelForSquareBrand("AMERICAN_EXPRESS") === "Amex",
   labelForSquareBrand("AMERICAN_EXPRESS"));
ok("Discover", labelForSquareBrand("DISCOVER") === "Discover");
ok("and Diners, which rides the same network",
   labelForSquareBrand("DISCOVER_DINERS") === "Discover",
   labelForSquareBrand("DISCOVER_DINERS"));

// ⚠️ Square's list is longer than ours and gets longer. An unrecognised brand
// has to fall back to a word, never to the enum: "Card ending 4242" is a
// sentence, "CHINA_UNIONPAY ending 4242" is a leaked constant on a receipt.
ok("⚠️ a brand we do not know is a card, not a constant",
   labelForSquareBrand("CHINA_UNIONPAY") === "Card",
   labelForSquareBrand("CHINA_UNIONPAY"));
ok("nor is the raw string passed through",
   !labelForSquareBrand("JCB").includes("JCB"), labelForSquareBrand("JCB"));
ok("and neither absent nor empty throws",
   labelForSquareBrand(undefined) === "Card" && labelForSquareBrand(null) === "Card" &&
   labelForSquareBrand("") === "Card");
// Case is Square's to choose, not ours to depend on.
ok("the match does not depend on Square shouting",
   labelForSquareBrand("visa") === "Visa", labelForSquareBrand("visa"));

// ——— The four digits ———
ok("four digits are four digits", last4Of("4242") === "4242", String(last4Of("4242")));
// ⚠️ The exact value the old bug produced. Everything downstream treated it as
// a string that was simply there.
ok("⚠️ an empty string is nothing, not four digits",
   last4Of("") === null, String(last4Of("")));
ok("and so is a missing one",
   last4Of(undefined) === null && last4Of(null) === null);
// A partial is worse than nothing: "Card ending 42" reads as a real answer.
ok("a partial is refused rather than printed short",
   last4Of("42") === null, String(last4Of("42")));
ok("and so is something longer than four",
   last4Of("42424") === null, String(last4Of("42424")));
ok("punctuation is not a digit",
   last4Of("4-2-4-2") === "4242", String(last4Of("4-2-4-2")));
ok("and letters are not either",
   last4Of("abcd") === null, String(last4Of("abcd")));

// ——— The two sources agree on shape ———
//
// The local fields stay the fallback for a deployment with no processor, so
// the pair they produce has to survive the same test as Square's.
const local = describeCard("4242 4242 4242 4242");
ok("a locally typed card still names itself",
   BRAND_LABEL[local.brand] === "Visa" && last4Of(local.last4) === "4242",
   `${BRAND_LABEL[local.brand]} ${local.last4}`);
// ⚠️ And the case that started all of this: nothing typed locally, because
// Square's iframes hold the number.
const empty = describeCard("");
ok("⚠️ an empty local field yields nothing to print",
   last4Of(empty.last4) === null, String(last4Of(empty.last4)));
ok("which is what the receipt has to notice",
   BRAND_LABEL[empty.brand] === "Card", BRAND_LABEL[empty.brand]);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
