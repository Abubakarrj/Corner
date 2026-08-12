"use client";

import { useSyncExternalStore } from "react";
import {
  isOpenNow,
  minutesUntilClose,
  nextOpeningAt,
  PREP_MINUTES,
  type NextOpening,
} from "./shopFacts";

// Whether the counter is open, as something a component can render.
//
// Built on useSyncExternalStore rather than useState + setInterval because
// getSnapshot has to return a *stable* value between renders — recomputing
// `openingStatus(new Date())` on every call would hand React a new object each
// time and spin. So the snapshot is cached and only replaced when the answer
// actually changes, which is at most twice a day.
//
// The tick is a minute. The thing it has to catch is the shop shutting while
// somebody is mid-checkout, and a minute is the resolution the copy is written
// at ("opens at 7am").
export type Opening = {
  open: boolean;
  // When the window opens again, in parts, or null while it's open.
  //
  // Parts, not the finished "Closed · opens tomorrow at 7am" this used to
  // carry. That sentence was English, and the screen that showed it reached
  // into it with `.replace("Closed · o", "O")` to get a different one out —
  // which is a string operation on a translation, and works in exactly one
  // language. The screens build what they need from these three fields.
  next: NextOpening | null;
  minutesLeft: number;
  // Enough time to make the order before the window shuts. Being open is not
  // the same as being able to take an order at 1:58pm.
  acceptingOrders: boolean;
};

// ⚠️ See openPreview() in shopFacts.ts and the warning above it.
let previewing = false;

function compute(): Opening {
  const minutesLeft = minutesUntilClose();
  const open = previewing || isOpenNow();
  return {
    open,
    next: nextOpeningAt(),
    minutesLeft,
    // The prep-time check is skipped while previewing: five minutes before
    // close it would otherwise refuse the order the preview exists to place.
    acceptingOrders: open && (previewing || minutesLeft >= PREP_MINUTES),
  };
}

let snapshot: Opening = compute();
const listeners = new Set<() => void>();

// ⚠️ Set from /api/capabilities when SHOP_OPEN_PREVIEW is on — see
// openPreview() in shopFacts.ts, and the warning above it. Held in a module
// variable rather than threaded through the store because this file's
// snapshot has to stay identity-stable for useSyncExternalStore.
/** Called by the capabilities provider once the server has answered. Without
 *  it the browser would show "closed" over an endpoint that accepts orders,
 *  which is the confusing half of the problem rather than the dangerous one. */
export function setOpenPreview(on: boolean): void {
  if (previewing === on) return;
  previewing = on;
  snapshot = compute();
  for (const listener of listeners) listener();
}


function refresh() {
  const next = compute();
  // `next` is a fresh object every tick, so it's compared field by field —
  // a reference check here would replace the snapshot every minute and
  // re-render every subscriber for nothing.
  if (
    next.open === snapshot.open &&
    next.acceptingOrders === snapshot.acceptingOrders &&
    next.minutesLeft === snapshot.minutesLeft &&
    next.next?.when === snapshot.next?.when &&
    next.next?.day === snapshot.next?.day &&
    next.next?.hour === snapshot.next?.hour
  ) {
    return;
  }
  snapshot = next;
  listeners.forEach((listener) => listener());
}

let timer: number | undefined;

function subscribe(callback: () => void) {
  listeners.add(callback);
  if (timer === undefined) {
    timer = window.setInterval(refresh, 60_000);
  }
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

function getSnapshot(): Opening {
  return snapshot;
}

// The server computes the same thing from the same clock, so the first paint
// agrees with the markup. It can only differ if the render straddles the
// opening minute itself, which resolves on the next tick.
//
// Held for half a minute rather than recomputed on every call, and that isn't
// a saving — it's the contract. React calls this more than once per render and
// compares the results by identity, so a fresh object each time is a store
// that never looks settled: it warns in development ("the result of
// getServerSnapshot should be cached to avoid an infinite loop") and can spin
// during hydration. Thirty seconds is well inside the minute this thing
// changes on, so the answer is no staler than it was.
let served: { at: number; opening: Opening } | null = null;

function getServerSnapshot(): Opening {
  const now = Date.now();
  if (!served || now - served.at > 30_000) served = { at: now, opening: compute() };
  return served.opening;
}

export function useOpening(): Opening {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
