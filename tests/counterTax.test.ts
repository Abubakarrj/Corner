// Sales tax, now that the counters are not all in one city.
//
// ——— Why this needed a suite the day Pasadena opened ———
//
// Every counter was inside the City of Los Angeles and on one rate, so TAX_RATE
// could be a constant and nothing had to ask which shop an order came from.
// Pasadena levies its own transactions tax on top of the county's, and that
// turns a constant into a lookup.
//
// ⚠️ The failure mode is quiet, which is the whole reason for the file. A
// counter charging 9.75% in a 10.5% district does not look broken: the receipt
// adds up, the card clears, the customer is happy. The shop is short three
// quarters of a percent of every sale and finds out at remittance, from the
// state, months later. Nothing on any screen would have said so.
//
// So these assertions are about the rate reaching the money, not about the
// number being pretty. Each one names the road the rate travels: the record,
// the totals, the charge and the ticket.

import { LOCATIONS, PASADENA, WILSHIRE } from "../app/(marketing)/locations/locations";
import { TAX_RATE, taxFor, totalsFor } from "../app/shop/money";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

// ——— The records ———
console.log("\n— what each counter says —");
ok("Pasadena carries its own rate", PASADENA.taxRate === 0.105, String(PASADENA.taxRate));
ok("and it is higher than the county's", (PASADENA.taxRate ?? 0) > TAX_RATE,
   `${PASADENA.taxRate} vs ${TAX_RATE}`);

// ⚠️ Every other counter says nothing, and that silence is load-bearing: it is
// what makes the county rate the default instead of something six records have
// to repeat and one of them will eventually get wrong.
const quiet = LOCATIONS.filter((store) => store.taxRate === undefined).map((s) => s.id);
ok("every LA counter stays quiet about tax",
   quiet.join(",") === LOCATIONS.filter((s) => s.id !== "pasadena").map((s) => s.id).join(","),
   quiet.join(","));
ok("Koreatown among them", WILSHIRE.taxRate === undefined);

// ——— taxFor ———
console.log("\n— the arithmetic —");
ok("no rate is the county rate", taxFor(10000) === Math.round(10000 * TAX_RATE),
   String(taxFor(10000)));
ok("undefined is the county rate too", taxFor(10000, undefined) === taxFor(10000));
ok("a counter's rate is used when given",
   taxFor(10000, 0.105) === 1050, String(taxFor(10000, 0.105)));

// ⚠️ The gap, in money, on an ordinary order. Named as a number because "0.75%"
// is easy to wave away and "37 cents on a $50 order, every $50 order" is not.
//
// 37 and not 38: 5000 x 0.0975 is 487.5, and toCents is half-up like a till,
// so the county side rounds up to 488 and eats a cent of the gap. Worth
// spelling out because the first version of this line asserted 38 and was
// wrong about the rounding rather than about the rates.
const onFifty = taxFor(5000, 0.105) - taxFor(5000);
ok("the difference on a $50 order is real money", onFifty === 37, String(onFifty));

// ——— totalsFor ———
console.log("\n— the bill —");
const la = totalsFor({ subtotalCents: 5000 });
const pas = totalsFor({ subtotalCents: 5000, taxRate: PASADENA.taxRate });
ok("a Koreatown bill taxes at the county rate",
   la.taxCents === Math.round(5000 * TAX_RATE), String(la.taxCents));
ok("a Pasadena bill taxes at Pasadena's", pas.taxCents === 525, String(pas.taxCents));
ok("and the total follows", pas.totalCents - la.totalCents === onFifty,
   `${pas.totalCents} vs ${la.totalCents}`);

// The discount still comes off before tax, at either rate — you do not owe tax
// on money you did not spend, and that must not depend on which shop it was.
const discounted = totalsFor({ subtotalCents: 5000, discountCents: 1000, taxRate: 0.105 });
ok("a discount reduces the tax at the counter's rate too",
   discounted.taxCents === Math.round(4000 * 0.105), String(discounted.taxCents));

// ⚠️ And the delivery fee stays outside the taxable base at both rates. It is a
// third party's charge for carrying the bag, not part of the sale of the food,
// and a higher rate must not quietly start applying to it.
const delivered = totalsFor({ subtotalCents: 5000, deliveryCents: 999, taxRate: 0.105 });
ok("the courier's fee is not taxed at the counter's rate either",
   delivered.taxCents === pas.taxCents, `${delivered.taxCents} vs ${pas.taxCents}`);

// ——— ⚠️ The regression that matters ———
//
// Not "does the rate work" but "does anything still use the constant where a
// counter was available". Written as an explicit comparison rather than a
// snapshot, because the bug it guards against reads as correct: the old code
// returned a plausible number for every order, and only the wrong one for
// orders from one shop.
console.log("\n— the thing that would go unnoticed —");
ok("a Pasadena order is not taxed at the county rate",
   totalsFor({ subtotalCents: 5000, taxRate: PASADENA.taxRate }).taxCents !==
     totalsFor({ subtotalCents: 5000 }).taxCents);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
