// Taking the money, on the wire.
//
// ——— Why this suite is stricter than the others ———
//
// Everything else in this repo can be wrong and cost somebody a bagel. This
// file is the first code in the app that moves money, and its failure modes are
// asymmetric in a way worth naming:
//
//   · charging twice is somebody's rent
//   · charging the browser's number instead of ours is a free catering order
//   · reading a 200 as "paid" is an order confirmed against a failed payment
//   · saying "declined" for our own outage is a customer cutting up a good card
//
// None of those look like bugs from the outside. All four are asserted below.
//
// The transport is stubbed, so this proves what the app sends and how it reads
// what comes back. It does not prove Square accepts it — that needs the sandbox.

import {
  chargeSquare,
  refundSquare,
  isSquarePaymentsConfigured,
  missingPaymentsConfig,
} from "../app/squarePayments";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

process.env.SQUARE_ACCESS_TOKEN = "token";
process.env.SQUARE_LOCATION_ID = "L-default";
process.env.SQUARE_LOCATION_GLENDON = "L-glendon";
process.env.SQUARE_APPLICATION_ID = "sandbox-sq0idb-app";
delete process.env.SQUARE_ENV;

type Wire = Record<string, unknown>;

let sent: Wire | null = null;
let sentUrl = "";
let sentMethod = "";
let calls = 0;
let reply: { status: number; body: unknown } = { status: 200, body: {} };

