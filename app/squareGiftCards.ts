import "server-only";

import { explainSquare, headers, squareConfig, squareLocationFor } from "./square";

// Gift cards, as stored value Square holds rather than a number we invented.
//
// ——— What this replaces ———
//
// /api/gift-card validated a request, logged it, and answered `issued: false,
// paid: false`. That was honest — nothing was charged and no card existed — and
// it is the whole of what the gift flow has ever done.
//
// ——— Why it has to be Square and not a table of our own ———
//
// A gift card is a promise to hand over food later for money taken now. Kept in
// our own database that promise is a number in a row: it cannot be spent at the
// counter, it does not appear in the shop's books, and if this app loses its
// database somebody's fifty dollars is gone. Square holds the balance, the
// counter's own till can redeem against it, and it shows up in the same
// reporting as everything else.
//
// ⚠️ It is also money the shop owes, which makes it regulated in ways a bagel is
// not. Escheatment, expiry and disclosure rules vary by state, and this file
// deliberately does not implement anything that looks like an opinion about
// them — no expiry dates, no fees, no balance forfeiture. Square's own terms and
// a lawyer decide that, not this code.
//
// ——— The order the four calls have to happen in ———
//
// Square is strict here, and the sequence is not obvious:
//
//   1. an order with a GIFT_CARD line item for the amount
//   2. a payment against *that order*
//   3. create the card — digital, no balance yet
//   4. ACTIVATE it, naming the order and the line item
//
// Step four is why steps one and two exist in that shape. Square's own type
// says it: "Applications that use the Square Orders API to process orders must
// specify the order ID and the line item UID". The activation is what turns
// money taken into stored value, and Square wants to see the sale it came from
// before it will do that. A card activated with no order behind it is money
// appearing from nowhere, which is exactly what the compliance checks are for.
//
// ⚠️ So a gift card *is* linked payment-to-order, unlike a food order — see the
// note in squarePayments.ts about why that linkage was skipped there. It is safe
// here for a reason that does not generalise: a gift card order is one line, no
// tax, no tip, no delivery, so our total and Square's cannot disagree.

const GIFT_CARD_ITEM = "GIFT_CARD";

export type GiftCardIssue =
  | {
      ok: true;
      /** Square's own id for the card, for later activity against it. */
      giftCardId: string;
      /** The number the recipient uses. This is the card: whoever has it can
       *  spend it, so it is treated like a bearer instrument everywhere it
       *  travels — never logged, never in a URL. */
      gan: string;
      balanceCents: number;
      /** Square's order and payment, for the shop's own reconciliation. */
      orderId: string;
      paymentId: string;
    }
  | { ok: false; reason: string; declined: boolean };

type SquareGiftCard = {
  id?: string;
  gan?: string | null;
  state?: string;
  balance_money?: { amount?: number };
};

