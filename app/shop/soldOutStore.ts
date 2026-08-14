"use client";

import { useMemo, useSyncExternalStore } from "react";
import { applySoldOut } from "./products";

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

// The snapshot: the board as a set, rebuilt whenever it moves.
//
// A set rather than a counter, and that is not a detail. The first cut kept a
// version number and had the hook return the bare soldOut() function, on the
// reasoning that the number is what makes React notice module state changed.
// It does, for a component that reads the answer directly. It does nothing for
// one that memoises: useCartRows keys its rows on [lines, isGone], and a
// constant isGone means those deps never move, so the memo kept handing back
// rows built before the kitchen ran out.
//
// Making the snapshot the value itself removes the whole class. The identity
// changes when the board changes, a closure over it genuinely depends on it,
// and there is no counter to remember to bump.
let snapshot: ReadonlySet<string> = new Set();
let listening = false;
let timer: number | null = null;

// A stable empty set for the server snapshot. React calls getServerSnapshot
// more than once and compares by identity; a fresh `new Set()` each time is an
// infinite loop.
const NOTHING: ReadonlySet<string> = new Set();

function announce(slugs: readonly string[]) {
  snapshot = new Set(slugs);
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
    announce(slugs);
  } catch {
    // Offline, or the endpoint is down. Keep what we have. See above.
  }
}

// A named handler, so it can be taken off again.
//
// It used to be an inline arrow, which meant it could only ever be added.
// `listening` goes back to false when the last subscriber leaves, so the next
// mount attached a second one, and a third, and every one of them fired a
// fetch on the next tab focus. Navigating between the catalog and an item is
// exactly that mount and unmount, so it grew as fast as somebody browses.
function onVisible() {
  if (document.visibilityState === "visible") void pull();
}

function subscribe(callback: () => void) {
  if (!listening) {
    listening = true;
    void pull();
    timer = window.setInterval(() => void pull(), REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
  }
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
      listening = false;
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

function getSnapshot(): ReadonlySet<string> {
  return snapshot;
}

function getServerSnapshot(): ReadonlySet<string> {
  // Empty, and the server render has to agree: see the note on applySoldOut in
  // products.ts about why the server's own list never reaches this markup.
  return NOTHING;
}

/** Whether an item is off the board, as a function that re-renders its caller
 *  when the answer changes.
 *
 *  `const isGone = useSoldOut();` then `isGone(product.slug)`.
 *
 *  The identity moves when the board moves, so a caller that memoises on it
 *  recomputes. See the note on `snapshot` above for why that matters. */
export function useSoldOut(): (slug: string) => boolean {
  const gone = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => (slug: string) => gone.has(slug), [gone]);
}
