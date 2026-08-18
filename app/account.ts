"use client";

import type { StringKey } from "./i18n";

import { useSyncExternalStore } from "react";
import type { SelectedOptions } from "./shop/products";
import { taxFor } from "./shop/money";
import { PREP_MINUTES } from "./shopFacts";
import type { LiveStatus } from "./orderStages";

// Who's signed in, and what they've ordered.
//
// The identity half is real now: Auth0, passwordless by email code, with the
// session in an httpOnly cookie the browser can't read. This module is the
// cache in front of it — it asks /api/auth/me once on load and holds the
// answer — which is exactly what the old note here said it would become.
//
// The orders half is this device first, and a signed-in customer's orders are
// also kept server-side — see app/orderHistory.ts. The direction is what keeps
// it simple: this store is still the only thing any screen reads, and the
// server fills it in through mergeOrders() below. So the app works signed out,
// offline, and on a deployment with no database, exactly as it did.
//
// ⚠️ Signed out, it is still this device only. A history recorded here does not
// follow anybody to a second phone and clearing site data loses it, and nothing
// in the app claims otherwise.
//
// Neither half should gate anything genuinely private without a server check.
// A cookie says who you are; this cache says who the last /api/auth/me call
// said you were, and a page rendering off it is rendering off a hint.
const ACCOUNT_KEY = "cb-account-v1";
const ORDERS_KEY = "cb-orders-v1";

export type Account = { name: string; email: string; since: number };

export type PlacedOrderItem = {
  slug: string;
  name: string;
  quantity: number;
  // Unit price with options priced in, as it was when the order went in.
  // Snapshotted rather than looked up, because an order is a record of what
  // was charged, not of what the item costs today.
  unitCents: number;
  options: SelectedOptions;
  optionsLabel: string;
};

// Where an order got to.
//
// ⚠️ NOTHING REPORTS REAL PROGRESS YET. No POS, no courier, no kitchen
// display — so the stage a tracking screen shows is *derived from elapsed
// time* against the estimates below, not read from anywhere. It is an
// estimate presented as an estimate: the tracker says so on screen, and it
// never claims an order was collected or handed over, because only a person
// at the counter knows that.
//
// When there is a real feed, `progressFor` stops deriving and starts reading
// a stored status, and everything above it is unchanged.
export type OrderStatus = "placed" | "in-the-kitchen" | "ready" | "on-the-way" | "complete";

export type PlacedOrder = {
  id: string;
  placedAt: number;
  items: PlacedOrderItem[];
  subtotalCents: number;
  // What the order actually came to. Snapshotted alongside the subtotal
  // because checkout charges subtotal + tax + tip, and for a while the
  // tracker read `subtotalCents` and printed it under the word "Total" — so
  // the same order showed one number on the confirmation and a smaller one
  // when you went back to look at it.
  //
  // Optional because orders placed before this existed are already sitting in
  // people's localStorage. Read them through orderTotals() below rather than
  // directly, which fills the gap instead of showing a blank.
  taxCents?: number;
  // What the customer was charged for the courier. Zero on a delivery whose
  // fee was waived, absent on pickup orders and on anything placed before
  // delivery was priced.
  deliveryCents?: number;
  // What the courier quoted, which the shop pays whoever it was billed to.
  // Kept apart from the line above so a waived order records what was given
  // away rather than a zero that looks like the trip was free.
  //
  // Absent on every order placed before free delivery existed, and on those
  // the two were always the same number: see orderTotals().
  deliveryQuotedCents?: number;
  tipCents?: number;
  totalCents?: number;
  // Toast's own id for this order, when it went to Toast. Kept because it is
  // the only handle on the order that both sides share: a status feed keyed by
  // anything else would have to be matched up by guessing.
  //
  // Absent on orders placed before this existed, and on any order the kitchen
  // heard about some other way.
  toastGuid?: string;
  // The kitchen queue's handle on this order, for "two orders ahead of
  // yours". Toast's guid where Toast is connected and an id the order
  // endpoint invents where it isn't — one field either way, so nothing
  // reading it has to know which.
  //
  // Absent on orders placed before this existed, and on any order the queue
  // could not record. Both render as no line rather than as a zero.
  queueId?: string;
  // Uber's id for the courier's job, on a delivery. The other half of the
  // pair: Toast says where the food is, Uber says where the driver is, and an
  // order in a car needs both to be tracked honestly.
  deliveryId?: string;
  // When the shop said it would be ready, in epoch ms — Toast's
  // estimatedFulfillmentDate, computed from the restaurant's configured quote
  // time, its hours and its throttling. A real answer about a real morning,
  // where PREP_MINUTES is a constant that is the same at 6am and at the
  // Saturday rush.
  //
  // Optional, and read through prepMinutesFor() rather than directly, which
  // falls back to the constant rather than showing a blank or a nonsense.
  readyAt?: number;
  // "pickup" | "delivery" | "catering", as it was when the order went in.
  // A mode, not a label: this is read back to decide what the tracker shows,
  // and it has to mean the same thing in every language and in every version
  // of the app that ever wrote it.
  fulfillmentMode: string;
  fulfillmentWhere: string;
  // Uber's own tracking page for the courier, when there is one. Kept because
  // it's the only live view of where the food is, and rebuilding a map of
  // somebody else's driver would be a worse version of a page that exists.
  trackingUrl?: string;
  // "Visa ending 4242", as two harmless pieces. Written when the order was
  // paid by card, so the confirmation and the account history can name the
  // card the way a receipt does.
  //
  // A brand and four digits, and nothing else — this record lives in
  // localStorage, and the full number is never anywhere it could be copied
  // from. See the note at the top of app/shop/checkout/card.ts.
  cardBrand?: string;
  cardLast4?: string;
  status: OrderStatus;
};

