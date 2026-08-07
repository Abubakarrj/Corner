"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// How many pages deep into the app this session has gone.
//
// It exists because "go back" is ambiguous in a browser and dangerous in an
// installed one. `window.history.length` counts entries, not *our* entries: a
// tab that was on another site before it reached the shop has a history two
// long, and a back button trusting that walks the visitor out of the app. On a
// phone with browser chrome that is merely rude; installed to the home screen,
// where there is no address bar to notice it with, it is a dead end.
//
// So rather than infer, we count. Every client-side navigation increments
// this, and anything offering a back control asks `canGoBack()` first: true
// means the previous entry is one of ours and history.back() is safe, false
// means offer a destination instead.
//
// Module-level rather than state, deliberately — the whole point is knowing
// about navigations that happened before the component asking about them
// mounted.
let depth = 0;
let seen: string | null = null;

export function canGoBack(): boolean {
  return depth > 0;
}

// Mounted once, in the root layout, so it sees every route in the app rather
// than only the ones under a particular tree. Renders nothing.
export default function NavigationDepth() {
  const pathname = usePathname();

  useEffect(() => {
    // Keyed on the path actually changing rather than on the effect running.
    // Effects run twice under StrictMode and again on any remount, and a
    // counter that believed either of those would report a step back that
    // nobody took — which is the one wrong answer this file exists to avoid.
    if (seen === pathname) return;
    // The first path is where the session started, not somewhere it went.
    if (seen !== null) depth += 1;
    seen = pathname;
  }, [pathname]);

  return null;
}
