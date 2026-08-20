import { randomUUID } from "node:crypto";
import { GIFT_CARDS } from "../../(marketing)/gift/giftCards";
import {
  DELIVERY_METHODS,
  MESSAGE_MAX,
  contactError,
  dateError,
  isValidAmount,
  type DeliveryMethod,
} from "../../(marketing)/gift/buy/giftOrder";
import {
  chargeSquare,
  isSquarePaymentsConfigured,
  refundSquare,
} from "../../squarePayments";
import {
  activateGiftCard,
  createGiftCard,
  createGiftCardOrder,
} from "../../squareGiftCards";
import {
  isDue,
  recordGiftDelivery,
  undeliverable,
  type GiftDelivery,
} from "../../giftDelivery";
import { deliverGiftCard } from "../../giftSend";
import { clientIp, throttle } from "../../rateLimit";
import { toE164 } from "../../sms";

// Buying a gift card.
//
// ——— What this used to be ———
//
// It validated the request, logged it, and answered `issued: false, paid:
// false`. That was honest: nothing was charged and no card existed. This is
// the same validation with the transaction behind it.
//
// ——— The order things happen in, and why it is not negotiable ———
//
//   1. validate, exactly as the form did
//   2. ⚠️ refuse a method this shop cannot deliver — *before* charging
//   3. charge the card
//   4. Square order → Square gift card → ACTIVATE (see squareGiftCards.ts)
//   5. record it in the delivery queue
//   6. send it, if it is due today
//
// Step 2 is the one that is easy to leave out and expensive to leave out.
// Taking fifty dollars and then discovering there is no SMS provider leaves a
// customer paid-up with nothing to show and somebody having to refund it by
// hand. Asking first costs nothing.
//
// Steps 3 and 4 can fail after the money has moved, and every one of those
// paths refunds. Step 5 cannot: at that point the card exists and is loaded,
// and refunding it would take the money back off a card somebody may already
// have been given. So a failure to record is loud rather than undone — the
// line names the card and who it has to reach, and somebody sends it by hand.
//
// Step 6 failing is not a failure of this request. The card is bought, paid
// for and queued; the cron will try again. The buyer is told it is on its way,
// which is true.
//
// ——— Error keys, not sentences ———
//
// Unchanged and for the same reason: this route has no locale and no honest way
// to get one. See the note that was here before, and app/i18n serverText().

export const dynamic = "force-dynamic";

/** A card is real money leaving a real card, and the balance-of-guesses shape
 *  of a stolen-card test is: many small purchases, fast. Six an hour from one
 *  address is more gift cards than anybody buys and few enough to be useless
 *  for card testing.
 *
 *  In-memory and per-instance — see rateLimit.ts about what that is and is
 *  not. A ceiling that resets on deploy is still a ceiling. */
const purchases = throttle({ windowMs: 60 * 60 * 1000, max: 6 });

