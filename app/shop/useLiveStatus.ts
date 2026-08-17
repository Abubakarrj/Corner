"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { PlacedOrder } from "../account";
import type { LiveStatus } from "../orderStages";

// One poll for the whole app, shared by everything that draws an order.
//
// ——— Why this is a store and not a useEffect ———
//
// progressFor() has four callers: the tracker, the strip at the top of the
// shop, the row in the chat panel, and the account page. The first cut gave
// the live status to the tracker alone, and the result was a page arguing with
// itself — the headline said "Ready for pickup" while the strip four
// centimetres above it said "Ready around 9:13pm", because one of them knew
// and the other was still counting.
//
// So the status lives outside React, in the same shape as the locale, the
// theme and the application draft: a module-level value with subscribers, read
// through useSyncExternalStore. Every component gets the same answer at the
// same moment, and mounting three of them costs one request rather than three.
//
// ——— What it does not do ———
//
// It does not poll for orders that are finished, and it does not poll for
// orders placed before any of this existed, because they carry no provider ids
// to ask about. Both cases return undefined and every caller falls back to the
// estimate, which is what they all did before this file.

const POLL_MS = 20_000;

type Watch = {
  status: LiveStatus | undefined;
  timer: number | null;
  refs: number;
};

const watches = new Map<string, Watch>();
const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

function keyOf(order: PlacedOrder | undefined): string | null {
  if (!order) return null;
  const parts = [
    order.toastGuid ? `toast=${encodeURIComponent(order.toastGuid)}` : null,
    order.deliveryId ? `uber=${encodeURIComponent(order.deliveryId)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("&") : null;
}

async function ask(key: string): Promise<void> {
  const watch = watches.get(key);
  if (!watch) return;
  try {
    const response = await fetch(`/api/order-status?${key}`, { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as LiveStatus & { unknown?: boolean };
    if (body.unknown) return;
    const current = watches.get(key);
    if (!current) return;
    // Identity matters: useSyncExternalStore compares snapshots, so handing
    // back a new object for an unchanged status would re-render every watcher
    // three times a minute for nothing.
    //
    // Every rendered field has to be in this comparison, not just the stages.
    // The ETA and the courier's name are drawn on the tracker now, and while
    // this only looked at food and courier a courier being assigned — or an
    // arrival time sliding ten minutes in traffic — was a change the screen
    // was told to ignore. It would have surfaced on the next stage change and
    // looked like a lag, which is the kind of bug that gets blamed on Uber.
    const was = current.status;
    if (
      was?.food === body.food &&
      was?.courier === body.courier &&
      was?.etaAt === body.etaAt &&
      was?.courierName === body.courierName &&
      was?.courierVehicle === body.courierVehicle &&
      was?.courierNear === body.courierNear
    ) {
      return;
    }
    current.status = body;
    announce();
  } catch {
    // Offline, or the shop's till is. Whatever was last known stands, rather
    // than a screen dropping back to a guess mid-wait.
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Start watching, or join a watch already running. Returns the release.
 *
 *  Keyed off the timer, not off whether the watch object exists. Those came
 *  apart in the first cut: releasing keeps the object — deliberately, so
 *  navigating from the strip to the tracker doesn't flash the estimate on the
 *  way — but the old code read a surviving object as "already polling" and
 *  never restarted the interval it had just cleared. One poll on mount, then
 *  silence. A test that watched for 45 seconds is the only reason that was
 *  found; anything shorter looks perfect. */
function hold(key: string): () => void {
  let watch = watches.get(key);
  if (!watch) {
    watch = { status: undefined, timer: null, refs: 0 };
    watches.set(key, watch);
  }
  watch.refs += 1;
  if (watch.timer === null) {
    // Only ask straight away when what we hold is missing or already stale.
    // Re-mounting a screen should not cost a request when the answer arrived
    // two seconds ago.
    if (watch.status === undefined || Date.now() - watch.status.at > POLL_MS) {
      void ask(key);
    }
    watch.timer = window.setInterval(() => void ask(key), POLL_MS);
  }
  return () => {
    const watch = watches.get(key);
    if (!watch) return;
    watch.refs -= 1;
    if (watch.refs > 0) return;
    if (watch.timer !== null) window.clearInterval(watch.timer);
    // The status is kept, not deleted: navigating from the strip to the
    // tracker unmounts one and mounts the other, and dropping what we knew in
    // between would flash the estimate on the way.
    watch.timer = null;
  };
}

/** What the shop and the courier say about this order, or undefined.
 *
 *  Safe to call with no order, with a finished one, or with one placed before
 *  any of this existed: all three are undefined, and every caller already
 *  knows what to do with that, because it is all they ever had. */
export function useLiveStatus(order: PlacedOrder | undefined): LiveStatus | undefined {
  const key = keyOf(order);
  // Stable across renders, or React unsubscribes and resubscribes on every
  // one of them — and this component re-renders every fifteen seconds by
  // design, to creep the bar. An inline arrow here tore the watch down and
  // rebuilt it four times a minute.
  const watch = useCallback(
    (listener: () => void) => {
      if (key === null) return subscribe(listener);
      const release = hold(key);
      const unsubscribe = subscribe(listener);
      return () => {
        unsubscribe();
        release();
      };
    },
    [key],
  );
  return useSyncExternalStore(
    watch,
    () => (key === null ? undefined : watches.get(key)?.status),
    // The server has no idea and must not pretend to: it renders the estimate,
    // and the browser catches up on the first poll.
    () => undefined,
  );
}
