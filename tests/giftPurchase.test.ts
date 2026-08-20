// Buying a gift card, end to end on the wire.
//
// ——— The thing this suite exists for ———
//
// Not the validation. That was already right and is checked here only so it
// stays right. What is new is that money moves, and the ways that goes wrong
// are ordered:
//
//   · charging for a card this shop has no way to deliver
//   · charging twice for one purchase
//   · charging and then failing to issue, without giving it back
//   · refunding *after* the card is loaded, which takes the money back off a
//     present somebody may already be holding
//
// So most of what is asserted below is about sequence: what happened before
// what, and what did not happen at all.
//
// Square is stubbed. This proves what the app sends and in what order, not that
// Square accepts it.

import { POST } from "../app/api/gift-card/route";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

process.env.SQUARE_ACCESS_TOKEN = "token";
process.env.SQUARE_LOCATION_ID = "L-default";
process.env.SQUARE_APPLICATION_ID = "sandbox-sq0idb-test";
process.env.RESEND_API_KEY = "re-test";
process.env.TWILIO_ACCOUNT_SID = "AC-test";
process.env.TWILIO_AUTH_TOKEN = "secret";
process.env.TWILIO_FROM = "+13235550000";
delete process.env.SQUARE_ENV;
delete process.env.CORNER_DATABASE_URL;
delete process.env.DATABASE_URL;

type Call = { url: string; body: string };
let calls: Call[] = [];

/** Which step, if any, Square refuses. */
let breakAt: "payment" | "order" | "card" | "activate" | null = null;

const path = (url: string) => new URL(url).pathname;
const hit = (needle: string) => calls.filter((call) => call.url.includes(needle));
/** The endpoints touched, in order, as short names — sequence is the point. */
const steps = () =>
  calls.map((call) =>
    call.url.includes("/v2/payments") ? "pay"
      : call.url.includes("/v2/refunds") ? "refund"
      : call.url.includes("/v2/orders") ? "order"
      : call.url.includes("/v2/gift-cards/activities") ? "activate"
      : call.url.includes("/v2/gift-cards/from-gan") ? "lookup"
      : /\/v2\/gift-cards\/.+/.test(path(call.url)) ? "read"
      : call.url.includes("/v2/gift-cards") ? "create"
      : call.url.includes("resend") ? "email"
      : call.url.includes("twilio") ? "sms"
      : call.url,
  );

const refused = () => new Response(JSON.stringify({ errors: [{ code: "NOPE" }] }), { status: 400 });

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, body: String(init?.body ?? "") });
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  if (url.includes("/v2/payments")) {
    // ⚠️ COMPLETED, not just a 200. chargeSquare refuses a 200 that does not
    // say the money moved, which is right and is why this stub has to say it.
    return breakAt === "payment"
      ? refused()
      : json({ payment: { id: "pay-1", status: "COMPLETED", receipt_url: "https://sq/r" } });
  }
  if (url.includes("/v2/refunds")) return json({ refund: { id: "ref-1" } });
  if (url.includes("/v2/orders")) {
    return breakAt === "order" ? refused() : json({ order: { id: "ord-1", line_items: [{ uid: "li-1" }] } });
  }
  if (url.includes("/v2/gift-cards/activities")) {
    return breakAt === "activate" ? refused() : json({ gift_card_activity: { gift_card_balance_money: { amount: 5000 } } });
  }
  if (/\/v2\/gift-cards\/.+/.test(path(url))) {
    // The read at send time.
    return json({ gift_card: { id: "gc-1", state: "ACTIVE", gan: "7783320000001234" } });
  }
  if (url.includes("/v2/gift-cards")) {
    return breakAt === "card" ? refused() : json({ gift_card: { id: "gc-1", gan: "7783320000001234" } });
  }
  return json({ id: "sent" });
}) as typeof fetch;

const GOOD = {
  designId: "classic",
  amountCents: 5000,
  method: "email",
  recipientContact: "friend@example.com",
  recipientName: "Sam",
  senderName: "Ada",
  message: "happy birthday",
  deliverOn: null,
  buyerEmail: "ada@example.com",
  paymentToken: "cnon:card-nonce-ok",
};

/** A fresh address each time, so the hourly throttle does not colour a test
 *  that is not about the throttle. */
