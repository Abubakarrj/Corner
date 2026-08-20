// Issuing stored value, on the wire.
//
// ——— Why this is held to the payment suite's standard ———
//
// A gift card is a promise to hand over food later for money taken now, and the
// ways it goes wrong are not symmetric:
//
//   · activating twice is fifty dollars the shop gave away
//   · redeeming twice is fifty dollars the customer lost
//   · a card created but never activated is money taken for nothing
//   · a balance lookup that distinguishes "wrong number" from "no such card"
//     is an oracle for guessing somebody else's card
//
// The transport is stubbed. This proves what the app sends and how it reads
// what comes back, not that Square accepts it.

import {
  createGiftCardOrder,
  createGiftCard,
  activateGiftCard,
  giftCardBalance,
  redeemGiftCard,
} from "../app/squareGiftCards";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

process.env.SQUARE_ACCESS_TOKEN = "token";
process.env.SQUARE_LOCATION_ID = "L-default";
process.env.SQUARE_LOCATION_FIGUEROA = "L-figueroa";
delete process.env.SQUARE_ENV;

type Wire = Record<string, unknown>;
let sent: Wire | null = null;
let sentUrl = "";
let calls = 0;
let reply: { status: number; body: unknown } = { status: 200, body: {} };

const wire = () => (sent ?? {}) as Wire;
const activity = () => (wire().gift_card_activity ?? {}) as Wire;

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  calls += 1;
  sentUrl = String(input);
  if (init?.body) sent = JSON.parse(String(init.body));
  return new Response(JSON.stringify(reply.body), {
    status: reply.status,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;

const reset = (body: unknown, status = 200) => {
  sent = null; sentUrl = ""; calls = 0; reply = { status, body };
};

async function main() {
  // ——— The order the card is sold on ———
  reset({ order: { id: "ord-1", line_items: [{ uid: "li-1" }] } });
  const order = await createGiftCardOrder(5000, "gift-abc");
  ok("the order goes up", order.ok === true, JSON.stringify(order));
  ok("to the orders endpoint",
     sentUrl === "https://connect.squareupsandbox.com/v2/orders", sentUrl);

  const lines = ((wire().order as Wire)?.line_items ?? []) as Wire[];
  // Square has to know this is stored value rather than a sandwich, or the
  // activation below has nothing to point at.
  ok("as a GIFT_CARD line item", lines[0]?.item_type === "GIFT_CARD",
     String(lines[0]?.item_type));
  ok("for the amount asked for",
     JSON.stringify(lines[0]?.base_price_money) ===
       JSON.stringify({ amount: 5000, currency: "USD" }),
     JSON.stringify(lines[0]?.base_price_money));
  // ⚠️ No tax. A gift card is money changing form, not a sale of food — taxing
  // it here would tax it again when it is spent.
  ok("and with no tax on it", !("taxes" in ((wire().order ?? {}) as Wire)),
     JSON.stringify((wire().order as Wire)?.taxes));

  ok("the order id and line item come back",
     order.ok === true && order.orderId === "ord-1" && order.lineItemUid === "li-1",
     JSON.stringify(order));

  // Without both there is nothing to activate against, so this must fail
  // rather than proceed to take money for a card that can never be filled.
  reset({ order: { id: "ord-2" } });
  ok("an order with no line item uid is a failure",
     (await createGiftCardOrder(5000, "gift-abc")).ok === false);

  // ——— The card ———
  reset({ gift_card: { id: "gc-1", gan: "7783320000000000", state: "PENDING" } });
  const card = await createGiftCard("gift-abc");
  ok("the card is created", card.ok === true, JSON.stringify(card));
  ok("at the gift cards endpoint",
     sentUrl === "https://connect.squareupsandbox.com/v2/gift-cards", sentUrl);
  ok("as a digital card, since there is no plastic to hand over",
     ((wire().gift_card ?? {}) as Wire).type === "DIGITAL",
     String(((wire().gift_card ?? {}) as Wire).type));
  // Square generates the number. One we chose is one somebody could guess.
  ok("and we do not choose the number", !("gan" in ((wire().gift_card ?? {}) as Wire)),
     JSON.stringify((wire().gift_card as Wire)?.gan));
  ok("the number comes back", card.ok === true && card.gan === "7783320000000000",
     JSON.stringify(card));

  reset({ gift_card: { id: "gc-2" } });
  ok("a card with no number is a failure", (await createGiftCard("x")).ok === false);

  // ——— Activation, which is where the money becomes spendable ———
  reset({ gift_card_activity: { id: "act-1", gift_card_balance_money: { amount: 5000 } } });
  const live = await activateGiftCard({
    giftCardId: "gc-1", amountCents: 5000,
    orderId: "ord-1", lineItemUid: "li-1", reference: "gift-abc",
  });
  ok("the activation goes up", live.ok === true, JSON.stringify(live));
  ok("to the activities endpoint",
     sentUrl === "https://connect.squareupsandbox.com/v2/gift-cards/activities", sentUrl);
  ok("as an ACTIVATE", activity().type === "ACTIVATE", String(activity().type));
  const details = (activity().activate_activity_details ?? {}) as Wire;
  // ⚠️ Square requires both for Orders API applications. An activation with no
  // sale behind it is money appearing from nowhere, which is what its
  // compliance checks exist to catch.
  ok("naming the order the money came from", details.order_id === "ord-1",
     String(details.order_id));
  ok("and the line item on it", details.line_item_uid === "li-1",
     String(details.line_item_uid));
  ok("for the right amount",
     JSON.stringify(details.amount_money) ===
       JSON.stringify({ amount: 5000, currency: "USD" }),
     JSON.stringify(details.amount_money));
  ok("and the balance comes back", live.ok === true && live.balanceCents === 5000,
     JSON.stringify(live));

  // ⚠️ Activating twice is fifty dollars the shop gave away. Square
  // deduplicates on the key, so it has to be the order's, not the clock's.
  const firstKey = wire().idempotency_key;
  reset({ gift_card_activity: { gift_card_balance_money: { amount: 5000 } } });
  await activateGiftCard({
    giftCardId: "gc-1", amountCents: 5000,
    orderId: "ord-1", lineItemUid: "li-1", reference: "gift-abc",
  });
  ok("a repeat activation carries the same key, so it cannot double the balance",
     wire().idempotency_key === firstKey,
     `${String(firstKey)} then ${String(wire().idempotency_key)}`);

  // A 200 that does not say what the balance is has not told us the money
  // landed, and confirming a card on that is how somebody gets an empty one.
  reset({ gift_card_activity: { id: "act-2" } });
  ok("an activation with no balance in the answer is a failure",
     (await activateGiftCard({
       giftCardId: "gc-1", amountCents: 5000,
       orderId: "ord-1", lineItemUid: "li-1", reference: "gift-abc",
     })).ok === false);

  // ——— Reading a balance ———
  reset({ gift_card: { id: "gc-1", balance_money: { amount: 4250 }, state: "ACTIVE" } });
  const balance = await giftCardBalance("7783320000000000");
  ok("a balance reads back", balance.ok === true && balance.balanceCents === 4250,
     JSON.stringify(balance));
  ok("by number, not by id",
     sentUrl.endsWith("/v2/gift-cards/from-gan") && wire().gan === "7783320000000000",
     `${sentUrl} ${String(wire().gan)}`);

  // ⚠️ A gift account number is a bearer instrument. "No such card" and "wrong
  // number" must read identically, or the difference confirms a guess was
  // close.
  reset({ errors: [{ code: "NOT_FOUND" }] }, 404);
  const missing = await giftCardBalance("0000000000000000");
  ok("an unknown number says only that it was not found",
     missing.ok === false && missing.reason === "not-found",
     missing.ok === false ? missing.reason : "");
  reset({ gift_card: {} });
  const empty = await giftCardBalance("0000000000000000");
  ok("and so does an answer with no card in it",
     empty.ok === false && empty.reason === "not-found",
     empty.ok === false ? empty.reason : "");

  // ——— Spending it ———
  reset({ gift_card_activity: { gift_card_balance_money: { amount: 1250 } } });
  const spent = await redeemGiftCard({
    giftCardId: "gc-1", amountCents: 3000, reference: "sched-xyz",
  });
  ok("a redemption goes up as REDEEM", activity().type === "REDEEM", String(activity().type));
  ok("for the amount spent",
     JSON.stringify((activity().redeem_activity_details as Wire)?.amount_money) ===
       JSON.stringify({ amount: 3000, currency: "USD" }),
     JSON.stringify(activity().redeem_activity_details));
  ok("and the remaining balance comes back",
     spent.ok === true && spent.balanceCents === 1250, JSON.stringify(spent));
  // Redeeming twice is the customer's money, not the shop's.
  ok("keyed to the order being paid for, so a retry spends once",
     wire().idempotency_key === "gift-redeem-sched-xyz", String(wire().idempotency_key));

  // ——— Per counter ———
  reset({ gift_card: { id: "gc-3", gan: "778332" } });
  await createGiftCard("gift-abc", "figueroa");
  ok("a counter's cards are issued at its own Square location",
     wire().location_id === "L-figueroa", String(wire().location_id));

  // ——— And nothing at all without credentials ———
  delete process.env.SQUARE_ACCESS_TOKEN;
  reset({});
  ok("no token, no card", (await createGiftCard("gift-abc")).ok === false);
  ok("and no request", calls === 0, String(calls));
  process.env.SQUARE_ACCESS_TOKEN = "token";

  globalThis.fetch = realFetch;
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
