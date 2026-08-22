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

// ——— ⚠️ One poll for the whole browser, not one per tab ———
//
// The store above already collapses four components in a tab down to one
// request. Two tabs were still two requests, three were three — and behind each
// one is a read of Toast and a read of Uber, which are somebody's rate limit
// and somebody's bill. Somebody with the tracker open on one tab and the menu
// on another is the ordinary case, not a strange one.
//
// So a tab about to poll takes a lock first, and once inside it checks whether
// another tab has already fetched the answer in the last few seconds. If it
// has, this tab adopts it and makes no request.
//
// ⚠️ The failure mode is the thing that mattered in choosing this shape. A
// leader-election design — one tab polls, the others wait to be told — is the
// obvious use of a lock, and its failure mode is a tracker that goes silent
// because the tab holding the lock is asleep. This one cannot go silent: every
// tab still runs its own timer and still fetches when the shared answer is
// stale, so the worst case is exactly the behaviour this file had before, which
// is a tab polling on its own.
//
// Web Locks is absent in older Safari. There, withPollLock runs the work
// straight through and every tab polls, which again is what it did before.
const SHARED_KEY = "cb-live-v1";
/** How fresh another tab's answer has to be for this tab to skip its own
 *  request. Three quarters of the interval: long enough that two tabs on the
 *  same heartbeat share one fetch, short enough that nothing is ever served an
 *  answer older than the interval it asked for. */
const SHARE_MS = POLL_MS * 0.75;

/** ⚠️ Two timestamps, and they are not interchangeable.
 *
 *  `status.at` is when the *provider* last said something, stamped by the
 *  server — see app/orderStatus.ts. `sharedAt` is when this browser wrote the
 *  entry, by its own clock.
 *
 *  The freshness gate has to use the second. Comparing a server timestamp
 *  against Date.now() is comparing two clocks, and a phone a minute out of step
 *  would either fetch every time or trust an answer well past its interval.
 *  Both tabs reading this share one clock, so `sharedAt` is exact. */
type Shared = Record<string, { status: LiveStatus; sharedAt: number }>;

function readShared(): Shared {
  try {
    const raw = window.localStorage.getItem(SHARED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    // ⚠️ Checked rather than cast: this is a string another script on the
    // origin could have written, and it is read on the path that decides what
    // a customer is told about their order.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Shared;
  } catch {
    return {};
  }
}

function writeShared(key: string, status: LiveStatus): void {
  try {
    // ⚠️ Only the keys still being watched are kept. Without the filter this
    // grows an entry per order for the life of the browser, and the thing it
    // accumulates is a record of what somebody ordered and when.
    const next: Shared = {};
    for (const [id, value] of Object.entries(readShared())) {
      if (watches.has(id)) next[id] = value;
    }
    next[key] = { status, sharedAt: Date.now() };
    window.localStorage.setItem(SHARED_KEY, JSON.stringify(next));
  } catch {
    // Private browsing, or storage turned off. Every tab polls on its own,
    // which is what this file did before the lock existed.
  }
}

/** Run `work` with nobody else in the browser doing the same, if the browser
 *  can arrange that. Where it cannot, run it anyway. */
async function withPollLock(key: string, work: () => Promise<void>): Promise<void> {
  const locks = (navigator as Navigator & {
    locks?: { request: (name: string, fn: () => Promise<void>) => Promise<void> };
  }).locks;
  if (!locks) {
    await work();
    return;
  }
  try {
    await locks.request(`${SHARED_KEY}:${key}`, work);
  } catch {
    // A lock that could not be taken is not a reason to leave somebody staring
    // at a stale tracker.
    await work();
  }
}

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

/** Take another tab's answer instead of asking for our own, when it is recent
 *  enough. Returns whether this tab can skip its request. */
function adopt(key: string, entry: Shared[string] | undefined): boolean {
  if (!entry || typeof entry.sharedAt !== "number" || !entry.status) return false;
  // ⚠️ A clock that has gone backwards — a phone correcting itself, a laptop
  // waking — would make every entry look like it came from the future and
  // never expire. Treated as stale rather than trusted.
  const age = Date.now() - entry.sharedAt;
  if (age < 0 || age > SHARE_MS) return false;
  const watch = watches.get(key);
  if (!watch) return false;
  // Someone else has asked recently, so this tab does not need to — whether or
  // not what they found is newer than what we hold.
  if (!watch.status || (entry.status.at ?? 0) > watch.status.at) {
    watch.status = entry.status;
    announce();
  }
  return true;
}

async function ask(key: string): Promise<void> {
  const watch = watches.get(key);
  if (!watch) return;
  // Somebody else may have just asked. Checked before the lock as well as
  // inside it, so the common case costs a localStorage read rather than a
  // round trip through the lock manager.
  if (adopt(key, readShared()[key])) return;
  await withPollLock(key, () => fetchStatus(key));
}

async function fetchStatus(key: string): Promise<void> {
  const watch = watches.get(key);
  if (!watch) return;
  // ⚠️ Again, inside the lock. Whoever was holding it when we started waiting
  // was very likely fetching the answer we are about to ask for.
  if (adopt(key, readShared()[key])) return;
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
      was?.courierNear === body.courierNear &&
      was?.courierPhone === body.courierPhone &&
      was?.deadlineAt === body.deadlineAt
    ) {
      // ⚠️ Unchanged, so no re-render — but still published. The other tabs
      // are skipping their request on the strength of *when* somebody last
      // asked, not on what came back, and an answer that keeps coming back the
      // same is exactly the case where sharing it saves the most.
      //
      // `body` rather than `was`: they are equal on every field compared
      // above, and `was` is only optional to the compiler — the branch cannot
      // be reached with it unset, since every comparison would be undefined
      // against a value.
      writeShared(key, body);
      return;
    }
    current.status = body;
    announce();
    // Published for the other tabs, inside the lock, so the next one along
    // finds it rather than asking again.
    writeShared(key, body);
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
