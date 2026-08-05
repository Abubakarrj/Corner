"use client";

import { useSyncExternalStore } from "react";
import { minutesUntilClose, openingStatus, PREP_MINUTES } from "./shopFacts";

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
  label: string;
  minutesLeft: number;
  // Enough time to make the order before the window shuts. Being open is not
  // the same as being able to take an order at 1:58pm.
  acceptingOrders: boolean;
};

function compute(): Opening {
  const status = openingStatus();
  const minutesLeft = minutesUntilClose();
  return {
    open: status.open,
    label: status.label,
    minutesLeft,
    acceptingOrders: status.open && minutesLeft >= PREP_MINUTES,
  };
}

let snapshot: Opening = compute();
const listeners = new Set<() => void>();

function refresh() {
  const next = compute();
  if (
    next.open === snapshot.open &&
    next.label === snapshot.label &&
    next.acceptingOrders === snapshot.acceptingOrders &&
    next.minutesLeft === snapshot.minutesLeft
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
