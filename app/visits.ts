"use client";

import { useEffect } from "react";

// How many times this device has been to the site.
//
// ——— What a "visit" is ———
//
// Not a page load, and not a route change. Somebody who lands on the map,
// opens a shop, reads About and comes back has made one visit, and counting
// four would make a first-time visitor look like a regular within a minute.
//
// So a visit is a session: the first load, and then any load after a gap long
// enough that the person has plainly been away. Thirty minutes, which is the
// convention analytics tools settled on for the same reason — long enough to
// cover a phone locked on the bus, short enough that this evening is not this
// morning.
//
// Decided by the gap and nothing else. A first version also kept a marker in
// sessionStorage, on the reasoning that a marker surviving inside a tab is a
// cheap way to say "same visit" — and it was wrong in both directions: a tab
// left open for three hours and come back to still had its marker and counted
// as one long visit, while a tab closed and reopened two minutes later had
// lost it and counted as two. The clock answers both correctly on its own, so
// the marker went.
//
// ——— Why this exists ———
//
// The drop-list modal asks for an email, and it should not ask somebody who
// has been here for eleven seconds and does not yet know what the shop is.
// "Have they been here before" is the cheapest honest signal that they might
// want to hear from us, and it is the one the modal now waits for.
//
// Deliberately not tied to an account or a cookie the server reads. It is one
// number on the device, it is never sent anywhere, and clearing site data
// resets it, which is the correct behaviour for something that only decides
// whether to show a marketing pop-up.

const KEY = "cb-visits-v1";

/** How long away counts as having left. */
const NEW_VISIT_AFTER_MS = 30 * 60 * 1000;

type Visits = { count: number; first: number; last: number };

function read(): Visits | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Visits>;
    if (
      typeof parsed.count === "number" &&
      typeof parsed.first === "number" &&
      typeof parsed.last === "number"
    ) {
      return parsed as Visits;
    }
    return null;
  } catch {
    // Private mode, a full quota, storage switched off. Everything below
    // treats "cannot tell" as "first visit", which is the cautious answer for
    // a caller deciding whether to interrupt somebody.
    return null;
  }
}

/** Count this load, if it starts a visit rather than continuing one.
 *
 *  Safe to call as often as you like. Every load inside a visit pushes `last`
 *  forward, so the gap is measured from the most recent sign of life rather
 *  than from when the visit began. */
export function noteVisit(): void {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const stored = read();
    if (!stored) {
      window.localStorage.setItem(KEY, JSON.stringify({ count: 1, first: now, last: now }));
      return;
    }
    const continuing = now - stored.last < NEW_VISIT_AFTER_MS;
    const next: Visits = {
      count: continuing ? stored.count : stored.count + 1,
      first: stored.first,
      last: now,
    };
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // See read(): a device that will not remember is treated as new every
    // time, which errs toward not interrupting.
  }
}

/** How many visits this device has made, counting the one in progress. */
export function visitCount(): number {
  if (typeof window === "undefined") return 0;
  return read()?.count ?? 0;
}

/** True once somebody has come back.
 *
 *  The visit in progress is counted, so this is false for the whole of a first
 *  visit however long it lasts, and true from the first moment of the second. */
export function isReturning(): boolean {
  return visitCount() >= 2;
}

/** Counts the visit. Mounted once, in the root layout, so it sees a landing on
 *  any route rather than only the ones a particular tree covers. Renders
 *  nothing. */
export default function VisitLog() {
  useEffect(() => {
    noteVisit();
  }, []);
  return null;
}