const wire = () => (sent ?? {}) as Wire;
const amount = () => (wire().amount_money ?? {}) as Wire;

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  calls += 1;
  sentUrl = String(input);
  sentMethod = init?.method ?? "GET";
  if (init?.body) sent = JSON.parse(String(init.body));
  return new Response(JSON.stringify(reply.body), {
    status: reply.status,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;

function reset(body: unknown, status = 200) {
  sent = null;
  sentUrl = "";
  sentMethod = "";
  calls = 0;
  reply = { status, body };
}

const good = {
  payment: {
    id: "pay-1",
    status: "COMPLETED",
    receipt_url: "https://squareup.com/receipt/preview/pay-1",
    card_details: { card: { card_brand: "VISA", last_4: "1111" } },
  },
};

const charge = {
  sourceId: "cnon:card-nonce-ok",
  amountCents: 1837,
  reference: "sched-abc123",
};

async function main() {
  // ——— All three, not two ———
  //
  // ⚠️ The predicate that says "this shop can take a card" has to mean the whole
  // round trip, not just the server's half. The server charges with the token
  // and the location; the *browser* needs the application id to mount Square's
  // fields and produce a token at all.
  //
  // With the first two set and the third missing, the checkout offers "Pay now
  // by card", renders local fields that cannot tokenize, and the server — one
  // predicate short — refuses every one of those orders as payment-required. A
  // card option that can never be completed is worse than no card option, which
  // is what these four assertions exist to stop.
  ok("configured when all three are present", isSquarePaymentsConfigured() === true);
  ok("and nothing is reported missing", missingPaymentsConfig().length === 0,
     JSON.stringify(missingPaymentsConfig()));

  delete process.env.SQUARE_APPLICATION_ID;
  ok("the browser's half missing means not configured, not half-configured",
     isSquarePaymentsConfigured() === false);
  ok("and the log can name which one", 
     JSON.stringify(missingPaymentsConfig()) === JSON.stringify(["SQUARE_APPLICATION_ID"]),
     JSON.stringify(missingPaymentsConfig()));
  process.env.SQUARE_APPLICATION_ID = "sandbox-sq0idb-app";

  // ——— An ordinary charge ———
  reset(good);
  const paid = await chargeSquare(charge);
  ok("the charge succeeded", paid.ok === true, JSON.stringify(paid));
  ok("posted to the payments endpoint",
     sentUrl === "https://connect.squareupsandbox.com/v2/payments" && sentMethod === "POST",
     `${sentMethod} ${sentUrl}`);

  // ⚠️ The token, never a card number. If a `card_number` or `cvv` ever appears
  // in this body, the deployment has entered PCI scope and this assertion is
  // the thing that should have stopped it.
  ok("the card token is what is sent", wire().source_id === "cnon:card-nonce-ok",
     String(wire().source_id));
  ok("and nothing card-shaped rides along with it",
     !("card_number" in wire()) && !("cvv" in wire()) && !("card" in wire()) &&
       !JSON.stringify(wire()).includes("4242"),
     JSON.stringify(Object.keys(wire())));

  ok("the amount is in cents, exactly as given", amount().amount === 1837,
     String(amount().amount));
  ok("in dollars", amount().currency === "USD", String(amount().currency));
  ok("against the default location", wire().location_id === "L-default",
     String(wire().location_id));
  // Authorise-and-capture-later would leave funds held on a card for food that
  // was made and handed over minutes ago.
  ok("captured now rather than merely authorised", wire().autocomplete === true,
     String(wire().autocomplete));
  ok("carrying our reference so the payment can be traced to the order",
     wire().reference_id === "sched-abc123", String(wire().reference_id));

  // ——— The one that would be somebody's rent ———
  //
  // Square deduplicates on this key. Keyed to the order, a double-tap on Pay
  // returns the first payment. Keyed to the clock or to a random value, it
  // makes a second one.
  ok("the idempotency key is derived from the order",
     wire().idempotency_key === "pay-sched-abc123", String(wire().idempotency_key));
  reset(good);
  await chargeSquare(charge);
  const first = wire().idempotency_key;
  reset(good);
  await chargeSquare(charge);
  ok("and is the same on a repeat of the same order, which is what stops a double charge",
     wire().idempotency_key === first, `${String(first)} then ${String(wire().idempotency_key)}`);

  // ——— What comes back ———
  reset(good);
  const detailed = await chargeSquare(charge);
  ok("the payment id comes back", detailed.ok === true && detailed.paymentId === "pay-1",
     JSON.stringify(detailed));
  ok("with Square's own receipt",
     detailed.ok === true && detailed.receiptUrl?.includes("/receipt/") === true,
     JSON.stringify(detailed));
  // Brand and last four from Square rather than parsed out of anything we held,
  // because we never held it.
  ok("and the brand and last four, from Square",
     detailed.ok === true && detailed.brand === "VISA" && detailed.last4 === "1111",
     JSON.stringify(detailed));

  // ——— A 200 is not money ———
  //
  // Square answers 200 with a status, and only two of its words mean the
  // customer paid. Confirming an order on the strength of the status code is
  // the worst outcome available in this file.
  for (const status of ["FAILED", "CANCELED", "PENDING"]) {
    reset({ payment: { id: "pay-x", status } });
    const answer = await chargeSquare(charge);
    ok(`a 200 with status ${status} is not a payment`, answer.ok === false,
       JSON.stringify(answer));
  }
  reset({ payment: { id: "pay-a", status: "APPROVED" } });
  ok("APPROVED counts", (await chargeSquare(charge)).ok === true);
  reset({ payment: { status: "COMPLETED" } });
  ok("and a completed payment with no id does not",
     (await chargeSquare(charge)).ok === false);

  // ——— Whose fault it was ———
  //
  // "Your card was declined" said to somebody whose card is fine is how a
  // working card gets cut up. The distinction is carried, not guessed at.
  reset({ errors: [{ code: "CARD_DECLINED", detail: "Card declined." }] }, 402);
  const declined = await chargeSquare(charge);
  ok("a declined card is marked declined",
     declined.ok === false && declined.declined === true, JSON.stringify(declined));

  reset({ errors: [{ code: "INSUFFICIENT_FUNDS", detail: "Insufficient funds." }] }, 402);
  const broke2 = await chargeSquare(charge);
  ok("so is insufficient funds", broke2.ok === false && broke2.declined === true,
     JSON.stringify(broke2));

  reset({ errors: [{ code: "UNAUTHORIZED", detail: "Bad token." }] }, 401);
  const ours = await chargeSquare(charge);
  ok("a bad access token is our problem, not the customer's card",
     ours.ok === false && ours.declined === false, JSON.stringify(ours));
  ok("and the reason says what Square said",
     ours.ok === false && /UNAUTHORIZED/.test(ours.reason), ours.ok === false ? ours.reason : "");

  reset({ errors: [{ code: "INTERNAL_SERVER_ERROR" }] }, 500);
  const broke = await chargeSquare(charge);
  ok("a Square outage is not a decline either",
     broke.ok === false && broke.declined === false, JSON.stringify(broke));

  // ——— Refusing to charge nonsense ———
  //
  // A zero or a negative reaches Square as a 400 that reads like a card
  // problem, and a negative is a refund wearing a charge's clothes.
  for (const cents of [0, -500, Number.NaN]) {
    reset(good);
    const answer = await chargeSquare({ ...charge, amountCents: cents });
    ok(`refuses to charge ${cents}`, answer.ok === false, JSON.stringify(answer));
    ok("  and sends nothing", calls === 0, String(calls));
  }

  // ——— Per-counter money ———
  reset(good);
  await chargeSquare({ ...charge, counter: "glendon" });
  ok("a counter's takings go to its own Square location",
     wire().location_id === "L-glendon", String(wire().location_id));

  // ——— 3-D Secure, when the browser got one ———
  reset(good);
  await chargeSquare({ ...charge, verificationToken: "verf-123" });
  ok("the buyer verification token rides along",
     wire().verification_token === "verf-123", String(wire().verification_token));
  reset(good);
  await chargeSquare(charge);
  ok("and is simply absent when there was none",
     !("verification_token" in wire()), JSON.stringify(wire().verification_token));

  // ——— Giving it back ———
  //
  // The one path that can take money for food nobody is making.
  reset({ refund: { id: "ref-1", status: "PENDING" } });
  const refunded = await refundSquare("pay-1", 1837, "sched-abc123");
  ok("a refund goes to the refunds endpoint",
     refunded === true && sentUrl === "https://connect.squareupsandbox.com/v2/refunds",
     `${refunded} ${sentUrl}`);
  ok("for the payment that was taken", wire().payment_id === "pay-1",
     String(wire().payment_id));
  ok("for the amount that was taken", amount().amount === 1837, String(amount().amount));
  // Same reasoning as the charge: a retried refund must not become two.
  ok("keyed to the order so a retry refunds once",
     wire().idempotency_key === "refund-sched-abc123", String(wire().idempotency_key));

  reset({ errors: [{ code: "REFUND_DECLINED" }] }, 400);
  ok("a failed refund reports false rather than throwing",
     (await refundSquare("pay-1", 1837, "sched-abc123")) === false);

  // ——— Nothing without credentials ———
  delete process.env.SQUARE_ACCESS_TOKEN;
  reset(good);
  ok("no token, no charge", (await chargeSquare(charge)).ok === false);
  ok("and no request", calls === 0, String(calls));
  ok("and the capability reads false", isSquarePaymentsConfigured() === false);
  ok("with the token named as the gap",
     missingPaymentsConfig().includes("SQUARE_ACCESS_TOKEN"),
     JSON.stringify(missingPaymentsConfig()));
  process.env.SQUARE_ACCESS_TOKEN = "token";

  globalThis.fetch = realFetch;
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
