import { useSyncExternalStore } from "react";
import { emptyApplication, normalizeApplication, type Application } from "./application";

// A half-finished application, kept on the device.
//
// The form is four steps and several minutes of typing, and until it's sent
// none of it exists anywhere. A dropped connection, a closed tab, iOS
// reclaiming the page while somebody takes a phone call — any of those used to
// cost the whole thing, silently, with no way back. That is the worst failure
// this form can have, because the person it happens to is the one who was
// trying hardest.
//
// ——— Where it lives, and why not the server ———
//
// localStorage, on their device, not a draft table of ours. A server-side
// draft would mean holding somebody's name, phone number and written answers
// before they have decided to send them to us — collecting an application from
// somebody who never applied. The device keeps it until they finish or a week
// goes by.
//
// ——— The week ———
//
// A draft is personal data sitting in a browser that might be a library
// computer or a shared family tablet. It is not something to keep forever
// because it was cheap to keep. Seven days is long enough to come back to it
// after a weekend and short enough that a forgotten one clears itself.

const KEY = "cb-application-draft-v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type Draft = { step: number; application: Application };

type Stored = { savedAt: number; step: number; application: unknown };

/** One blank row of each list, matching a form that has never been filled in.
    Restoring a draft that had no schools would otherwise show an "add" button
    over nothing, which reads as a section that has gone missing. */
export function withStarterRows(application: Application): Application {
  return {
    ...application,
    education: application.education.length
      ? application.education
      : [{ school: "", focus: "", finished: "" }],
    employment: application.employment.length
      ? application.employment
      : [{ employer: "", role: "", from: "", to: "" }],
    references: application.references.length
      ? application.references
      : [{ name: "", relationship: "", contact: "" }],
  };
}

export function freshApplication(): Application {
  return withStarterRows(emptyApplication());
}

/** Whatever was saved, or null. Never throws: a corrupt or half-written value
    is a draft we don't have, not a page that won't load.

    The stored application goes back through normalizeApplication — the same
    function that guards the endpoint. Anything hand-edited into localStorage,
    or left over from a version of the form with different fields, is trimmed,
    capped and filtered by exactly the rules the server would apply. */
export function loadDraft(): Draft | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const stored = JSON.parse(raw) as Stored;
    if (typeof stored?.savedAt !== "number" || Date.now() - stored.savedAt > MAX_AGE_MS) {
      clearDraft();
      return null;
    }
    const application = withStarterRows(normalizeApplication(stored.application));
    const step = typeof stored.step === "number" ? Math.min(Math.max(stored.step, 0), 3) : 0;
    return { step, application };
  } catch {
    clearDraft();
    return null;
  }
}

/** True when it actually stuck. The caller needs to know, because whether
    walking away from the form is safe or costs everything turns on it. */
export function saveDraft(draft: Draft): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored: Stored = { savedAt: Date.now(), step: draft.step, application: draft.application };
    window.localStorage.setItem(KEY, JSON.stringify(stored));
    return true;
  } catch {
    // Private mode, a full quota, storage switched off. The form keeps working;
    // it just stops being recoverable, which is where it started.
    return false;
  }
}

export function clearDraft(): void {
  cached = null;
  notify();
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do, and nothing that depends on it.
  }
}

// ——— Reading it into React ———
//
// Through useSyncExternalStore, the same way the locale and the theme are
// read, and for the same reason: localStorage does not exist on the server, so
// state seeded from it during render means the server sends an empty form and
// the browser draws a full one — a hydration mismatch across every field at
// once. The hook is built for exactly this. It renders the server's answer
// (no draft), then swaps to the browser's once hydration is done.
//
// The snapshot is cached at module level because useSyncExternalStore compares
// by identity: parsing localStorage afresh on every call would hand React a
// new object each time and spin forever.

let cached: Draft | null | undefined;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Draft | null {
  if (cached === undefined) cached = loadDraft();
  return cached;
}

function getServerSnapshot(): Draft | null {
  return null;
}

/** The draft found when the page opened, or null. Saving does not update this
    — once somebody starts typing, the form's own state is the truth and this
    is only the seed. Clearing it does, so "start over" takes the banner with
    it. */
export function useSavedDraft(): Draft | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// A single shared value for "nothing filled in yet". A function returning a
// fresh object would hand every render a new identity, which turns every memo
// and every effect keyed on the application into one that fires constantly —
// including the one that writes the draft.
export const FRESH: Draft = { step: 0, application: freshApplication() };

/** Is there anything worth saving? Also what decides whether leaving the page
    asks first. */
export function started(application: Application): boolean {
  return Object.values(application).some((value) => {
    if (typeof value === "string") return value.trim() !== "";
    if (typeof value === "boolean") return true;
    if (Array.isArray(value)) {
      return value.some((entry) =>
        // A row of a school or a job counts only if something was typed into
        // it, since each list starts with one blank. An id in positions, days
        // or employmentTypes is itself the answer.
        typeof entry === "object" && entry !== null
          ? Object.values(entry).some((cell) => String(cell).trim() !== "")
          : true,
      );
    }
    return false;
  });
}
