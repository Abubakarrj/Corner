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
// Cached for the same reason the locale store is — see the note there.
// getSnapshot runs on every render of every subscriber, so reading
// localStorage inside it makes the cost of a render scale with how many
// components are on the page.
const listeners = new Set<() => void>();
let preference: ThemePreference = "system";
let listening = false;

function refresh() {
  const next = readPreference();
  if (next === preference) return;
  preference = next;
  listeners.forEach((listener) => listener());
}

function subscribe(callback: () => void) {
  if (!listening) {
    listening = true;
    preference = readPreference();
    window.addEventListener(THEME_CHANGED_EVENT, refresh);
    window.addEventListener("storage", (event) => {
      if (event.key === null || event.key === THEME_STORAGE_KEY) refresh();
    });
  }
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getPreference(): ThemePreference {
  return preference;
}

function getServerSnapshot(): ThemePreference {
  return "system";
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, getPreference, getServerSnapshot);
}

// What the preference actually resolved to, which is the question anything
// outside CSS has to ask. A custom property answers it for anything styled by
// a stylesheet, but a map basemap is styled in JavaScript: you can't hand
// Google Maps `var(--cb-cream)` and expect a dark basemap back, so this reads
// the attribute the head script stamped.
//
// Subscribed to the same event, so flipping the switch or the phone flipping
// itself at sunset both reach it.
function readResolved(): "light" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

function subscribeResolved(callback: () => void) {
  const unsubscribe = subscribe(callback);
  // The head script writes data-theme in response to the system query as well
  // as our event, and that path fires no event of its own — so watch the
  // attribute too rather than trusting one of the two routes.
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => {
    unsubscribe();
    observer.disconnect();
  };
}

export function useResolvedTheme(): "light" | "dark" {
  return useSyncExternalStore(subscribeResolved, readResolved, () => "light");
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
  refresh();
}
