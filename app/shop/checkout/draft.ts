"use client";

import type { Handoff } from "./useCheckout";

// What somebody typed into the checkout, kept for the length of a visit.
//
// ——— Why this exists ———
//
// "Edit basket" sits on the checkout and goes to the cart. Coming back, the
// whole screen was a fresh mount: name, phone, note, tip, the delivery unit,
// the courier instructions and the step were all back to their starting
// values. So the link was a one-way door — a customer who wanted to change the
// quantity of one bagel paid for it by typing everything again, on a phone, and
// landed on the first step while they were at it.
//
// The same applies to the back button, to a tab restored by the browser, and to
// a phone that discarded the page while somebody read a text message.
//
// ——— sessionStorage, deliberately ———
//
// ⚠️ The cart and the fulfillment live in localStorage. This does not, and the
// difference is what is in it: a name and a phone number. Those belong to the
// visit, not to the device. sessionStorage is scoped to the tab and cleared
// when it closes, so a shared phone in a shop does not hand the next person the
// last person's details.
//
// It is also cleared the moment an order is placed. Carrying a draft past the
// order it was written for is how somebody's note about a nut allergy ends up
// on a stranger's sandwich a week later.
//
// ——— The card is not here ———
//
// It could not be even if it should be: the number is inside Square's iframe
// and this page cannot read it. That is the design, and the tender is not saved
// either — a customer coming back to a half-finished checkout should choose how
// to pay while looking at the total, not inherit a choice they have forgotten
// making.

const KEY = "cb-checkout-draft-v1";

export type CheckoutDraft = {
  firstName: string;
  lastName: string;
  phone: string;
  note: string;
  curbside: boolean;
  utensils: boolean;
  tipCents: number;
  deliveryDetail: string;
  handoff: Handoff;
  courierNote: string;
  /** Which step they were on. Restored only when the details are still valid —
   *  see readDraft. */
  onPayment: boolean;
};

const EMPTY: CheckoutDraft = {
  firstName: "",
  lastName: "",
  phone: "",
  note: "",
  curbside: false,
  utensils: false,
  tipCents: 0,
  deliveryDetail: "",
  handoff: "hand",
  courierNote: "",
  onPayment: false,
};

const text = (value: unknown, max: number): string =>
  typeof value === "string" ? value.slice(0, max) : "";

/** What was typed, or blanks.
 *
 *  Every field is read defensively. This is storage a person can edit, a
 *  previous version of this app may have written, and a browser may have
 *  truncated — none of which should be able to throw on the way into a
 *  checkout. */
export function readDraft(): CheckoutDraft {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const saved = JSON.parse(raw) as Record<string, unknown>;
    const handoff = saved.handoff === "door" ? "door" : "hand";
    const tip = Number(saved.tipCents);
    return {
      firstName: text(saved.firstName, 100),
      lastName: text(saved.lastName, 100),
      phone: text(saved.phone, 40),
      note: text(saved.note, 255),
      curbside: saved.curbside === true,
      utensils: saved.utensils === true,
      // A tip restored as NaN would price the whole order as NaN.
      tipCents: Number.isFinite(tip) && tip > 0 ? Math.floor(tip) : 0,
      deliveryDetail: text(saved.deliveryDetail, 120),
      handoff,
      courierNote: text(saved.courierNote, 255),
      // ⚠️ Never straight from storage. Landing on the payment step with an
      // empty name is a worse welcome than landing on the first one, so the
      // step is only restored when the details that gate it still hold.
      onPayment:
        saved.onPayment === true &&
        text(saved.firstName, 100).trim().length > 0 &&
        (text(saved.phone, 40).match(/\d/g) ?? []).length >= 10,
    };
  } catch {
    return EMPTY;
  }
}

export function writeDraft(draft: CheckoutDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Private browsing, a full quota, a browser that refuses. A checkout that
    // cannot save a draft still has to take the order.
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // As above.
  }
}