async function call(
  path: string,
  body: unknown,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; reason: string; status: number }> {
  const config = squareConfig();
  if (!config) return { ok: false, reason: "not-configured", status: 0 };

  let response: Response;
  try {
    response = await fetch(`${config.host}${path}`, {
      method: "POST",
      headers: headers(config),
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (networkError) {
    return {
      ok: false,
      status: 0,
      reason: `network: ${networkError instanceof Error ? networkError.message : "unknown"}`,
    };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { ok: false, reason: explainSquare(response.status, detail), status: response.status };
  }
  const parsed = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: true, body: parsed ?? {} };
}

/** Read one card back, by Square's id for it.
 *
 *  ⚠️ This is how the number is recovered at the moment of sending. The
 *  delivery queue deliberately does not store it — see the note at the top of
 *  giftDelivery.ts — so a card bought on Tuesday for a birthday on Saturday is
 *  fetched from Square on Saturday morning, put in one message, and dropped.
 *
 *  Nothing here ever logs the result. */
export async function giftCardById(
  giftCardId: string,
): Promise<{ ok: true; gan: string; balanceCents: number; state: string } | { ok: false; reason: string }> {
  const config = squareConfig();
  if (!config) return { ok: false, reason: "not-configured" };

  let response: Response;
  try {
    response = await fetch(
      `${config.host}/v2/gift-cards/${encodeURIComponent(giftCardId)}`,
      { headers: headers(config), cache: "no-store" },
    );
  } catch (networkError) {
    return {
      ok: false,
      reason: `network: ${networkError instanceof Error ? networkError.message : "unknown"}`,
    };
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { ok: false, reason: explainSquare(response.status, detail) };
  }
  const parsed = (await response.json().catch(() => null)) as
    | { gift_card?: SquareGiftCard }
    | null;
  const card = parsed?.gift_card;
  if (!card?.gan) return { ok: false, reason: "no-number-on-card" };
  return {
    ok: true,
    gan: card.gan,
    balanceCents: card.balance_money?.amount ?? 0,
    state: card.state ?? "UNKNOWN",
  };
}

/** The order a gift card is sold on.
 *
 *  One line, typed GIFT_CARD so Square knows what it is, and no tax: a gift
 *  card is not a sale of food, it is money changing form. Taxing it here would
 *  tax it again when it is spent. */
export async function createGiftCardOrder(
  amountCents: number,
  reference: string,
  counter?: string,
): Promise<{ ok: true; orderId: string; lineItemUid: string } | { ok: false; reason: string }> {
  const locationId = squareLocationFor(counter);
  if (!locationId) return { ok: false, reason: "no-location" };

  const answer = await call("/v2/orders", {
    idempotency_key: `gift-order-${reference}`.slice(0, 192),
    order: {
      location_id: locationId,
      reference_id: reference.slice(0, 40),
      source: { name: "Corner Bagel" },
      line_items: [
        {
          name: "Gift card",
          quantity: "1",
          item_type: GIFT_CARD_ITEM,
          base_price_money: { amount: amountCents, currency: "USD" },
        },
      ],
    },
  });
  if (!answer.ok) return { ok: false, reason: answer.reason };

  const order = answer.body.order as
    | { id?: string; line_items?: { uid?: string }[] }
    | undefined;
  const orderId = order?.id;
  // ⚠️ Both, or the activation below cannot happen. Square generates the line
  // item uid, so there is nothing to fall back to if it is absent.
  const lineItemUid = order?.line_items?.[0]?.uid;
  if (!orderId || !lineItemUid) {
    return { ok: false, reason: "no-order-or-line-item-in-response" };
  }
  return { ok: true, orderId, lineItemUid };
}

/** Make the card. Digital, and empty until it is activated. */
export async function createGiftCard(
  reference: string,
  counter?: string,
): Promise<{ ok: true; giftCardId: string; gan: string } | { ok: false; reason: string }> {
  const locationId = squareLocationFor(counter);
  if (!locationId) return { ok: false, reason: "no-location" };

  const answer = await call("/v2/gift-cards", {
    idempotency_key: `gift-card-${reference}`.slice(0, 128),
    location_id: locationId,
    // DIGITAL, because there is no plastic to hand over. Square generates the
    // number itself rather than taking one from us, which is the right way
    // round: a number we chose is a number somebody else could guess.
    gift_card: { type: "DIGITAL" },
  });
  if (!answer.ok) return { ok: false, reason: answer.reason };

  const card = answer.body.gift_card as SquareGiftCard | undefined;
  if (!card?.id || !card.gan) return { ok: false, reason: "no-gift-card-in-response" };
  return { ok: true, giftCardId: card.id, gan: card.gan };
}

/** Put the money on it.
 *
 *  ⚠️ The step that actually creates stored value, and the one Square guards.
 *  It names the order and the line item the money came from, because an
 *  activation with no sale behind it is money appearing from nowhere. */
export async function activateGiftCard(input: {
  giftCardId: string;
  amountCents: number;
  orderId: string;
  lineItemUid: string;
  reference: string;
  counter?: string;
}): Promise<{ ok: true; balanceCents: number } | { ok: false; reason: string }> {
  const locationId = squareLocationFor(input.counter);
  if (!locationId) return { ok: false, reason: "no-location" };

  const answer = await call("/v2/gift-cards/activities", {
    idempotency_key: `gift-activate-${input.reference}`.slice(0, 128),
    gift_card_activity: {
      type: "ACTIVATE",
      location_id: locationId,
      gift_card_id: input.giftCardId,
      activate_activity_details: {
        amount_money: { amount: input.amountCents, currency: "USD" },
        order_id: input.orderId,
        line_item_uid: input.lineItemUid,
        reference_id: input.reference.slice(0, 40),
      },
    },
  });
  if (!answer.ok) return { ok: false, reason: answer.reason };

  const activity = answer.body.gift_card_activity as
    | { gift_card_balance_money?: { amount?: number } }
    | undefined;
  const balance = activity?.gift_card_balance_money?.amount;
  if (typeof balance !== "number") return { ok: false, reason: "no-balance-in-response" };
  return { ok: true, balanceCents: balance };
}

/** What is left on a card, by the number the customer has.
 *
 *  ⚠️ Rate-limit whatever calls this. A gift account number is a bearer
 *  instrument and an unthrottled balance lookup is an oracle for guessing one. */
export async function giftCardBalance(
  gan: string,
): Promise<{ ok: true; balanceCents: number; giftCardId: string; state: string } | { ok: false; reason: string }> {
  const answer = await call("/v2/gift-cards/from-gan", { gan });
  if (!answer.ok) {
    // A number nobody has is not an error worth distinguishing from a number
    // that is wrong — saying which would confirm that a guess was close.
    return { ok: false, reason: answer.status === 404 ? "not-found" : answer.reason };
  }
  const card = answer.body.gift_card as SquareGiftCard | undefined;
  if (!card?.id) return { ok: false, reason: "not-found" };
  return {
    ok: true,
    giftCardId: card.id,
    balanceCents: card.balance_money?.amount ?? 0,
    state: card.state ?? "UNKNOWN",
  };
}

/** Spend some of it.
 *
 *  Not wired into the checkout yet — see the note at the bottom of this file. */
export async function redeemGiftCard(input: {
  giftCardId: string;
  amountCents: number;
  reference: string;
  counter?: string;
}): Promise<{ ok: true; balanceCents: number } | { ok: false; reason: string }> {
  const locationId = squareLocationFor(input.counter);
  if (!locationId) return { ok: false, reason: "no-location" };

  const answer = await call("/v2/gift-cards/activities", {
    // Keyed to the order being paid for, so a retry spends once. Getting this
    // wrong takes the balance twice for one bagel.
    idempotency_key: `gift-redeem-${input.reference}`.slice(0, 128),
    gift_card_activity: {
      type: "REDEEM",
      location_id: locationId,
      gift_card_id: input.giftCardId,
      redeem_activity_details: {
        amount_money: { amount: input.amountCents, currency: "USD" },
        reference_id: input.reference.slice(0, 40),
      },
    },
  });
  if (!answer.ok) return { ok: false, reason: answer.reason };

  const activity = answer.body.gift_card_activity as
    | { gift_card_balance_money?: { amount?: number } }
    | undefined;
  const balance = activity?.gift_card_balance_money?.amount;
  if (typeof balance !== "number") return { ok: false, reason: "no-balance-in-response" };
  return { ok: true, balanceCents: balance };
}

/** Put spent balance back on a card.
 *
 *  ——— When this runs ———
 *
 *  A gift card is redeemed against an order before the kitchen is told about
 *  it, so the till refusing that order leaves a card debited for food nobody
 *  is going to make. This is the other half of refundSquare(): one gives the
 *  card payment back, this gives the gift card balance back, and an order that
 *  paid with both needs both.
 *
 *  ⚠️ UNLINKED_ACTIVITY_REFUND rather than REFUND. Square's REFUND is for
 *  reversing a redemption *it* processed and wants the payment behind it; our
 *  redemption is made through the Gift Card Activities API with no Square
 *  payment attached, so the unlinked form is the one that matches. The wrong
 *  one is refused, which would leave the customer's balance gone.
 *
 *  Keyed to the order, so a retry restores the balance once rather than
 *  minting money. */
export async function refundGiftCard(input: {
  giftCardId: string;
  amountCents: number;
  reference: string;
  counter?: string;
}): Promise<boolean> {
  const locationId = squareLocationFor(input.counter);
  if (!locationId) return false;

  const answer = await call("/v2/gift-cards/activities", {
    idempotency_key: `gift-unredeem-${input.reference}`.slice(0, 128),
    gift_card_activity: {
      type: "UNLINKED_ACTIVITY_REFUND",
      location_id: locationId,
      gift_card_id: input.giftCardId,
      unlinked_activity_refund_activity_details: {
        amount_money: { amount: input.amountCents, currency: "USD" },
        reference_id: input.reference.slice(0, 40),
      },
    },
  });

  if (!answer.ok) {
    // ⚠️ Loud, because this is a customer's own money spent on food that is not
    // being made, and nothing downstream retries it. Somebody has to put it
    // back from the Square dashboard.
    //
    // The card's id, not its number. The id is safe in a log; the number is
    // money in a log.
    console.error(
      `[square] GIFT CARD REFUND FAILED for card ${input.giftCardId}` +
        ` (${input.amountCents} cents, order ${input.reference}): ${answer.reason}.` +
        " This balance must be put back by hand.",
    );
    return false;
  }
  return true;
}

export function isGiftCardsConfigured(): boolean {
  return squareConfig() !== null;
}
