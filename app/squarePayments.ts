import "server-only";

import { explainSquare, headers, squareConfig, squareLocationFor } from "./square";

// Taking the money.
//
// ——— The one rule this file exists to keep ———
//
// ⚠️ The card number never reaches this server. Not in a request body, not in a
// log, not in an error report. The browser hands the digits straight to Square
// through their hosted fields, Square hands back an opaque single-use token,
// and the token is the only thing that arrives here. Charging it is this file's
// whole job.
//
// That is not caution for its own sake, and it is the same reason app/shop/
// checkout/card.ts refused to put a PAN in the order body when nothing charged
// anybody. A PAN in a request body is a PAN in whatever logs request bodies,
// which is more places than anyone remembers, and it drags whoever deploys this
// into PCI DSS scope that a hosted field keeps them out of.
//
// So: if you are ever tempted to add a `cardNumber` parameter to anything in
// here, the answer is no, and the reason is that the token already does the job
// without the liability.
//
// ——— The amount is ours, never the browser's ———
//
// `amountCents` comes from totalsFor() on the server, computed from the catalog
// and the tax table after the order has been repriced. The client's idea of the
// total is not consulted, exactly as it is not consulted for the order itself.
// A checkout that charges what the browser asked it to charge is a checkout
// that charges a dollar for a catering order.
//
// ——— Not linked to the Square order, yet ———
//
// Square can attach a payment to an order with `order_id`, which is what makes
// the order read as paid on the counter's screen. It is deliberately not done
// here, because that linkage requires the payment amount to equal Square's own
// computed total for the order, and Square computes that from the line items we
// send plus whatever taxes are configured on the location — while our total
// comes from app/shop/money.ts and includes a tip and a delivery fee that are
// not line items at all.
//
// Those two numbers agreeing is an empirical question about a specific Square
// account, and getting it wrong means CreatePayment fails on every checkout. So
// the payment carries our exact total and our own reference instead, and the
// two records are matched by that reference. Linking them properly is worth
// doing once somebody has watched real sandbox numbers line up.

export type PaymentRequest = {
  /** The single-use token from the Web Payments SDK. Never a card number. */
  sourceId: string;
  /** What to charge, in cents, computed on this server. */
  amountCents: number;
  /** Our handle for the order, so a payment in Square's dashboard can be traced
   *  back to the order it paid for. */
  reference: string;
  /** Which counter's Square location the money belongs to. */
  counter?: string;
  /** For the receipt Square sends, when the customer has an account. */
  buyerEmail?: string;
  /** Square's own 3-D Secure result, from verifyBuyer() in the browser. Absent
   *  where the card did not need a challenge. */
  verificationToken?: string;
};

export type PaymentResult =
  | {
      ok: true;
      paymentId: string;
      /** Square's hosted receipt. Handed to the customer rather than rebuilt. */
      receiptUrl?: string;
      /** What a receipt is allowed to know about the card, and all it is: the
       *  brand and the last four, straight from Square rather than parsed out
       *  of anything we held. */
      brand?: string;
      last4?: string;
    }
  | { ok: false; reason: string; /** True when the customer could fix it by trying another card. */ declined: boolean };

export function isSquarePaymentsConfigured(): boolean {
  // The same credentials as the till. Square does not separate them, and a
  // deployment that can create an order can charge for it.
  return squareConfig() !== null;
}

/** Codes where the honest thing to tell the customer is "try another card".
 *
 *  Everything else is our problem, not theirs, and saying "card declined" to
 *  somebody whose card is fine because our token expired is how a working card
 *  gets cut up. */
const DECLINES = new Set([
  "CARD_DECLINED",
  "INSUFFICIENT_FUNDS",
  "CVV_FAILURE",
  "ADDRESS_VERIFICATION_FAILURE",
  "INVALID_EXPIRATION",
  "EXPIRATION_FAILURE",
  "CARD_EXPIRED",
  "GENERIC_DECLINE",
  "PAN_FAILURE",
  "CARD_NOT_SUPPORTED",
  "INVALID_ACCOUNT",
  "TRANSACTION_LIMIT",
  "VOICE_FAILURE",
  "CARD_DECLINED_CALL_ISSUER",
  "CARD_DECLINED_VERIFICATION_REQUIRED",
]);

function declinedBy(detail: string): boolean {
  try {
    const body = JSON.parse(detail) as { errors?: { code?: string }[] };
    return (body.errors ?? []).some((error) => error.code && DECLINES.has(error.code));
  } catch {
    return false;
  }
}

type SquarePaymentResponse = {
  payment?: {
    id?: string;
    status?: string;
    receipt_url?: string;
    card_details?: { card?: { card_brand?: string; last_4?: string } };
  };
};