// The bill for an order, whether or not it was stored with one. An order from
// before the totals were snapshotted has its tax re-derived at today's rate,
// and no tip, which is the one part that genuinely can't be recovered.
//
// Re-derived tax is a guess, not the receipt. It matches what was charged only
// while the rate is the one that was in force that day, and rates move — LA
// County's went from 9.5% to 9.75% on 1 April 2025. Every order placed since
// the totals were snapshotted carries its own taxCents, which is what makes
// this a fallback for a handful of old rows rather than the way the bill is
// worked out.
export function orderTotals(order: PlacedOrder): {
  subtotalCents: number;
  taxCents: number;
  deliveryCents: number;
  deliveryQuotedCents: number;
  deliveryCoveredCents: number;
  deliveryWaived: boolean;
  tipCents: number;
  totalCents: number;
} {
  const taxCents = order.taxCents ?? taxFor(order.subtotalCents);
  const tipCents = order.tipCents ?? 0;
  const deliveryCents = order.deliveryCents ?? 0;
  // An order from before the waiver existed was charged what it was quoted,
  // so the fallback is the charge itself rather than a zero.
  const deliveryQuotedCents = order.deliveryQuotedCents ?? deliveryCents;
  return {
    subtotalCents: order.subtotalCents,
    taxCents,
    deliveryCents,
    deliveryQuotedCents,
    // Both derived, not stored. A number saved next to the two it comes from
    // is a third thing that can disagree with them — and on an old order it
    // comes out zero on its own, which is the truth: nothing was covered then.
    deliveryCoveredCents: Math.max(deliveryQuotedCents - deliveryCents, 0),
    deliveryWaived: deliveryQuotedCents > 0 && deliveryCents === 0,
    tipCents,
    totalCents:
      order.totalCents ?? order.subtotalCents + taxCents + deliveryCents + tipCents,
  };
}

// ——— Account ———

function readAccount(): Account | null {
  try {
    const raw = window.localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Account>;
    if (typeof parsed?.email !== "string" || typeof parsed?.name !== "string") {
      return null;
    }
    return {
      name: parsed.name,
      email: parsed.email,
      since: typeof parsed.since === "number" ? parsed.since : Date.now(),
    };
  } catch {
    return null;
  }
}

function readOrders(): PlacedOrder[] {
  try {
    const raw = window.localStorage.getItem(ORDERS_KEY);
    if (!raw) return EMPTY_ORDERS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY_ORDERS;
    const orders = parsed.filter(
      (order): order is PlacedOrder =>
        typeof order === "object" &&
        order !== null &&
        typeof (order as PlacedOrder).id === "string" &&
        typeof (order as PlacedOrder).placedAt === "number" &&
        Array.isArray((order as PlacedOrder).items),
    );
    return orders.length > 0 ? orders : EMPTY_ORDERS;
  } catch {
    return EMPTY_ORDERS;
  }
}

