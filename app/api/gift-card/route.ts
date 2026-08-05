import { GIFT_CARDS } from "../../(marketing)/gift/giftCards";
import {
  DELIVERY_METHODS,
  MESSAGE_MAX,
  contactError,
  dateError,
  isValidAmount,
  type DeliveryMethod,
} from "../../(marketing)/gift/buy/giftOrder";
import { isToastConfigured } from "../../toast";

// Gift card intake.
//
// No card is issued here and no money moves. Issuing stored value means
// Toast's gift card API — creating the card, holding its balance, and
// redeeming against it at the counter — and none of that is wired up. What
// this does is validate the request with the same rules the form used, log
// it, and answer honestly, so the screen after it can tell the truth about
// what happened.
//
// The validation is not decoration. It runs server-side because the form's
// copy of these checks is a convenience for the person filling it in, not a
// guarantee: anything that reaches this endpoint could have skipped the form
// entirely.

function isValidEmail(input: unknown): input is string {
  return typeof input === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const body = (payload ?? {}) as Record<string, unknown>;

  if (!isValidEmail(body.buyerEmail)) {
    return Response.json({ error: "Enter a valid email." }, { status: 400 });
  }

  // The amount is the whole transaction, so it gets the strictest look: an
  // integer number of cents inside the published range and nothing else. A
  // request asking for a $10,000 card, or a fractional one, is not a
  // rounding problem to fix quietly — it's rejected.
  const amountCents = body.amountCents;
  if (typeof amountCents !== "number" || !isValidAmount(amountCents)) {
    return Response.json({ error: "That isn't a gift card amount we sell." }, { status: 400 });
  }

  const method = body.method;
  if (
    typeof method !== "string" ||
    !DELIVERY_METHODS.some((option) => option.id === method)
  ) {
    return Response.json({ error: "Choose how to send it." }, { status: 400 });
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
    return Response.json({ error: "Pick a card design." }, { status: 400 });
  }

  const message =
    typeof body.message === "string" ? body.message.slice(0, MESSAGE_MAX) : "";

  console.info(
    `[gift-card] ${(amountCents / 100).toFixed(2)} ${design.id} via ${method}` +
      ` to ${recipientContact || "the buyer"}` +
      ` on ${deliverOn ?? "today"}, from ${String(body.buyerEmail).trim()}` +
      (message ? ` — "${message}"` : ""),
  );

  // `issued: false` is the load-bearing part of this response. The screen
  // after it says nothing has been charged and no card has been sent, and
  // that stays true until Toast is connected and this flips.
  return Response.json(
    { ok: true, issued: false, paid: false, toast: isToastConfigured() },
    { status: 200 },
  );
}
