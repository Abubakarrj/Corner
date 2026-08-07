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

function compute(): Opening {
  const minutesLeft = minutesUntilClose();
  const open = isOpenNow();
  return {
    open,
    next: nextOpeningAt(),
    minutesLeft,
    acceptingOrders: open && minutesLeft >= PREP_MINUTES,
  };
}

let snapshot: Opening = compute();
const listeners = new Set<() => void>();

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
function getServerSnapshot(): Opening {
  return compute();
}

export function useOpening(): Opening {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