// Stable identity for the empty case, so useSyncExternalStore doesn't see a
// new array every read and re-render forever.
const EMPTY_ORDERS: PlacedOrder[] = [];

let account: Account | null = typeof window !== "undefined" ? readAccount() : null;
let orders: PlacedOrder[] = typeof window !== "undefined" ? readOrders() : EMPTY_ORDERS;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}
function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getAccount() {
  return account;
}
function getAccountServer(): Account | null {
  return null;
}
function getOrders() {
  return orders;
}
function getOrdersServer(): PlacedOrder[] {
  return EMPTY_ORDERS;
}

export function useAccount(): Account | null {
  return useSyncExternalStore(subscribe, getAccount, getAccountServer);
}

// The value right now, outside React — same reason peekFulfillment exists:
// the hook reports null for one render after hydration, which is right for
// rendering and wrong for deciding whether to redirect.
export function peekAccount(): Account | null {
  return account;
}

// Called by the sign-in screen once the server has minted a session, so the
// UI doesn't have to wait a round trip to know who you are. The cookie is the
// truth; this is the echo.
export function signIn(next: { name: string; email: string }) {
  account = {
    name: next.name.trim(),
    email: next.email.trim(),
    since: account?.since ?? Date.now(),
  };
  try {
    window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  } catch {
    // Private browsing. Holds for this page's lifetime, doesn't persist.
  }
  emit();
}

// Asks the server who the cookie says we are, and reconciles.
//
// Runs once when the app mounts. Two things it fixes that a purely local
// record can't: a session that expired or was signed out elsewhere still
// looked signed in here, and a session that exists on a fresh device — the
// cookie survives, localStorage doesn't — looked signed out.
let synced = false;
export async function syncSession(): Promise<void> {
  if (synced) return;
  synced = true;
  try {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as {
      user: { email: string; name: string } | null;
      configured: boolean;
    };
    // Auth0 not configured: leave whatever is local alone rather than signing
    // somebody out of a shop that has no sign-in yet.
    if (!body.configured) return;
    if (body.user) {
      signIn(body.user);
      // Only once there is a session. Signed out, /api/orders answers 204 and
      // the call is a round trip for nothing on every page load.
      await pullOrders();
    } else {
      forgetLocalAccount();
    }
  } catch {
    // Offline, or the route is down. The cached answer stands.
  }
}

function forgetLocalAccount() {
  if (account === null) return;
  account = null;
  try {
    window.localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    // As above.
  }
  emit();
}

// Signs out and leaves the order history alone. The orders are this device's
// record of what it bought — they aren't the account's property, and wiping
// somebody's receipts because they tapped "sign out" is a surprise nobody
// wants. clearOrders() is the separate, deliberate action.
export function signOut() {
  // Clears the cookie server-side as well as the local echo. Fire-and-forget
  // on purpose: the UI should sign out instantly rather than wait on a round
  // trip, and if the request fails the next syncSession() puts it right.
  void fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  forgetLocalAccount();
}

// ——— Orders ———

export function useOrders(): PlacedOrder[] {
  return useSyncExternalStore(subscribe, getOrders, getOrdersServer);
}

// CB-7K3M-001: brand, a tag for this browser, and a counter within it.
//
// Still not issued by a server — when a POS starts handing back real
// references, that one wins and this becomes the local key. But it is now
// unique enough to read out at a counter without two customers claiming the
// same number.
//
// A short tag for this browser, minted once and kept.
//
// Order numbers used to be CB-2026-0001 counting up from local history, which
// means every device's first order is CB-2026-0001. Fine as a key into this
// device's own list; useless as a reference somebody reads out at the counter,
// and a straight collision the moment a POS is holding the real ones.
//
// Crockford-ish alphabet: no I, L, O or U, so nothing is misheard as a digit
// or misread in handwriting, and nothing spells anything.
const TAG_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const DEVICE_TAG_KEY = "cb-device-tag-v1";

