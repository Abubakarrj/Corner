import type { StringKey } from "../../../i18n/en";

// What a gift card purchase is, and what makes one valid.
//
// Kept apart from the form so both sides can use it: the page validates with
// these before enabling its button, and /api/gift-card validates with the
// same ones before accepting anything. A rule written twice is a rule that
// disagrees with itself eventually.

export const GIFT_AMOUNTS_CENTS = [500, 2500, 5000, 10000] as const;
export const GIFT_MIN_CENTS = 500;
export const GIFT_MAX_CENTS = 10000;

// String keys rather than words: this module is imported by /api/gift-card,
// which has no locale and no business having one. Every screen that renders
// these translates them at the point of render.
export const DELIVERY_METHODS = [
  { id: "email", label: "gift.methodEmail" },
  { id: "text", label: "gift.methodText" },
  { id: "self", label: "gift.methodSelf" },
] as const satisfies readonly { id: string; label: StringKey }[];

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

export function contactError(method: DeliveryMethod, contact: string): StringKey | null {
  if (method === "self") return null;
  const value = contact.trim();
  if (value.length === 0) {
    return method === "email" ? "gift.errEnterEmail" : "gift.errEnterNumber";
  }
  if (method === "email") {
    return EMAIL.test(value) ? null : "gift.errNotEmail";
  }
  const digits = value.match(PHONE_DIGITS)?.length ?? 0;
  return digits >= 10 ? null : "gift.errNotPhone";
}

// A date can be today or later, never earlier. Compared as calendar days in
// the visitor's own timezone rather than as timestamps — "today" means the
// date on their phone, and a UTC comparison would reject this morning for
// anybody west of Greenwich.
export function dateError(deliverOn: string | null): StringKey | null {
  if (deliverOn === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliverOn)) return "gift.errPickDate";
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return deliverOn < todayKey ? "gift.errDatePassed" : null;
}

export function giftOrderError(order: GiftOrder): StringKey | null {
  if (!isValidAmount(order.amountCents)) return "gift.errChooseAmount";
  const contact = contactError(order.method, order.recipientContact);
  if (contact) return contact;
  const date = dateError(order.deliverOn);
  if (date) return date;
  if (order.message.length > MESSAGE_MAX) return "gift.errMessageLong";
  return null;
}

// How the confirmation describes the delivery. One function so the screen
// after payment and the receipt can't word it differently.
//
// Four keys rather than one sentence assembled from parts. "Going to Sam on
// Fri, Aug 7" is English putting the who before the when; Japanese puts both
// before the verb and Urdu reads the other way, so a `${who} ${when}` template
// only ever works in the language it was written in.
export function describeDelivery(
  order: GiftOrder,
  tag = "en-US",
): { key: StringKey; vars: Record<string, string> } {
  const date = order.deliverOn ? formatDeliveryDate(order.deliverOn, tag) : null;
  const who = order.recipientName.trim() || order.recipientContact.trim();
  if (order.method === "self") {
    return date
      ? { key: "gift.comingToYouOn", vars: { date } }
      : { key: "gift.comingToYouNow", vars: {} };
  }
  return date
    ? { key: "gift.goingToOn", vars: { who, date } }
    : { key: "gift.goingToNow", vars: { who } };
}

export function formatDeliveryDate(iso: string, tag = "en-US"): string {
  // Parsed as local rather than UTC: new Date("2026-08-06") is midnight UTC,
  // which prints as the 5th anywhere west of Greenwich.
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(tag, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
