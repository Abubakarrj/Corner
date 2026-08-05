import "server-only";

// The seam Toast slots into.
//
// Nothing here talks to Toast yet, and that is deliberate rather than
// unfinished: Toast's ordering API is a partner API. It needs a Toast partner
// account, a client id and secret issued to that account, and the restaurant's
// GUID — none of which exist for this project. What this module does is decide
// exactly where the boundary is, so wiring it up later is filling in three
// functions rather than rewriting checkout.
//
// The shape it assumes, from Toast's published API surface:
//
//   POST {host}/authentication/v1/authentication/login
//        -> a bearer token, cached until it expires
//   GET  {host}/menus/v2/menus
//        -> the published menu, which is the integration to build FIRST —
//           see the note below
//   POST {host}/orders/v2/orders
//        with Toast-Restaurant-External-ID: <restaurant GUID>
//        -> the created order, with its own GUID and check
//   GET  {host}/orders/v2/orders/{guid}
//        -> the order's current state, which is what real order tracking
//           would read instead of the clock-based estimate in app/account.ts
//
// ——— Menus before orders ———
//
// The tempting first integration is order submission. It is the wrong one.
//
// Today app/shop/products.ts is the source of truth for what exists and what
// it costs. The moment Toast is the POS, the till is — and the two will
// disagree, because somebody will change a price at the counter and nobody
// will edit a TypeScript file. Then the site quotes $14.50, the customer
// agrees to $14.50, and the window charges $15.00. That is a worse failure
// than the site not being able to submit an order at all, and it is silent.
//
// So: pull the menu first and treat products.ts as a fallback for when the
// pull fails. Sold-out belongs here too — SOLD_OUT in products.ts is
// hand-edited precisely because this doesn't exist yet, and Toast is where
// availability actually lives.
//
// ——— On payment ———
//
// This module never sees a card number, and no part of this app should.
//
// The reference checkout has a card form on it, but that form is Toast's, not
// the restaurant's: the fields are inside Toast's own hosted payment element,
// so the card data goes from the browser to Toast's PCI environment without
// the site in between. Recreating those inputs as plain fields on our page
// would put a live card number in our page's memory, our request logs, and any
// error report that captures a request body — and would drag whoever deploys
// this into PCI DSS scope for a form that only looks real.
//
// So the flow that exists here takes no payment. When Toast is configured, the
// order is created against Toast and paid at the counter, exactly as the shop
// does today. Taking payment online means mounting Toast's payment element and
// sending back the token it produces — a token, never a PAN — and that is a
// deliberate next step, not a missing one.

export type ToastConfig = {
  host: string;
  clientId: string;
  clientSecret: string;
  restaurantGuid: string;
};

// Read per-call rather than at module load, so a deployment that adds the
// credentials starts working on the next request instead of the next restart.
// All four are server-only names — no NEXT_PUBLIC_ prefix — because a client
// id and secret in the browser bundle is a secret published to everyone.
export function toastConfig(): ToastConfig | null {
  const host = process.env.TOAST_API_HOST;
  const clientId = process.env.TOAST_CLIENT_ID;
  const clientSecret = process.env.TOAST_CLIENT_SECRET;
  const restaurantGuid = process.env.TOAST_RESTAURANT_GUID;
  if (!host || !clientId || !clientSecret || !restaurantGuid) return null;
  return { host, clientId, clientSecret, restaurantGuid };
}

export function isToastConfigured(): boolean {
  return toastConfig() !== null;
}

// What we hand Toast, in our own vocabulary. Kept separate from Toast's wire
// format on purpose: the mapping between the two is one function, so a change
// to their schema doesn't reach into the checkout page.
export type ToastOrderDraft = {
  customer: { firstName: string; lastName: string; email: string; phone: string };
  diningOption: "pickup" | "delivery" | "curbside";
  deliveryAddress?: string;
  items: {
    slug: string;
    name: string;
    quantity: number;
    unitCents: number;
    modifiers: string[];
  }[];
  subtotalCents: number;
  tipCents: number;
  utensils: boolean;
  note?: string;
};

export type ToastOrderResult =
  | { ok: true; orderGuid: string }
  // `reason` is for the log, not the customer. A failure here means the
  // kitchen never heard about the order, so the caller has to say so plainly
  // rather than showing a confirmation.
  | { ok: false; reason: string };

// Creates the order against Toast.
//
// Returns a clear not-configured result rather than throwing, because "no
// Toast credentials in this environment" is the normal state of this project
// today and the caller has a sensible fallback for it (record the order, tell
// the shop by other means). A thrown error would make an expected condition
// look like a bug.
export async function createToastOrder(
  draft: ToastOrderDraft,
): Promise<ToastOrderResult> {
  const config = toastConfig();
  if (!config) {
    return { ok: false, reason: "not-configured" };
  }

  // Intentionally not implemented. Writing a plausible-looking request against
  // an API nobody here has read the current docs for would produce code that
  // compiles, reviews as done, and fails the first time a real order goes
  // through it — which is the worst moment to find out the field names were
  // guesses. The endpoints are named at the top of this file; filling this in
  // is a task with a spec, not a gap someone has to notice.
  void draft;
  return { ok: false, reason: "not-implemented" };
}
