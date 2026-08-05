"use client";

import { useSyncExternalStore } from "react";

// Where an order is going. Nothing in the shop can be ordered without this:
// a bagel picked up in Koreatown, a tray going out to an office, and a
// delivery to an apartment are three different transactions, and the menu,
// the price, and the handoff all depend on which one it is.
//
// Lives at the app root rather than inside app/shop, because it's set on
// /locations — in the marketing tree — and read in the shop. Same
// localStorage + useSyncExternalStore shape as the cart next to it: the
// server and the client's first render both see null via getServerSnapshot,
// and React swaps in the persisted value right after, so there's no hydration
// mismatch and no setState inside an effect.
const STORAGE_KEY = "cb-fulfillment-v1";

export type Fulfillment =
  // A shop or a catering kitchen the order comes out of. `locationId` keys into
  // LOCATIONS; `label` and `detail` are denormalised so the shop can name the
  // destination without importing the marketing tree's data.
  | { mode: "pickup" | "catering"; locationId: string; label: string; detail: string }
  // Delivery has no location of ours — the address is the visitor's, stored
  // as typed. It isn't geocoded or validated against a delivery radius yet;
  // that needs an address service, and until then this is a string we show
  // back to them rather than something the system can reason about.
  | { mode: "delivery"; address: string };

function isFulfillment(value: unknown): value is Fulfillment {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Fulfillment> & { mode?: string };
  if (candidate.mode === "delivery") {
    return typeof (candidate as { address?: unknown }).address === "string";
  }
  if (candidate.mode === "pickup" || candidate.mode === "catering") {
    const pick = candidate as { locationId?: unknown; label?: unknown; detail?: unknown };
    return (
      typeof pick.locationId === "string" &&
      typeof pick.label === "string" &&
      typeof pick.detail === "string"
    );
  }
  return false;
}

function read(): Fulfillment | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isFulfillment(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

let current: Fulfillment | null =
  typeof window !== "undefined" ? read() : null;
const listeners = new Set<() => void>();

function getSnapshot() {
  return current;
}
function getServerSnapshot(): Fulfillment | null {
  return null;
}
function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function setFulfillment(next: Fulfillment) {
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing or blocked storage. The choice still holds for this
    // page's lifetime, which is better than the button appearing to do
    // nothing; it just won't survive a reload.
  }
  listeners.forEach((listener) => listener());
}

export function clearFulfillment() {
  current = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // As above.
  }
  listeners.forEach((listener) => listener());
}

export function useFulfillment(): Fulfillment | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// The value right now, outside React.
//
// useFulfillment reports null for one render after hydration — that's what
// getServerSnapshot is for, and it's the right answer for rendering. It is
// the wrong answer for deciding whether to redirect: acting on it would
// bounce someone who has a perfectly good location. This reads the store
// itself, which localStorage already filled at module load, so it's true
// from the first tick.
export function peekFulfillment(): Fulfillment | null {
  return current;
}

// One line naming the destination, for the shop's header and the order
// confirmation — the answer to "where is this going?".
export function describeFulfillment(fulfillment: Fulfillment): {
  mode: string;
  where: string;
} {
  if (fulfillment.mode === "delivery") {
    return { mode: "Delivery", where: fulfillment.address };
  }
  return {
    mode: fulfillment.mode === "catering" ? "Catering" : "Pickup",
    where: fulfillment.label,
  };
}
