"use client";

import { useSyncExternalStore } from "react";
import { applySoldOut, soldOut } from "./products";

// What's off the board, in the browser.
//
// ——— Why the client needs its own copy at all ———
//
// soldOut(slug) is synchronous and called during render: the catalog tile asks
// before it draws a button, and the cart row asks before it draws a line.
// There is no awaiting an endpoint in the middle of that, so the answer has to
// already be in memory, which means it has to be fetched and kept.
//
// It used to be a constant compiled into the bundle, which made this easy and
// wrong: the list could not change without a deploy, so there was nothing to
// keep in sync. Now that a person can take the donuts off the board at 2pm,
// a tab opened at 9am is holding this morning's answer.
//
// ——— Absent is not "in stock" ———
//
// The fetch failing leaves the last known list in place rather than clearing
// it. An empty list is a claim — "everything is available" — and it is exactly
// the claim that should not be assembled out of a failed request. Being a
// little stale is the safe direction: /api/shop-order re-reads the real list
// and refuses on the way through, so the worst case is a message at checkout
// rather than somebody collecting a bagel that does not exist.
//
// Same external-store shape as the theme, the locale and the cart, and for the
// same reason: the value lives outside React and every reader has to see the
// same one.

const ENDPOINT = "/api/sold-out";

// How often a tab that stays open goes back to ask. Five minutes, plus a check
// whenever the tab is brought back to the front, which is what actually
// catches the phone that was in a pocket over lunch.
const REFRESH_MS = 5 * 60_000;

const listeners = new Set<() => void>();

// Bumped on every change. The snapshot has to be a primitive that changes
// identity, because the list itself lives in products.ts and mutating an array
// in place is invisible to useSyncExternalStore.
let version = 0;
let listening = false;
let timer: number | null = null;

function announce() {
  version += 1;
  listeners.forEach((listener) => listener());
}

async function pull() {
  try {
    const response = await fetch(ENDPOINT, { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as { slugs?: unknown };
    if (!Array.isArray(body.slugs)) return;
    const slugs = body.slugs.filter((slug): slug is string => typeof slug === "string");
    applySoldOut(slugs);
    announce();
  } catch {
    // Offline, or the endpoint is down. Keep what we have. See above.
  }
}

function subscribe(callback: () => void) {
  if (!listening) {
    listening = true;
    void pull();
    timer = window.setInterval(() => void pull(), REFRESH_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void pull();
    });
  }
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
      listening = false;
    }
  };
}

function getSnapshot(): number {
  return version;
}

function getServerSnapshot(): number {
  // The markup is rendered against whatever the server's list was at the time,
  // and the first client render has to agree with it or React throws away the
  // tree. Zero on both sides; the fetch above corrects it a moment later.
  return 0;
}

/** Whether an item is off the board, as a function that re-renders its caller
 *  when the answer changes.
 *
 *  `const isGone = useSoldOut();` then `isGone(product.slug)`. The version is
 *  read for its subscription rather than its value, which is the whole trick:
 *  the list is module state and this is what makes React notice it moved. */
export function useSoldOut(): (slug: string) => boolean {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return soldOut;
}
