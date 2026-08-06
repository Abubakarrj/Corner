"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_CHANGED_EVENT,
  LOCALE_STORAGE_KEY,
  localeById,
  type LocaleId,
} from "../localeScript";
import { en, type StringKey, type Table } from "./en";
import { es } from "./es";
import { ko } from "./ko";
import { ur } from "./ur";
import { ja } from "./ja";
import { zh } from "./zh";
import { my } from "./my";

export type { StringKey };

const TABLES: Record<LocaleId, Table> = { en, es, ko, ur, ja, zh, my };

// The chosen language, and the function that looks a string up in it.
//
// The same external-store shape as the theme and the cart, and for the same
// reason: localStorage is a synchronous store outside React, and reading it in
// an effect means one render with the wrong answer. getServerSnapshot reports
// English, which is what the markup is rendered against, and the head script
// in localeScript.ts has already set lang and dir before any of this runs.

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

// The values a string can be given, as in t("finder.about", { name: "Koreatown" }).
export type Vars = Record<string, string | number>;

// Substitution is {name}, not string concatenation, and that is the whole
// reason it exists. A sentence assembled from fragments in code assumes
// English word order: "{name} is {miles} miles away" has the distance before
// the shop in some languages and after it in others, and a translator who has
// the whole sentence can move the pieces. One who is handed three fragments
// cannot.
function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole,
  );
}

// Falls back to English for any key a language hasn't been given yet, which is
// what makes shipping a translation possible one screen at a time: a missing
// string is an English word in the right place, not a blank or a key name.
export function translate(locale: LocaleId, key: StringKey, vars?: Vars): string {
  return fill(TABLES[locale]?.[key] ?? en[key] ?? key, vars);
}

// The hook every component uses: `const t = useT();` then `t("finder.pickup")`.
export function useT(): (key: StringKey, vars?: Vars) => string {
  const locale = useLocale();
  return (key, vars) => translate(locale, key, vars);
}
