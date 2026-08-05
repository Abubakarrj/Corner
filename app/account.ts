"use client";

import { useSyncExternalStore } from "react";
import type { SelectedOptions } from "./shop/products";

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

// Where an order got to. Only "placed" is ever set today: nothing tells this
// app when a bagel is handed over, so claiming "Delivered" would be a
// decoration rather than a fact. The rest exist because the moment there's a
// POS or a courier webhook, the chip that renders them is already written.
export type OrderStatus = "placed" | "in-the-kitchen" | "out-for-delivery" | "delivered";

export type PlacedOrder = {
  id: string;
  placedAt: number;
  items: PlacedOrderItem[];
  subtotalCents: number;
  fulfillmentMode: string;
  fulfillmentWhere: string;
  status: OrderStatus;
};

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

// CB-2026-0045: brand, year, and a per-device counter. Deliberately not
// presented to the kitchen as an order number — nothing on the server issues
// these, so two devices will happily mint the same one. It's a label for the
// customer's own list until the order system hands back a real reference.
function nextOrderId(existing: PlacedOrder[]): string {
  const year = new Date().getFullYear();
  const prefix = `CB-${year}-`;
  const highest = existing.reduce((max, order) => {
    if (!order.id.startsWith(prefix)) return max;
    const n = Number.parseInt(order.id.slice(prefix.length), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(4, "0")}`;
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
  placed: "Placed",
  "in-the-kitchen": "In the kitchen",
  "out-for-delivery": "Out for Delivery",
  delivered: "Delivered",
};