function isValidEmail(input: unknown): input is string {
  return typeof input === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

/** Today where the shop is, as an ISO date.
 *
 *  ⚠️ Not the server's date. Render runs in UTC, so after 5pm in Los Angeles
 *  the server has already rolled over — a card bought at 6pm on the 20th for
 *  "today" would be compared against the 21st, and one dated tomorrow would go
 *  out tonight. */
function todayInShopTime(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "api.badJson" }, { status: 400 });
  }

  const body = (payload ?? {}) as Record<string, unknown>;

  if (!isValidEmail(body.buyerEmail)) {
    return Response.json({ error: "checkout.validEmail" }, { status: 400 });
  }

  // The amount is the whole transaction, so it gets the strictest look: an
  // integer number of cents inside the published range and nothing else. A
  // request asking for a $10,000 card, or a fractional one, is not a
  // rounding problem to fix quietly — it's rejected.
  const amountCents = body.amountCents;
  if (typeof amountCents !== "number" || !isValidAmount(amountCents)) {
    return Response.json({ error: "gift.errNotAnAmount" }, { status: 400 });
  }

  const method = body.method;
  if (
    typeof method !== "string" ||
    !DELIVERY_METHODS.some((option) => option.id === method)
  ) {
    return Response.json({ error: "gift.errChooseSend" }, { status: 400 });
  }

  const recipientContact =
    typeof body.recipientContact === "string" ? body.recipientContact : "";
  const contactProblem = contactError(method as DeliveryMethod, recipientContact);
  if (contactProblem) {
    return Response.json({ error: contactProblem }, { status: 400 });
  }

  const deliverOn =
    typeof body.deliverOn === "string" ? body.deliverOn : body.deliverOn === null ? null : "";
  const dateProblem = dateError(deliverOn);
  if (dateProblem) {
    return Response.json({ error: dateProblem }, { status: 400 });
  }

  const designId = typeof body.designId === "string" ? body.designId : "";
  const design = GIFT_CARDS.find((card) => card.id === designId);
  if (!design) {
    return Response.json({ error: "gift.errPickDesign" }, { status: 400 });
  }

  const message =
    typeof body.message === "string" ? body.message.slice(0, MESSAGE_MAX) : "";
  const text = (value: unknown, cap: number) =>
    typeof value === "string" ? value.trim().slice(0, cap) : "";
  const recipientName = text(body.recipientName, 80);
  const senderName = text(body.senderName, 80);
  const buyerEmail = String(body.buyerEmail).trim();

  // ⚠️ A second, stricter look at a phone number, and the reason it is here
  // rather than in giftOrder.ts: that module is shared with the browser and is
  // deliberately lenient, because rejecting a real number over its punctuation
  // while somebody is typing is worse than accepting one. By this point the
  // leniency has to end — a number the SMS transport cannot parse is a card
  // charged for and never sent.
  if (method === "text" && !toE164(recipientContact)) {
    return Response.json({ error: "gift.errNotPhone" }, { status: 400 });
  }

  // ⚠️ Before the money. See the note at the top.
  const blocked = undeliverable(method as DeliveryMethod);
  if (blocked) {
    console.warn(`[gift-card] refused a ${method} card: ${blocked}`);
    return Response.json(
      { error: method === "text" ? "gift.errNoTextYet" : "gift.errCannotSend" },
      { status: 503 },
    );
  }

  if (!isSquarePaymentsConfigured()) {
    // Nothing here can be sold on credit. A gift card is stored value: issuing
    // one that was not paid for is the shop writing itself an IOU.
    console.warn("[gift-card] Square is not configured to take cards; refusing the sale.");
    return Response.json({ error: "api.paymentFailed" }, { status: 503 });
  }

  const paymentToken = text(body.paymentToken, 512);
  if (!paymentToken) {
    return Response.json({ error: "api.paymentRequired" }, { status: 402 });
  }
  const verificationToken = text(body.verificationToken, 2048);

  if (purchases.exceeded(clientIp(request))) {
    return Response.json({ error: "api.tooManyAttempts" }, { status: 429 });
  }

  // One handle for the whole transaction. Every idempotency key Square sees —
  // the payment, the order, the card, the activation — is derived from it, so a
  // retry of this request charges once and issues one card rather than a second
  // of each.
  const reference = `gift-${randomUUID().replace(/-/g, "").slice(0, 20)}`;

  const payment = await chargeSquare({
    sourceId: paymentToken,
    // Our number, from the validated amount. The browser does not send a total.
    amountCents,
    reference,
    buyerEmail,
    ...(verificationToken ? { verificationToken } : {}),
  });

  if (!payment.ok) {
    console.error(`[gift-card] payment failed: ${payment.reason}`);
    return Response.json(
      { error: payment.declined ? "api.cardDeclined" : "api.paymentFailed" },
      { status: payment.declined ? 402 : 502 },
    );
  }

  /** Give it back. Only called between the charge and the card existing. */
  const undo = async (why: string) => {
    console.error(`[gift-card] ${why}; refunding ${reference}.`);
    await refundSquare(payment.paymentId, amountCents, reference);
  };

  const order = await createGiftCardOrder(amountCents, reference);
  if (!order.ok) {
    await undo(`could not create the gift card order: ${order.reason}`);
    return Response.json({ error: "api.paymentFailed" }, { status: 502 });
  }

  const card = await createGiftCard(reference);
  if (!card.ok) {
    await undo(`could not create the gift card: ${card.reason}`);
    return Response.json({ error: "api.paymentFailed" }, { status: 502 });
  }

  const activated = await activateGiftCard({
    giftCardId: card.giftCardId,
    amountCents,
    orderId: order.orderId,
    lineItemUid: order.lineItemUid,
    reference,
  });
  if (!activated.ok) {
    // ⚠️ The last point a refund is right. The card exists but has no balance,
    // so nothing has been given away and the money can go back.
    await undo(`could not activate the card: ${activated.reason}`);
    return Response.json({ error: "api.paymentFailed" }, { status: 502 });
  }

  // Past here the card is loaded. Nothing below refunds.

  const delivery: GiftDelivery = {
    id: reference,
    squareGiftCardId: card.giftCardId,
    squareOrderId: order.orderId,
    amountCents,
    designId: design.id,
    method: method as DeliveryMethod,
    recipientContact: recipientContact.trim(),
    recipientName,
    senderName,
    buyerEmail,
    message,
    deliverOn,
  };

  // recordGiftDelivery logs loudly on its own failure, naming the card and the
  // address it owes. That line is the whole recovery path for a database that
  // is down at the wrong moment, which is why this does not swallow it.
  const recorded = await recordGiftDelivery(delivery);

  // ——— Sent now, or on the day ———
  //
  // A card with no date goes immediately. One dated later waits for
  // /api/gift-send. A card that could not be recorded cannot be sent by the
  // cron, so it is worth trying now even though the row is not there — a
  // delivered card nobody wrote down beats an undelivered one nobody wrote
  // down. deliverGiftCard's own bookkeeping calls are no-ops without a row.
  let sent = false;
  if (isDue(deliverOn, todayInShopTime())) {
    const result = await deliverGiftCard(delivery);
    sent = result.sent;
    if (!result.sent && !recorded) {
      console.error(
        `[gift-card] card ${card.giftCardId} (${(amountCents / 100).toFixed(2)}) is paid for,` +
          ` unrecorded and unsent. It must be sent by hand to` +
          ` ${delivery.recipientContact || buyerEmail}.`,
      );
    }
  }

  console.info(
    `[gift-card] ${(amountCents / 100).toFixed(2)} ${design.id} via ${method}` +
      ` to ${recipientContact || "the buyer"} on ${deliverOn ?? "today"},` +
      ` from ${buyerEmail}: issued as ${reference},` +
      ` ${sent ? "sent" : deliverOn ? "queued for the day" : "queued"}.`,
  );

  // ⚠️ `issued` and `paid` are load-bearing: the screen after this says what
  // happened, and it can only be right if these are. Both are now true, and
  // `sent` distinguishes "it has gone" from "it goes on Saturday".
  return Response.json(
    {
      ok: true,
      issued: true,
      paid: true,
      sent,
      // The receipt is Square's own, and the only thing here safe to hand back
      // to a browser. The card number is not, and never leaves the message.
      ...(payment.receiptUrl ? { receiptUrl: payment.receiptUrl } : {}),
    },
    { status: 200 },
  );
}
