// Which orders have to bring money with them.
//
// ——— The regression this exists to stop ———
//
// Wiring the charge in put a gate on the order endpoint that read
//
//   if (isSquarePaymentsConfigured()) { if (!paymentToken) refuse }
//
// which is right about card orders and catastrophic about every other one. The
// moment Square was configured, choosing "pay at the window" — the tender this
// shop has always had, and the default — was answered with "we couldn't read
// your card". Every counter order in the shop, refused, by the feature that was
// supposed to add a second way to pay rather than remove the first.
//
// Nothing caught it. The payment suite tested chargeSquare in isolation and the
// browser check never pressed Place order, so the one interaction between the
// two — *should this order be charged at all* — had no test between them.
//
// This is that test. It is deliberately about the decision rather than the
// endpoint: what the gate must answer, for each tender, in each configuration.

import { readFileSync } from "node:fs";
import { isSquarePaymentsConfigured } from "../app/squarePayments";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

/** The gate, as the endpoint states it.
 *
 *  Kept in step with /api/shop-order by being the same two clauses in the same
 *  order. If that endpoint's condition changes and this does not, the mutation
 *  runs below stop passing. */
function mustPayNow(tender: string, hasToken: boolean): "charge" | "refuse" | "proceed" {
  const payingNow = tender === "card";
  if (isSquarePaymentsConfigured() && payingNow) {
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

// ——— The one that broke ———
//
// No token, and correctly so: nobody typed a card. This must be an ordinary
// order, settled when the bag is handed over.
ok("paying at the window goes through without a token",
   mustPayNow("counter", false) === "proceed", mustPayNow("counter", false));

// ——— Paying now ———
ok("paying by card with a token is charged",
   mustPayNow("card", true) === "charge", mustPayNow("card", true));

// Says it will pay now and brought nothing to pay with. A broken client, not a
// choice — confirming it would promise a charge that never happened.
ok("paying by card with no token is refused",
   mustPayNow("card", false) === "refuse", mustPayNow("card", false));

// ——— With no processor at all ———
//
// The shop this app had before any of this, and the one it falls back to.
// Nothing is charged and nothing is refused.
unconfigure();
ok("with no processor, the window still works",
   mustPayNow("counter", false) === "proceed", mustPayNow("counter", false));
ok("and a card order is not refused for want of a charge that cannot happen",
   mustPayNow("card", false) === "proceed", mustPayNow("card", false));
configure();

// ——— An unrecognised tender is not a card ———
//
// A client sending nothing, or something new, must not be treated as paying
// now. Defaulting the other way turns every request that omits the field into a
// refusal — which is exactly the shape of the bug above.
for (const tender of ["", "cash", "counter", "COUNTER", "Card", "window"]) {
  ok(`tender ${JSON.stringify(tender)} is not treated as paying now`,
     mustPayNow(tender, false) === "proceed", mustPayNow(tender, false));
}

// ——— And the endpoint still asks the same question ———
//
// ⚠️ Everything above tests a copy of the gate, so it is only worth anything
// while the copy and the original agree. The failure mode is somebody editing
// /api/shop-order, leaving this file alone, and getting a green suite over the
// exact regression it was written for.
//
// So the endpoint's own source is checked for the two clauses that matter: that
// the charge is gated on the tender as well as on the configuration, and that
// the tender is read from the request rather than assumed.
const endpoint = readFileSync("app/api/shop-order/route.ts", "utf8");
ok("the endpoint reads the tender off the request",
   /const payingNow = readText\(body, "tender"/.test(endpoint));
ok("and gates the charge on it, not on configuration alone",
   /if \(isSquarePaymentsConfigured\(\) && payingNow\)/.test(endpoint));
ok("so no bare configuration check guards the token",
   !/if \(isSquarePaymentsConfigured\(\)\) \{\s*\n\s*if \(!paymentToken\)/.test(endpoint));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
