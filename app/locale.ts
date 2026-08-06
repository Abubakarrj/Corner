"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_CHANGED_EVENT,
  LOCALE_STORAGE_KEY,
  localeById,
  type LocaleId,
} from "./localeScript";
import { STRINGS, type StringKey } from "./strings";

// The chosen language, and the function that looks a string up in it.
//
// The same external-store shape as the theme and the cart, and for the same
// reason: localStorage is a synchronous store outside React, and reading it in
// an effect means one render with the wrong answer. getServerSnapshot reports
// English, which is what the markup is rendered against, and the head script
// in localeScript.ts has already set lang and dir before any of this runs.
//
// This module records and reads the preference. What it *means* for layout,
// the lang attribute and the text direction, belongs to that script, so a
// language set here and one restored on the next load can't disagree.

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener(LOCALE_CHANGED_EVENT, callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener(LOCALE_CHANGED_EVENT, callback);
  };
}

function read(): LocaleId {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored) return localeById(stored).id;
    // No stored choice: match the browser's languages, exactly as the head
    // script does. Both have to agree or the first hydration would swap the
    // language out from under a visitor who never chose one.
    for (const candidate of navigator.languages ?? [navigator.language]) {
      const lower = String(candidate).toLowerCase();
      const exact = localeById(lower.split("-")[0]);
      if (exact.id !== DEFAULT_LOCALE || lower.startsWith("en")) return exact.id;
    }
  } catch {
    // Private browsing, or no navigator. English.
  }
  return DEFAULT_LOCALE;
}

function serverSnapshot(): LocaleId {
  return DEFAULT_LOCALE;
}

export function useLocale(): LocaleId {
  return useSyncExternalStore(subscribe, read, serverSnapshot);
}

export function setLocale(id: LocaleId) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, id);
  } catch {
    // Nothing to do. The event still fires, so the current page follows even
    // when the choice can't be remembered.
  }
  window.dispatchEvent(new Event(LOCALE_CHANGED_EVENT));
  listeners.forEach((listener) => listener());
}

// The lookup.
//
// Falls back to English for any key a language hasn't been given yet, which is
// what makes shipping a translation possible one screen at a time: a missing
// string is an English word in the right place, not a blank or a key name.
export function translate(locale: LocaleId, key: StringKey): string {
  return STRINGS[locale]?.[key] ?? STRINGS.en[key] ?? key;
}

// The hook every component uses: `const t = useT();` then `t("finder.pickup")`.
export function useT(): (key: StringKey) => string {
  const locale = useLocale();
  return (key: StringKey) => translate(locale, key);
}