export async function chargeSquare(request: PaymentRequest): Promise<PaymentResult> {
  const config = squareConfig();
  if (!config) return { ok: false, reason: "not-configured", declined: false };
  const locationId = squareLocationFor(request.counter);
  if (!locationId) return { ok: false, reason: "no-location", declined: false };

  // A zero or negative charge is not a payment, it is a bug that would
  // otherwise reach Square as a 400 and read like a card problem.
  if (!Number.isFinite(request.amountCents) || request.amountCents <= 0) {
    return { ok: false, reason: `refusing to charge ${request.amountCents} cents`, declined: false };
  }

  const body = {
    source_id: request.sourceId,
    // ⚠️ Keyed to the order, not to the moment. Square guarantees that a repeat
    // of this key returns the original payment rather than making a second one,
    // which is what stands between a customer double-tapping Pay and being
    // charged twice. A timestamp or a random value here would remove that
    // guarantee entirely while looking like it did the same thing.
    idempotency_key: `pay-${request.reference}`.slice(0, 45),
    amount_money: { amount: Math.round(request.amountCents), currency: "USD" },
    location_id: locationId,
    // Capture now rather than authorising and completing later. The food is
    // made immediately; there is no shipping step to hold funds through, and an
    // uncaptured authorisation that nobody completes expires into a refund the
    // customer never asked for.
    autocomplete: true,
    reference_id: request.reference.slice(0, 40),
    note: `Corner Bagel ${request.reference}`.slice(0, 500),
    ...(request.buyerEmail ? { buyer_email_address: request.buyerEmail } : {}),
    ...(request.verificationToken ? { verification_token: request.verificationToken } : {}),
  };

  let response: Response;
  try {
    response = await fetch(`${config.host}/v2/payments`, {
      method: "POST",
      headers: headers(config),
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (networkError) {
    // Unknown, not failed. The request may have been received and charged, and
    // the caller must not retry it with a fresh key on the strength of this.
    return {
      ok: false,
      reason: `network: ${networkError instanceof Error ? networkError.message : "unknown"}`,
      declined: false,
    };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      ok: false,
      reason: explainSquare(response.status, detail),
      declined: declinedBy(detail),
    };
  }

  const parsed = (await response.json().catch(() => null)) as SquarePaymentResponse | null;
  const payment = parsed?.payment;
  if (!payment?.id) return { ok: false, reason: "no-payment-id-in-response", declined: false };

  // ⚠️ A 200 is not money. Square answers 200 with a status, and only two of
  // its words mean the customer has paid. Treating the status code as the
  // answer is how an order gets confirmed against a payment that failed.
  if (payment.status !== "COMPLETED" && payment.status !== "APPROVED") {
    return {
      ok: false,
      reason: `payment ${payment.id} came back ${payment.status ?? "with no status"}`,
      declined: payment.status === "FAILED",
    };
  }

  return {
    ok: true,
    paymentId: payment.id,
    ...(payment.receipt_url ? { receiptUrl: payment.receipt_url } : {}),
    ...(payment.card_details?.card?.card_brand
      ? { brand: payment.card_details.card.card_brand }
      : {}),
    ...(payment.card_details?.card?.last_4 ? { last4: payment.card_details.card.last_4 } : {}),
  };
}

/** Give the money back.
 *
 *  Called when the charge succeeded and the order did not — the one ordering
 *  that can take somebody's money for food nobody is making. Rare, and exactly
 *  why it has to exist. */
export async function refundSquare(
  paymentId: string,
  amountCents: number,
  reference: string,
): Promise<boolean> {
  const config = squareConfig();
  if (!config) return false;

  const response = await fetch(`${config.host}/v2/refunds`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({
      idempotency_key: `refund-${reference}`.slice(0, 45),
      payment_id: paymentId,
      amount_money: { amount: Math.round(amountCents), currency: "USD" },
      reason: "Order could not be sent to the kitchen",
    }),
    cache: "no-store",
  }).catch(() => null);

  if (!response || !response.ok) {
    const detail = response ? await response.text().catch(() => "") : "";
    // ⚠️ Loud, because this is money the shop is holding for food it is not
    // making, and nothing downstream will retry it. Somebody has to refund this
    // by hand from the Square dashboard.
    console.error(
      `[square] REFUND FAILED for payment ${paymentId} (${amountCents} cents,` +
        ` order ${reference}): ${response ? explainSquare(response.status, detail) : "unreachable"}.` +
        ` This must be refunded by hand.`,
    );
    return false;
  }
  return true;
}
