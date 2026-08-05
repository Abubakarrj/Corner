"use client";

import { useSyncExternalStore } from "react";
import { THEME_CHANGED_EVENT, THEME_STORAGE_KEY } from "./themeScript";

// Light or dark, chosen or inherited.
//
// Phones switch appearance on a schedule, so following the system is the
// right default and stays the default. But "follow the system" is not the
// same as "no opinion": people read in bed on a phone that hasn't flipped
// yet, and people who like a dark phone don't necessarily want a dark menu.
// So there are three states, and the third one is the default.
//
// This module only ever records the preference. What it resolves to, and the
// attribute that carries it, belong to the script in themeScript.ts — one
// implementation, so a preference set here and a preference restored on the
// next load can't disagree.
export type ThemePreference = "light" | "dark" | "system";

export const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

function readPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

// The same external-store shape the cart and the cookie banner use, and for
// the same reason: localStorage is a synchronous store outside React, and
// reading it in an effect means a render with the wrong answer first.
// getServerSnapshot reports "system", which is what the markup is rendered
// against.
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener(THEME_CHANGED_EVENT, callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener(THEME_CHANGED_EVENT, callback);
  };
}

function getServerSnapshot(): ThemePreference {
  return "system";
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, readPreference, getServerSnapshot);
}

export function setThemePreference(next: ThemePreference) {
  try {
    if (next === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Nothing to persist to. The switch still works for this visit — the
    // event below applies it — it just won't be remembered.
  }
  window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
  listeners.forEach((listener) => listener());
}
