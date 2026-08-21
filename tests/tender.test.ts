// Which tenders take the money now, and the two sides agreeing about it.
//
// ——— ⚠️ The bug this is written against ———
//
// /api/shop-order decided whether to charge with a string comparison:
//
//     const payingNow = readText(body, "tender", 16) === "card";
//
// That is correct for exactly the set of tenders that existed when it was
// written. Apple Pay arrives as "wallet", which is not "card", so the endpoint
// would have read it as paying at the counter: order accepted, ticket to the
// kitchen, confirmation screen saying the card was charged, and nobody charged.
// The customer collects breakfast and the shop is never paid.
//
// Nothing would have failed. No exception, no log line, no red text — the order
// is *more* likely to succeed, because skipping the charge skips everything
// that can go wrong with one. It is the quietest possible way to lose money,
// and it would have been introduced by adding a word to a union in a client
// component the server cannot even import.
//
// So the list lives in app/shop/checkout/tender.ts with no "use client" on it,
// both sides read it, and this suite holds that arrangement in place.

import { readFileSync } from "node:fs";
import { paysNow, type Tender } from "../app/shop/checkout/tender";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

// ——— The three tenders ———
ok("a card pays now", paysNow("card"));
ok("⚠️ and so does a wallet", paysNow("wallet"), "this is the whole suite");
// Not an unpaid order: the tender this shop has always had, settled when the
// bag is handed over. What it must not do is make the server charge a token
// that was never sent.
ok("paying at the window does not", !paysNow("counter"));

// ——— Anything else ———
//
// ⚠️ The default has to be false, and the direction matters. An order that
// skips a charge is recoverable — the customer is standing at the counter with
// the bag in front of them. An order that claims a charge which never happened
// is not: they leave, and the shop finds out at the end of the month.
ok("a tender nobody has heard of does not pay now", !paysNow("bitcoin"));
ok("nor does an empty string", !paysNow(""));
ok("nor does a near miss", !paysNow("Card"), "case is not a match");
ok("nor is it fooled by a substring", !paysNow("discard"));
// The body is untrusted input, and a caller can send anything at all.
ok("nor by whitespace around a real one", !paysNow(" card "));

// ——— Every tender is accounted for ———
//
// A compile-time check written as a runtime one: adding a member to Tender
// without deciding which side of this line it falls on should be impossible to
// do quietly. If a fourth tender appears, this array stops compiling until
// somebody adds it, and adding it forces the question.
const ALL: Tender[] = ["counter", "card", "wallet"];
ok("every tender has an answer",
   ALL.every((tender) => typeof paysNow(tender) === "boolean"));
ok("and exactly two of them take money now",
   ALL.filter(paysNow).length === 2, String(ALL.filter(paysNow).length));

// ——— The endpoint actually uses it ———
//
// ⚠️ A weaker test than the ones above, and labelled as one: it reads the
// endpoint's source rather than driving it, because /api/shop-order calls
// next/headers' cookies(), which throws outside a request scope. What it proves
// is that the string comparison has not come back — which is the regression
// that matters, and the one a refactor would reintroduce without noticing.
const route = readFileSync(
  new URL("../app/api/shop-order/route.ts", import.meta.url),
  "utf8",
);
ok("⚠️ the order endpoint asks paysNow rather than comparing strings",
   /const payingNow = paysNow\(/.test(route));
ok("and imports it from the shared module",
   /import \{ paysNow \} from ".*checkout\/tender"/.test(route));
// The exact line that was there before. If it returns, this fails.
ok("⚠️ and the old string comparison is gone",
   !/payingNow\s*=\s*readText\([^)]*\)\s*===\s*"card"/.test(route));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
