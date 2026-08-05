"use client";

import { useSyncExternalStore } from "react";
import type { SelectedOptions } from "./shop/products";
import { taxFor } from "./shop/money";

// ⚠️ THIS IS NOT AUTHENTICATION. ⚠️
//
// Corner Bagel has no auth backend and no server-side accounts — see the
// note in app/(marketing)/membership/MembershipForm.tsx. What lives here is
// a local record on one device: a name and an email somebody typed into that
// form, and the orders they placed from this browser. It is set by that form
// succeeding, and cleared by "Sign out".
//
// That is enough to do the useful half of an account — show your usuals,
// show what you ordered, let you reorder it — without pretending to know who
// anybody is. It must never be used to gate anything private. There is no
// password, no token, no server check; anyone with the device is "signed
// in", and clearing site data signs them out. When real auth lands, this
// file becomes a cache in front of it rather than the source of truth.
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
  tipCents?: number;
  totalCents?: number;
  fulfillmentMode: string;
  fulfillmentWhere: string;
  status: OrderStatus;
};

// The bill for an order, whether or not it was stored with one. An order from
// before the totals were snapshotted has its tax re-derived — the rate hasn't
// changed, so that reproduces what was charged — and no tip, which is the one
// part that genuinely can't be recovered.
export function orderTotals(order: PlacedOrder): {
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
} {
  const taxCents = order.taxCents ?? taxFor(order.subtotalCents);
  const tipCents = order.tipCents ?? 0;
  return {
    subtotalCents: order.subtotalCents,
    taxCents,
    tipCents,
    totalCents: order.totalCents ?? order.subtotalCents + taxCents + tipCents,
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

// Signs out and leaves the order history alone. The orders are this device's
// record of what it bought — they aren't the account's property, and wiping
// somebody's receipts because they tapped "sign out" is a surprise nobody
// wants. clearOrders() is the separate, deliberate action.
export function signOut() {
  account = null;
  try {
    window.localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    // As above.
  }
  emit();
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

// "Mon, Jul 20", as in the reference.
export function formatOrderDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function describeOrderItems(order: PlacedOrder): string {
  const [first, ...rest] = order.items;
  if (!first) return "Empty order";
  return rest.length > 0 ? `${first.name} + ${rest.length} more` : first.name;
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "Order received",
  "in-the-kitchen": "In the kitchen",
  ready: "Ready for pickup",
  "on-the-way": "On the way",
  complete: "Complete",
};

// ——— Tracking ———

// How long each stage is expected to take, in minutes from when the order went
// in. Guesses, and named as such: nobody has timed a Corner Bagel morning.
// They're the one place to change when somebody has.
export const PREP_MINUTES = 12;
const DELIVERY_MINUTES = 22;

export type OrderStage = {
  status: OrderStatus;
  label: string;
  // What's happening, in the customer's terms.
  detail: string;
};

export type OrderProgress = {
  stages: OrderStage[];
  // Index into `stages` of the stage the order is estimated to be in.
  current: number;
  // 0–1, for the bar.
  fraction: number;
  // "Ready around 8:24am", or null once it's past the estimate.
  etaLabel: string | null;
  settled: boolean;
};

function isDelivery(order: PlacedOrder): boolean {
  return order.fulfillmentMode.toLowerCase() === "delivery";
}

export function stagesFor(order: PlacedOrder): OrderStage[] {
  const delivery = isDelivery(order);
  return [
    {
      status: "placed",
      label: STATUS_LABEL.placed,
      detail: "We have your order and the shop is confirming it.",
    },
    {
      status: "in-the-kitchen",
      label: STATUS_LABEL["in-the-kitchen"],
      detail: "Bagels are being toasted and built.",
    },
    delivery
      ? {
          status: "on-the-way",
          label: STATUS_LABEL["on-the-way"],
          detail: `Heading to ${order.fulfillmentWhere}.`,
        }
      : {
          status: "ready",
          label: STATUS_LABEL.ready,
          detail: `Waiting for you at the counter.`,
        },
    {
      status: "complete",
      label: delivery ? "Delivered" : "Picked up",
      detail: delivery ? "Enjoy it." : "Enjoy it.",
    },
  ];
}

function formatClock(timestamp: number): string {
  return new Date(timestamp)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toLowerCase()
    .replace(" ", "");
}

// The estimated stage, from the clock alone — see the warning on OrderStatus.
//
// It deliberately stops one short of the last stage: "Delivered" and "Picked
// up" are claims about the physical world that a timer cannot make. The
// tracker parks on the ready/on-the-way stage and says the shop will confirm.
export function progressFor(order: PlacedOrder, now: number = Date.now()): OrderProgress {
  const stages = stagesFor(order);
  const delivery = isDelivery(order);
  const totalMinutes = PREP_MINUTES + (delivery ? DELIVERY_MINUTES : 0);
  const elapsed = Math.max(0, (now - order.placedAt) / 60000);

  const current = elapsed < 2 ? 0 : elapsed < PREP_MINUTES ? 1 : 2;
  const fraction = Math.min(1, elapsed / totalMinutes);
  const settled = elapsed >= totalMinutes;

  return {
    stages,
    current,
    fraction,
    etaLabel: settled
      ? null
      : `${delivery ? "Arriving" : "Ready"} around ${formatClock(order.placedAt + totalMinutes * 60000)}`,
    settled,
  };
}

export function findOrder(history: PlacedOrder[], id: string): PlacedOrder | undefined {
  return history.find((order) => order.id === id);
}

// The order still worth watching, if there is one — what the shop's header
// bar should offer to track. Anything past its estimate has nothing left to
// say, so it drops off rather than sitting there stale.
export function activeOrder(history: PlacedOrder[], now: number = Date.now()): PlacedOrder | null {
  const recent = history.find((order) => !progressFor(order, now).settled);
  return recent ?? null;
}