function deviceTag(): string {
  try {
    const kept = window.localStorage.getItem(DEVICE_TAG_KEY);
    if (kept && /^[0-9A-Z]{4}$/.test(kept)) return kept;
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const tag = Array.from(bytes, (byte) => TAG_ALPHABET[byte % TAG_ALPHABET.length]).join("");
    window.localStorage.setItem(DEVICE_TAG_KEY, tag);
    return tag;
  } catch {
    // Storage refused. A per-session tag still beats everyone sharing 0001;
    // it just won't survive a reload, which only affects how the *next* order
    // is numbered, not this one.
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => TAG_ALPHABET[byte % TAG_ALPHABET.length]).join("");
  }
}

function nextOrderId(existing: PlacedOrder[]): string {
  const prefix = `CB-${deviceTag()}-`;
  const highest = existing.reduce((max, order) => {
    if (!order.id.startsWith(prefix)) return max;
    const n = Number.parseInt(order.id.slice(prefix.length), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}

export function recordOrder(
  order: Omit<PlacedOrder, "id" | "placedAt" | "status">,
): PlacedOrder {
  const placed: PlacedOrder = {
    ...order,
    id: nextOrderId(orders),
    placedAt: Date.now(),
    status: "placed",
  };
  // Newest first, and capped: this is a convenience list, not an archive,
  // and localStorage is a few megabytes shared with everything else.
  orders = [placed, ...orders].slice(0, 50);
  try {
    window.localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  } catch {
    // As above — the order still went in, it just won't show up in the list.
  }
  emit();
  return placed;
}

// ——— The server's copy ———
//
// Orders live on this device, and that has one real cost: order breakfast on a
// phone, open the site on a laptop, and the tracker has never heard of you.
// app/orderHistory.ts is the other half — a copy kept against the signed-in
// email, so a second device can be told.
//
// The direction matters. The device store stays the thing every screen reads,
// and the server is a source that fills it in. Nothing downstream learned a
// new way to get an order, so the app still works signed out, offline, and on
// a deployment with no database.

/** Fold server-held orders into the device list.
 *
 *  The device wins on conflict. Its copy is the one written at the moment of
 *  ordering with everything the checkout knew — the card's brand and last
 *  four are only ever here, never sent — and the server's copy is that same
 *  record a moment later. Preferring the server would swap a complete record
 *  for one that has been through JSON twice for no gain.
 *
 *  Sorted newest-first and capped like recordOrder does, because activeOrder()
 *  and the history both read position rather than re-sorting. */
export function mergeOrders(incoming: PlacedOrder[]): void {
  if (incoming.length === 0) return;
  const byId = new Map<string, PlacedOrder>();
  for (const order of incoming) byId.set(order.id, order);
  // Second, so a device record overwrites the server's for the same id.
  for (const order of orders) byId.set(order.id, order);

  const merged = [...byId.values()]
    .sort((a, b) => b.placedAt - a.placedAt)
    .slice(0, 50);

  // Nothing new: leave the array identity alone. useSyncExternalStore compares
  // by reference, and handing it a fresh array on every sync would re-render
  // every screen holding an order for no reason.
  if (
    merged.length === orders.length &&
    merged.every((order, index) => order.id === orders[index]?.id)
  ) {
    return;
  }

  orders = merged;
  try {
    window.localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  } catch {
    // Private browsing or a full quota. The merged list still holds for this
    // page's lifetime, which is what the screens are about to read.
  }
  emit();
}

/** Ask the server for this account's orders and merge them in.
 *
 *  Silent about everything: signed out answers 204, no database answers 204,
 *  and a failure is a list that stays as it was. None of those is worth a
 *  word on screen — the device's own orders are already there. */
export async function pullOrders(): Promise<void> {
  try {
    const response = await fetch("/api/orders", { cache: "no-store" });
    if (!response.ok || response.status === 204) return;
    const body = (await response.json()) as { orders?: unknown };
    if (!Array.isArray(body.orders)) return;
    mergeOrders(body.orders.filter(isPlacedOrder));
  } catch {
    // Offline, or the route is down. What is on the device stands.
  }
}

/** Send one up. Called after an order is recorded.
 *
 *  Never awaited by the checkout and never able to fail it: the order is
 *  placed, the kitchen has it, and the device has its own copy. This is a
 *  convenience for the customer's other phone. */
export async function pushOrder(order: PlacedOrder): Promise<void> {
  try {
    await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
      keepalive: true,
    });
  } catch {
    // As above.
  }
}

/** The same shape check readOrders() applies to localStorage, against a
 *  payload that came over the network. Everything here is this customer's own
 *  record coming back, but "our own server sent it" is not a reason to render
 *  a half-built object into a tracker. */
function isPlacedOrder(value: unknown): value is PlacedOrder {
  const order = value as PlacedOrder | null;
  return (
    typeof order === "object" &&
    order !== null &&
    typeof order.id === "string" &&
    typeof order.placedAt === "number" &&
    Array.isArray(order.items)
  );
}

export function clearOrders() {
  orders = EMPTY_ORDERS;
  try {
    window.localStorage.removeItem(ORDERS_KEY);
  } catch {
    // As above.
  }
  emit();
}

// ——— Derived: "Reorder your usuals" ———

export type Usual = {
  slug: string;
  name: string;
  options: SelectedOptions;
  optionsLabel: string;
  unitCents: number;
  // How many separate orders this exact thing appeared in — "Ordered 3×
  // before" in the reference. Counted by order, not by quantity: buying six
  // bagels once doesn't make them a usual, buying one on six mornings does.
  timesOrdered: number;
  lastOrderedAt: number;
};

export function summarizeUsuals(history: PlacedOrder[], limit = 4): Usual[] {
  const byKey = new Map<string, Usual>();

  for (const order of history) {
    // A single order counts once per distinct item, however many lines of it
    // there were.
    const seen = new Set<string>();
    for (const item of order.items) {
      const key = `${item.slug}::${item.optionsLabel}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const existing = byKey.get(key);
      if (existing) {
        existing.timesOrdered += 1;
        existing.lastOrderedAt = Math.max(existing.lastOrderedAt, order.placedAt);
      } else {
        byKey.set(key, {
          slug: item.slug,
          name: item.name,
          options: item.options,
          optionsLabel: item.optionsLabel,
          unitCents: item.unitCents,
          timesOrdered: 1,
          lastOrderedAt: order.placedAt,
        });
      }
    }
  }

  return [...byKey.values()]
    .sort((a, b) => b.timesOrdered - a.timesOrdered || b.lastOrderedAt - a.lastOrderedAt)
    .slice(0, limit);
}

// "Mon, Jul 20", as in the reference — in whichever language is on. The tag
// comes from the caller because this module has no hooks and no locale of its
// own; screens pass localeById(useLocale()).tag.
export function formatOrderDate(timestamp: number, tag = "en-US"): string {
  return new Date(timestamp).toLocaleDateString(tag, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// What a row in the order history says it was. Structured rather than a
// finished sentence, because "+ 2 more" is English word order and this module
// has no locale — the caller has the product names in the chosen language and
// the string table to hang the count on.
export function summarizeOrderItems(
  order: PlacedOrder,
): { first: PlacedOrderItem; more: number } | null {
  const [first, ...rest] = order.items;
  if (!first) return null;
  return { first, more: rest.length };
}

// String keys, not English. This module has no hooks and no language, and it
// should not: it is where an order's shape lives, not where it is described.
// The tracker translates these at render, where the locale is known.
export const STATUS_LABEL: Record<OrderStatus, StringKey> = {
  placed: "order.placed",
  "in-the-kitchen": "order.inKitchen",
  ready: "order.readyForPickup",
  "on-the-way": "order.onTheWayStage",
  complete: "order.complete",
};

// ——— Tracking ———

// How long each stage is expected to take, in minutes from when the order went
// in. PREP_MINUTES is a fact about the shop and lives in shopFacts.ts, where
// the closing-time check and the courier's pickup time read the same number.
// The drive is a guess, and named as such: nobody has timed a Corner Bagel
// morning. Uber's own ETA replaces it once a delivery is booked.
export { PREP_MINUTES };
const DELIVERY_MINUTES = 22;

export type OrderStage = {
  status: OrderStatus;
  label: StringKey;
  // What's happening, in the customer's terms. A key and the values it needs,
  // rather than a finished sentence, because "Heading to Koreatown" puts the
  // destination where English wants it and nowhere else.
  detail: StringKey;
  detailVars?: Record<string, string>;
};

export type OrderProgress = {
  stages: OrderStage[];
  // Index into `stages` of the stage the order is estimated to be in.
  current: number;
  // 0–1, for the bar.
  fraction: number;
  // The key and the time for "Ready around 8:24am", or null once it's past
  // the estimate. A key, for the same reason the stages carry one.
  /** `reported` means the provider gave us this time rather than us deriving
   *  it from the clock. The tracker drops the word "estimated" when it's set. */
  eta: { key: StringKey; time: string; reported: boolean } | null;
  settled: boolean;
  /** Whether the stage on screen is one a provider reported, or one the clock
   *  worked out.
   *
   *  The difference is the whole of this page's honesty. "On the way" from
   *  Uber means a courier has the bag; "on the way" from a clock means eight
   *  minutes have passed. They read identically to somebody watching, so the
   *  copy under them must not. */
  reported: boolean;
  /** The words at the top of the screen, for every consumer.
   *
   *  Computed here rather than in each of them, because there are two — the
   *  tracker and the docked strip above it — and they read the same status and
   *  drew different conclusions from it more than once. A canceled delivery
   *  had "Delivery canceled" on the page and "On the way" an inch above it. */
  headline: StringKey;
  /** Uber's committed latest arrival, already formatted. Null when Uber has
   *  not given one, or when there is nothing left to arrive. */
  deadline: string | null;
  /** Uber says this delivery is not happening — canceled, or returned.
   *
   *  Its own field rather than a stage, because it is not a later point on the
   *  same line. Everything the stage list describes stopped being true. */
  canceled: boolean;
};

// Tolerant of every shape this field has been stored in — see
// fulfillmentModeKey() in app/fulfillment.ts, which reads the same records.
function isDelivery(order: PlacedOrder): boolean {
  return order.fulfillmentMode.toLowerCase().replace(/^finder\./, "") === "delivery";
}

export function stagesFor(order: PlacedOrder): OrderStage[] {
  const delivery = isDelivery(order);
  return [
    {
      status: "placed",
      label: STATUS_LABEL.placed,
      detail: "order.placedDetail",
    },
    {
      status: "in-the-kitchen",
      label: STATUS_LABEL["in-the-kitchen"],
      detail: "order.kitchenDetail",
    },
    delivery
      ? {
          status: "on-the-way",
          label: STATUS_LABEL["on-the-way"],
          detail: "order.headingTo",
          detailVars: { where: order.fulfillmentWhere },
        }
      : {
          status: "ready",
          label: STATUS_LABEL.ready,
          detail: "order.atCounter",
        },
    {
      status: "complete",
      label: delivery ? "order.delivered" : "order.pickedUpStage",
      detail: "order.enjoy",
    },
  ];
}

// "8:24am". The lowercasing and the closed-up space are an English house
// style — the shop writes times that way — and they are applied only to
// English. Every other language gets what its own locale data says, because
// stripping the space out of "오전 8:24" or lowercasing "上午" is not a house
// style, it's damage.
function formatClock(timestamp: number, tag = "en-US"): string {
  const clock = new Date(timestamp).toLocaleTimeString(tag, {
    hour: "numeric",
    minute: "2-digit",
  });
  return tag.startsWith("en") ? clock.toLowerCase().replace(" ", "") : clock;
}

// The estimated stage, from the clock alone — see the warning on OrderStatus.
//
// It deliberately stops one short of the last stage: "Delivered" and "Picked
// up" are claims about the physical world that a timer cannot make. The
// tracker parks on the ready/on-the-way stage and says the shop will confirm.
/** How long the kitchen is going to take on this one.
 *
 *  Toast's estimate when there is one, our constant when there isn't. The
 *  bounds are not paranoia: this number is what somebody is told, and it comes
 *  from a clock we do not own being compared to a clock we do. A device with
 *  its time set wrong, or a scheduled order that Toast has promised for
 *  tomorrow, would otherwise produce a bar that is already full or one that
 *  never moves. Out of range, the constant is the safer answer. */
const MAX_SENSIBLE_PREP_MINUTES = 6 * 60;

export function prepMinutesFor(order: PlacedOrder): number {
  if (order.readyAt === undefined) return PREP_MINUTES;
  const span = (order.readyAt - order.placedAt) / 60000;
  return span > 0 && span <= MAX_SENSIBLE_PREP_MINUTES ? span : PREP_MINUTES;
}

/** Which stage a real status puts the order in, and whether that is a claim
 *  worth making on its own.
 *
 *  The stages are [placed, in the kitchen, ready|on the way, complete].
 *
 *  A delivery reads differently from a pickup, and the difference is not
 *  cosmetic. "Ready" on a pickup means come and get it; the same word on a
 *  delivery means a bag is sitting on a shelf waiting for a driver, which is
 *  not "on the way" and must not be shown as it. So a delivery only reaches
 *  stage two when Uber says a courier actually has the food.
 *
 *  `firm` marks the stages we are willing to state on their own — ready,
 *  collected, delivered. The early ones are true but weak: a kitchen that
 *  never fires IN_PREPARATION, because the shop has no KDS, would otherwise
 *  hold the bar at "placed" for eight minutes and then jump. */
function stageFromLive(
  live: LiveStatus | undefined,
  delivery: boolean,
): { index: number; firm: boolean } | undefined {
  if (!live) return undefined;
  if (delivery) {
    switch (live.courier) {
      case "collected":
      case "delivering":
        return { index: 2, firm: true };
      case "delivered":
        return { index: 3, firm: true };
      case "canceled":
        return undefined;
      default:
        break;
    }
    // The food's own progress, before a courier has it. Ready is real, but on
    // a delivery it is still "in the kitchen" as far as the customer's food
    // moving towards them goes.
    switch (live.food) {
      case "cooking":
      case "ready":
        return { index: 1, firm: false };
      case "received":
        return { index: 0, firm: false };
      default:
        return undefined;
    }
  }
  switch (live.food) {
    case "received":
      return { index: 0, firm: false };
    case "cooking":
      return { index: 1, firm: false };
    case "ready":
      return { index: 2, firm: true };
    case "done":
      return { index: 3, firm: true };
    // A voided order is not a later stage, it is a different conversation.
    // Nothing here advances it; the estimate carries on, which is wrong but
    // wrong in the direction of saying less.
    default:
      return undefined;
  }
}

export function progressFor(
  order: PlacedOrder,
  tag = "en-US",
  now: number = Date.now(),
  live?: LiveStatus,
): OrderProgress {
  const stages = stagesFor(order);
  const delivery = isDelivery(order);
  const prep = prepMinutesFor(order);
  // The courier's drive is still ours to estimate — Toast's number is when the
  // food is ready, not when it reaches a doorstep.
  const totalMinutes = prep + (delivery ? DELIVERY_MINUTES : 0);
  const elapsed = Math.max(0, (now - order.placedAt) / 60000);

  const guessed = elapsed < 2 ? 0 : elapsed < prep ? 1 : 2;

  // ——— How a real status and a running clock are reconciled ———
  //
  // Neither one wins outright, and it took getting both wrong to see why.
  //
  // Clock wins always, and a real "still cooking" gets overwritten by an
  // estimate that has run out — so the screen says the food is on the counter
  // while Toast says it is not, and somebody walks over for nothing. That is
  // the one failure that costs a person a trip.
  //
  // Reality wins always, and a shop with no KDS — where nothing fires until a
  // human presses Order Ready — sits at "placed" for eight minutes and then
  // jumps to the end. Truthful, and it looks broken.
  //
  // So: a firm real stage is the answer, whatever the clock thinks. Anything
  // else lets the clock keep creeping, but caps it below "ready", because
  // "ready" is the claim that sends somebody out of the house and we know it
  // is not true yet.
  const real = stageFromLive(live, delivery);
  const READY = 2;
  const current = real
    ? real.firm
      ? real.index
      : Math.min(Math.max(guessed, real.index), READY - 1)
    : guessed;

  const done = current >= stages.length - 1;
  // ——— "Arrived" is not the same index on the two kinds of order ———
  //
  // This read `real.index >= READY` for both, and on a delivery READY is the
  // courier having the bag — which is the middle of the journey, not the end
  // of it. So the moment Uber started reporting a real courier with a real
  // arrival time, the page threw the time away as though there were nothing
  // left to wait for, and fell through to "The shop will confirm when it's
  // ready. We can't see the counter from here." Both halves of that were
  // false: we could see, and it was not about the counter.
  //
  // A delivery has arrived when it is delivered. A pickup has arrived when it
  // is on the counter, because at that point the waiting genuinely is over.
  const arrived =
    real !== undefined && real.firm && real.index >= (delivery ? stages.length - 1 : READY);
  // Reported, not guessed. A provider has to have named *this* stage — a
  // clock that has crept past what Toast last said is still a clock.
  const reported = real !== undefined && real.index === current;
  // Uber's canceled covers cancelled and returned. stageFromLive drops it, so
  // without this the estimate carries on counting towards a delivery nobody is
  // making.
  const canceled = delivery && live?.courier === "canceled";
  const fraction = arrived ? 1 : Math.min(1, elapsed / totalMinutes);
  // Past the estimate with nothing to add, or finished for real. An order the
  // shop has actually marked ready stays on the screen until it is collected
  // rather than ageing off it.
  const settled = done || (elapsed >= totalMinutes && !real);

  // ——— A guessed stage does not get to talk like a reported one ———
  //
  // The stage list is the same four rows either way, and the detail under the
  // active row is where the page makes its claim. "Heading to 3450 Wilshire
  // St." says a courier has the bag. "Waiting for you at the counter." says
  // somebody can leave the house. Both were printed off a clock the moment
  // enough minutes had passed, with no provider having said anything — and the
  // pickup one is the failure the note above stageFromLive warns about, showing
  // up in a different place than it was guarded in.
  //
  // So the third stage's detail is swapped for one the clock can support when
  // nothing has reported it. Only the third: "placed" and "in the kitchen" are
  // safe to say from a clock, and the last stage cannot be reached by one.
  const spoken =
    current === READY && !reported
      ? stages.map((entry, index): OrderStage => {
          if (index !== READY) return entry;
          const detail: StringKey = delivery
            ? "order.headingToGuess"
            : "order.atCounterGuess";
          return { ...entry, detail };
        })
      : stages;

  // The headline is the page's answer to "where is my order", in 26px, and a
  // stage name is not always an honest one. "On the way" over a detail that
  // says we are waiting to hear from a courier is the screen arguing with
  // itself; the guessed form says the same thing as the detail does.
  const headline: StringKey = canceled
    ? "order.deliveryCanceled"
    : current === READY && !reported
      ? delivery
        ? "order.onTheWayGuess"
        : "order.readyGuess"
      : spoken[current].label;

  return {
    stages: spoken,
    current,
    headline,
    fraction,
    // No estimate once it is really ready: "ready around 8:24" under the word
    // Ready is the page arguing with itself.
    //
    // Uber's own arrival time wins where there is one. Ours is placed-at plus
    // a constant — the same answer at 6am and in a downpour, and blind to
    // whether a courier has even been assigned. Uber is watching the traffic.
    // `reported` travels with it so the screen can stop calling it an
    // estimate, because at that point it isn't ours to estimate.
    eta:
      // Nothing to arrive, nothing to say when. A canceled delivery kept
      // producing an arrival time, because cancellation is not a stage and
      // every other branch here reasons about stages.
      settled || arrived || canceled
        ? null
        : {
            key: delivery ? "order.arrivingAround" : "order.readyAround",
            time: formatClock(live?.etaAt ?? order.placedAt + totalMinutes * 60000, tag),
            reported: typeof live?.etaAt === "number",
          },
    settled,
    reported,
    canceled,
    // Shown beside the estimate, the way Uber shows it: the expected time and
    // the one it has undertaken not to pass. Suppressed on the same terms as
    // the estimate — there is no latest arrival for an order that has arrived,
    // and none for one that was canceled.
    deadline:
      settled || arrived || canceled || typeof live?.deadlineAt !== "number"
        ? null
        : formatClock(live.deadlineAt, tag),
  };
}

export function findOrder(history: PlacedOrder[], id: string): PlacedOrder | undefined {
  return history.find((order) => order.id === id);
}

// The order still worth watching, if there is one — what the shop's header
// bar should offer to track. Anything past its estimate has nothing left to
// say, so it drops off rather than sitting there stale.
export function activeOrder(history: PlacedOrder[], now: number = Date.now()): PlacedOrder | null {
  const recent = history.find((order) => !progressFor(order, "en-US", now).settled);
  return recent ?? null;
}