let caller = 0;
const buy = async (over: Record<string, unknown> = {}) => {
  calls = [];
  caller += 1;
  const response = await POST(
    new Request("https://thecornerbagel.com/api/gift-card", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.0.${caller}` },
      body: JSON.stringify({ ...GOOD, ...over }),
    }),
  );
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
};

async function main() {
  // The design has to be one the shop actually sells, and this suite is not the
  // place to hardcode a name from the catalogue.
  const { GIFT_CARDS } = await import("../app/(marketing)/gift/giftCards");
  const design = GIFT_CARDS[0].id;

  // ——— The ordinary case ———
  breakAt = null;
  const bought = await buy({ designId: design });
  ok("a card is bought", bought.status === 200, JSON.stringify(bought));
  ok("and the answer says it was issued and paid for",
     bought.body.issued === true && bought.body.paid === true, JSON.stringify(bought.body));
  ok("and that it has gone", bought.body.sent === true, JSON.stringify(bought.body));
  // ⚠️ The sequence Square requires: an order, a payment against it, the card,
  // then the activation naming both. See squareGiftCards.ts.
  ok("in Square's own order: pay, order, create, activate, then send",
     JSON.stringify(steps()) === JSON.stringify(["pay", "order", "create", "activate", "read", "email"]),
     JSON.stringify(steps()));
  ok("with nothing refunded", hit("/v2/refunds").length === 0);
  ok("and Square's receipt handed back",
     bought.body.receiptUrl === "https://sq/r", String(bought.body.receiptUrl));

  // ⚠️ Every idempotency key derived from one reference, so a double-tap
  // charges once and issues one card rather than a second of each.
  const keys = calls
    .map((call) => {
      try { return (JSON.parse(call.body) as { idempotency_key?: string }).idempotency_key; }
      catch { return undefined; }
    })
    .filter((key): key is string => typeof key === "string");
  const stem = (key: string) => key.replace(/^(pay|gift-order|gift-card|gift-activate)-/, "");
  ok("every Square call carries an idempotency key", keys.length === 4, JSON.stringify(keys));
  ok("and all four are derived from the same reference",
     new Set(keys.map(stem)).size === 1, JSON.stringify(keys));

  // ⚠️ The card number must not come back to the browser. It goes in the
  // message and nowhere else.
  ok("the card number is not in the response",
     !JSON.stringify(bought.body).includes("7783"), JSON.stringify(bought.body));

  // ——— A card for a birthday on Saturday ———
  const later = await buy({ designId: design, deliverOn: "2099-12-25" });
  ok("a dated card is bought and paid for",
     later.status === 200 && later.body.paid === true, JSON.stringify(later.body));
  ok("but not sent yet", later.body.sent === false, JSON.stringify(later.body));
  ok("and no message goes out",
     !steps().includes("email") && !steps().includes("sms"), JSON.stringify(steps()));

  // ——— ⚠️ Refusing before the money, not after ———
  //
  // The most expensive bug available here: taking fifty dollars and then
  // finding out the card cannot be delivered.
  delete process.env.TWILIO_AUTH_TOKEN;
  const noSms = await buy({ designId: design, method: "text", recipientContact: "2135551234" });
  ok("a text card with no SMS provider is refused", noSms.status === 503, JSON.stringify(noSms));
  ok("and says so in a sentence the screen can translate",
     noSms.body.error === "gift.errNoTextYet", String(noSms.body.error));
  ok("⚠️ and nothing was charged", calls.length === 0, JSON.stringify(steps()));
  process.env.TWILIO_AUTH_TOKEN = "secret";

  // A number the SMS transport cannot parse is the same failure wearing a
  // different hat: the form is deliberately lenient, and the leniency ends here.
  //
  // ⚠️ Eleven digits that do not start with a 1. It clears giftOrder's "ten
  // digits somewhere in there" bar — which is the whole point, that bar is for
  // somebody still typing — and toE164 cannot turn it into a number to send to.
  // A shorter number would be stopped by the earlier check and prove nothing.
  const badNumber = await buy({ designId: design, method: "text", recipientContact: "2213 555 1234" });
  ok("an unusable phone number is refused before the money too",
     badNumber.status === 400 && badNumber.body.error === "gift.errNotPhone",
     JSON.stringify(badNumber.body));
  ok("and nothing was charged", calls.length === 0, JSON.stringify(steps()));

  // ——— A card that will not pay ———
  breakAt = "payment";
  const declined = await buy({ designId: design });
  ok("a refused payment is not a purchase", declined.status >= 400, JSON.stringify(declined));
  ok("and no card is created",
     !steps().includes("create") && !steps().includes("activate"), JSON.stringify(steps()));
  ok("and there is nothing to refund", hit("/v2/refunds").length === 0);

  // ——— Paid, and then it goes wrong ———
  //
  // ⚠️ Each of these is money taken for a card that does not exist. All three
  // give it back.
  for (const step of ["order", "card", "activate"] as const) {
    breakAt = step;
    const failed = await buy({ designId: design });
    ok(`a failure at ${step} is not a success`, failed.status >= 400, JSON.stringify(failed));
    ok(`and the money is given back after ${step}`,
       steps().includes("refund"), JSON.stringify(steps()));
    ok(`and no message goes out about a card that failed at ${step}`,
       !steps().includes("email") && !steps().includes("sms"), JSON.stringify(steps()));
  }
  breakAt = null;

  // ⚠️ Past the activation the card is loaded, and a refund would take money
  // back off a present somebody may already be holding. So a send that fails
  // does *not* refund — the card is owed and the cron tries again.
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("resend")) {
      calls.push({ url: String(input), body: String(init?.body ?? "") });
      return new Response("down", { status: 503 });
    }
    return original(input as RequestInfo, init);
  }) as typeof fetch;
  const undelivered = await buy({ designId: design });
  globalThis.fetch = original;
  ok("a card that could not be sent is still a completed purchase",
     undelivered.status === 200 && undelivered.body.issued === true,
     JSON.stringify(undelivered.body));
  ok("and says it has not gone yet", undelivered.body.sent === false,
     JSON.stringify(undelivered.body));
  ok("⚠️ and the money is NOT taken back off a loaded card",
     !steps().includes("refund"), JSON.stringify(steps()));

  // ——— Validation, unchanged ———
  const cases: [string, Record<string, unknown>, string][] = [
    ["an amount we do not sell", { amountCents: 999999 }, "gift.errNotAnAmount"],
    ["a fractional amount", { amountCents: 500.5 }, "gift.errNotAnAmount"],
    ["no way to send it", { method: "carrier pigeon" }, "gift.errChooseSend"],
    ["a recipient who is not an email", { recipientContact: "nope" }, "gift.errNotEmail"],
    ["a date that has gone", { deliverOn: "2020-01-01" }, "gift.errDatePassed"],
    ["a design we do not have", { designId: "nope" }, "gift.errPickDesign"],
    ["a buyer with no email", { buyerEmail: "x" }, "checkout.validEmail"],
  ];
  for (const [what, over, expected] of cases) {
    const answer = await buy({ designId: design, ...over });
    ok(`${what} is refused`, answer.status === 400 && answer.body.error === expected,
       JSON.stringify(answer));
    ok(`and nothing is charged for ${what}`, calls.length === 0, JSON.stringify(steps()));
  }

  // ⚠️ Says it will pay now and brought nothing to pay with. Confirming that
  // would promise a card that was never charged for.
  const noToken = await buy({ designId: design, paymentToken: "" });
  ok("a purchase with no card token is refused",
     noToken.status === 402, JSON.stringify(noToken));
  ok("and nothing is charged", calls.length === 0, JSON.stringify(steps()));

  // ——— The throttle ———
  //
  // A gift card is real money leaving a real card, which makes this endpoint a
  // card-testing tool if it is not bounded.
  calls = [];
  let refusals = 0;
  for (let i = 0; i < 9; i += 1) {
    const response = await POST(
      new Request("https://thecornerbagel.com/api/gift-card", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.9.9.9" },
        body: JSON.stringify({ ...GOOD, designId: design }),
      }),
    );
    if (response.status === 429) refusals += 1;
  }
  ok("one address cannot buy card after card without being stopped",
     refusals > 0, `${refusals} of 9 refused`);

  globalThis.fetch = realFetch;
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
