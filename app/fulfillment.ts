"use client";

import type { StringKey } from "./i18n";

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
  // Delivery has no location of ours. The address is the visitor's, and it
  // travels with the point they dropped a pin on.
  //
  // ——— The pin is the destination; the address is the label ———
  //
  // ⚠️ These two can disagree, and when they do the pin wins. That is the
  // whole reason the pair exists.
  //
  // Before this, delivery was an address string and nothing else, so every
  // stage that needed coordinates geocoded the words again: the range check
  // geocoded, the courier quote geocoded, and Uber geocoded a third time at
  // its end. Three guesses at one doorway, none of them the customer's, and
  // "3545 Wilshire Blvd" in Koreatown resolves to a building with an entrance
  // on Ardmore — the block is right and the door is wrong, which is a courier
  // standing on the wrong street.
  //
  // So the customer places the point themselves and it is carried from there:
  // see PinPicker.tsx. The address string stays because a courier is a person
  // who reads one, and because it is what the order confirmation shows — but
  // nothing derives a position from it any more.
  //
  // lat/lng are optional because a delivery chosen before this existed is
  // already sitting in somebody's localStorage. Those fall back to geocoding
  // the words, which is what they have always done; there is nothing better
  // to do with them and dropping the basket would be worse.
  //
  // ——— The rest of what a courier needs, kept with the address ———
  //
  // `unit` and `instructions` used to live in checkout state and nowhere else,
  // which meant they were retyped on every order and forgotten on most. They
  // belong here for a plainer reason too: the moment somebody is looking at a
  // map of their own building is the moment "entrance on Ardmore" and "4B" are
  // actually in their head. Asking three screens later, next to a card form,
  // is asking at the worst time.
  //
  // Checkout prefills from these and can still edit — a one-off "leave it with
  // the neighbour" is about an order, not about an address.
  //
  // `placeId` is Google's handle for whatever the address names. Kept so a
  // later lookup can name the same place without spelling it out again; it is
  // never the destination, which is lat/lng above.
  | {
      mode: "delivery";
      address: string;
      lat?: number;
      lng?: number;
      placeId?: string;
      unit?: string;
      instructions?: string;
    };

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
// The mode comes back as a string key, not a word, for the same reason the
// order stages do: this module knows the shape of a destination and has no
// business knowing what language to name it in.
// The string key that names a fulfillment mode.
//
// Takes a loose string rather than the union because it also has to read back
// what a *stored order* recorded, and that record is whatever the app wrote on
// the day: "Pickup" from before any of this was translated, and "finder.pickup"
// from the window where the key itself was mistakenly stored. Both still have
// to name a mode years later, so both are accepted; anything unrecognised is
// pickup, which is the mode the shop defaults to.
export function fulfillmentModeKey(mode: string): StringKey {
  const bare = mode.toLowerCase().replace(/^finder\./, "");
  if (bare === "delivery") return "finder.delivery";
  if (bare === "catering") return "finder.catering";
  return "finder.pickup";
}

export function describeFulfillment(fulfillment: Fulfillment): {
  mode: StringKey;
  where: string;
} {
  if (fulfillment.mode === "delivery") {
    return { mode: "finder.delivery", where: fulfillment.address };
  }
  return {
    mode: fulfillment.mode === "catering" ? "finder.catering" : "finder.pickup",
    where: fulfillment.label,
  };
}
