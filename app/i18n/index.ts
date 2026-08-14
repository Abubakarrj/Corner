"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_CHANGED_EVENT,
  LOCALE_STORAGE_KEY,
  localeById,
  type LocaleId,
} from "../localeScript";
import { en } from "./en";
// The tables and the lookup live in a module with no "use client" on it, so
// the chat route can use them too. See the note at the top of strings.ts.
import { translate, type StringKey, type Vars } from "./strings";

export type { StringKey, Vars };
export { translate };

// The chosen language, and the function that looks a string up in it.
//
// The same external-store shape as the theme and the cart, and for the same
// reason: localStorage is a synchronous store outside React, and reading it in
// an effect means one render with the wrong answer. getServerSnapshot reports
// English, which is what the markup is rendered against, and the head script
// in localeScript.ts has already set lang and dir before any of this runs.

const listeners = new Set<() => void>();

// The chosen language, cached.
//
// This used to read localStorage inside getSnapshot, which React calls on
// *every render of every subscriber* — and every translated component is a
// subscriber. Measured on /shop: one language switch did 307 synchronous
// localStorage reads and took 75ms, which is the lag you feel when you tap
// the picker. localStorage is synchronous and on the main thread; reading it
// once per component per render is a cost that scales with the size of the
// page, and /shop renders 27 product cards.
//
// So the store keeps the answer and only re-reads when something says it
// changed — which is the shape the cart, the account and the fulfillment
// stores already used. getSnapshot is now a property read.
let snapshot: LocaleId = DEFAULT_LOCALE;
let listening = false;

function refresh() {
  const next = read();
  if (next === snapshot) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(callback: () => void) {
  // The window listeners are attached once for the store, not once per
  // subscriber: with the old shape, N components meant N handlers each
  // triggering its own re-read of the same key.
  if (!listening) {
    listening = true;
    snapshot = read();
    window.addEventListener(LOCALE_CHANGED_EVENT, refresh);
    // Another tab choosing a language. `storage` only fires in the tabs that
    // didn't make the change, which is exactly the case the event above
    // misses.
    window.addEventListener("storage", (event) => {
      if (event.key === null || event.key === LOCALE_STORAGE_KEY) refresh();
    });
  }
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function read(): LocaleId {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored) return localeById(stored).id;
    // No stored choice: match the browser's languages, exactly as the head
    // script does. Both have to agree, or the first hydration would swap the
    // language out from under a visitor who never chose one.
    for (const candidate of navigator.languages ?? [navigator.language]) {
      const base = String(candidate).toLowerCase().split("-")[0];
      const match = localeById(base);
      if (match.id === base) return match.id;
    }
  } catch {
    // Private browsing, or no navigator. English.
  }
  return DEFAULT_LOCALE;
}

function serverSnapshot(): LocaleId {
  return DEFAULT_LOCALE;
}

function getSnapshot(): LocaleId {
  return snapshot;
}

export function useLocale(): LocaleId {
  return useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
}

export function setLocale(id: LocaleId) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, id);
  } catch {
    // Nothing to do. The event still fires, so the current page follows even
    // when the choice can't be remembered.
  }
  window.dispatchEvent(new Event(LOCALE_CHANGED_EVENT));
  // refresh() rather than notifying directly: it re-reads and compares, so
  // setting the language it is already on doesn't re-render the app.
  refresh();
}

// The hook every component uses: `const t = useT();` then `t("finder.pickup")`.
// Memoised on the locale, so `t` is the same function between renders.
//
// It's cheap to build, so this isn't about allocation — it's that an unstable
// `t` is a landmine in a dependency array. The checkout's courier quote once
// re-fired on every keystroke because `t` was in its deps and `t` was new
// every render. Stable by construction removes the whole class.
export function useT(): (key: StringKey, vars?: Vars) => string {
  const locale = useLocale();
  return useMemo(() => (key, vars) => translate(locale, key, vars), [locale]);
}

// "wheat, dairy and egg" in whichever language is on.
//
// Intl.ListFormat rather than a joiner of our own, because the rule is not a
// separator: Japanese and Chinese use their own comma, Korean's conjunction
// changes with the last sound of the word before it, and Urdu reads the other
// way. The platform ships the CLDR data for all of that; a hand-rolled
// `join(", ") + " and "` would be English wearing a translation.
//
// Wrapped in a try because a locale ICU doesn't know throws rather than
// falling back, and an allergen list is the last thing that should be able to
// take a page down.
export function listOf(locale: LocaleId, items: string[]): string {
  if (items.length <= 1) return items.join("");
  try {
    return new Intl.ListFormat(localeById(locale).tag, {
      style: "long",
      type: "conjunction",
    }).format(items);
  } catch {
    return items.join(", ");
  }
}

// An error that came back from one of our own API routes.
//
// The routes have no locale — they answer a fetch, not a person — so the ones
// that reject a request send the *key* of the sentence rather than the
// sentence: `{ error: "gift.errPickDate" }`. This turns that back into words
// in whichever language is on.
//
// Anything that isn't a key it knows is passed through untouched, which is
// what keeps this safe to wrap around every error the app can show: a message
// from somewhere else (a third-party API, an exception) still reaches the
// screen as itself rather than disappearing.
export function serverText(locale: LocaleId, message: string | null | undefined): string {
  if (!message) return "";
  return message in en ? translate(locale, message as StringKey) : message;
}

export function useServerText(): (message: string | null | undefined) => string {
  const locale = useLocale();
  return useMemo(() => (message) => serverText(locale, message), [locale]);
}

export function useList(): (items: string[]) => string {
  const locale = useLocale();
  return useMemo(() => (items) => listOf(locale, items), [locale]);
}
