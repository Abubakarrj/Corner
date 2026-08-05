// What a gift card purchase is, and what makes one valid.
//
// Kept apart from the form so both sides can use it: the page validates with
// these before enabling its button, and /api/gift-card validates with the
// same ones before accepting anything. A rule written twice is a rule that
// disagrees with itself eventually.

export const GIFT_AMOUNTS_CENTS = [500, 2500, 5000, 10000] as const;
export const GIFT_MIN_CENTS = 500;
export const GIFT_MAX_CENTS = 10000;

export const DELIVERY_METHODS = [
  { id: "email", label: "Send this card via Email" },
  { id: "text", label: "Send this card via Text" },
  { id: "self", label: "Send this card To Me first" },
] as const;

export type DeliveryMethod = (typeof DELIVERY_METHODS)[number]["id"];

export const MESSAGE_MAX = 255;

export type GiftOrder = {
  designId: string;
  amountCents: number;
  method: DeliveryMethod;
  // The recipient's email or phone, depending on `method`. Empty when the
  // card is being sent to the buyer first — that goes to their own contact
  // details, collected at checkout.
  recipientContact: string;
  // ISO date (YYYY-MM-DD) to deliver on, or null for "today".
  deliverOn: string | null;
  recipientName: string;
  senderName: string;
  message: string;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Deliberately loose: people write phone numbers with spaces, dashes,
// brackets and a country code, and rejecting a real number because of its
// punctuation is worse than accepting one that fails later at the SMS
// gateway. Ten digits somewhere in there is the bar.
const PHONE_DIGITS = /\d/g;

export function isValidAmount(cents: number): boolean {
  return (
    Number.isInteger(cents) && cents >= GIFT_MIN_CENTS && cents <= GIFT_MAX_CENTS
  );
}

export function contactError(method: DeliveryMethod, contact: string): string | null {
  if (method === "self") return null;
  const value = contact.trim();
  if (value.length === 0) {
    return method === "email" ? "Enter the recipient's email." : "Enter the recipient's number.";
  }
  if (method === "email") {
    return EMAIL.test(value) ? null : "That doesn't look like an email address.";
  }
  const digits = value.match(PHONE_DIGITS)?.length ?? 0;
  return digits >= 10 ? null : "That doesn't look like a phone number.";
}

// A date can be today or later, never earlier. Compared as calendar days in
// the visitor's own timezone rather than as timestamps — "today" means the
// date on their phone, and a UTC comparison would reject this morning for
// anybody west of Greenwich.
export function dateError(deliverOn: string | null): string | null {
  if (deliverOn === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliverOn)) return "Pick a delivery date.";
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return deliverOn < todayKey ? "That date has already passed." : null;
}

export function giftOrderError(order: GiftOrder): string | null {
  if (!isValidAmount(order.amountCents)) return "Choose an amount.";
  const contact = contactError(order.method, order.recipientContact);
  if (contact) return contact;
  const date = dateError(order.deliverOn);
  if (date) return date;
  if (order.message.length > MESSAGE_MAX) return "That message is too long.";
  return null;
}

// How the confirmation describes the delivery. One function so the screen
// after payment and the receipt can't word it differently.
export function describeDelivery(order: GiftOrder): string {
  const when = order.deliverOn ? `on ${formatDeliveryDate(order.deliverOn)}` : "right away";
  if (order.method === "self") return `Coming to you ${when}.`;
  const who = order.recipientName.trim() || order.recipientContact.trim();
  return `Going to ${who} ${when}.`;
}

export function formatDeliveryDate(iso: string): string {
  // Parsed as local rather than UTC: new Date("2026-08-06") is midnight UTC,
  // which prints as the 5th anywhere west of Greenwich.
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
