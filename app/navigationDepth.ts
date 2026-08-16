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
// ——— And some of our entries are spent ———
//
// Counting alone answered "is there one of ours behind this?" and not "is it
// somewhere they should be sent". Ordering is the case that separates them:
// cart, then checkout, then the order is placed. From that moment the two
// screens behind are historical. The basket they described is empty, the
// checkout they filled in has nothing to check out, and going back to either
// is being handed a receipt and then shown the till again.
//
// So a placed order lowers a floor. Everything at or below it is spent, and
// `canGoBack()` says no rather than walking somebody into a screen the app
// has finished with. The floor is a number of steps rather than a list of
// paths on purpose: it does not have to be told which routes are the funnel,
// only when the funnel ended, so a new screen inside checkout is covered by
// existing without anybody remembering to add it.
//
// Module-level rather than state, deliberately — the whole point is knowing
// about navigations that happened before the component asking about them
// mounted.
let depth = 0;
// -1 rather than 0: nothing is spent yet, and index 0 is a real entry
// somebody is allowed to go back to. A floor of 0 would make the very first
// step of every session unreturnable.
let floor = -1;
let replacing = false;
let seen: string | null = null;

/** The rule, as arithmetic, so it can be checked without a browser.
 *
 *  Back from index `depth` lands on `depth - 1`, so what is judged is the
 *  landing place rather than where we are standing. Entries 0 through `floor`
 *  are spent; -1 means none are.
 *
 *  Exported because this is the part that is easy to get subtly wrong, and
 *  every off-by-one in it is a visitor put somewhere they should not be. The
 *  counter around it needs a mounted app to move; this needs nothing. */
export function allowsBack(depth: number, floor: number): boolean {
  return depth > 0 && depth - 1 > floor;
}

/** True when the entry behind this one is ours *and* still worth returning
 *  to. False means offer a destination instead. */
export function canGoBack(): boolean {
  return allowsBack(depth, floor);
}

/** Everything up to here is finished with.
 *
 *  Called when an order is placed. Not on any other kind of success: a
 *  signed-in visitor or a joined member has not passed a point of no return,
 *  and going back to the screen before is a reasonable thing to want. An
 *  order is different because the app has already emptied the basket the
 *  previous screen was about. */
export function closeFunnel(): void {
  floor = depth;
}

/** The next path change replaces the current entry rather than adding one.
 *
 *  Without this the counter treats a replace as a step deeper, and the entry
 *  it thinks is behind us is one that no longer exists. Anything calling
 *  router.replace() should say so here first; BackButton is the one that
 *  matters, because it replaces precisely when it is stepping off a spent
 *  screen and must not leave the count believing that screen is still there. */
export function replacingEntry(): void {
  replacing = true;
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
    // A replace swaps the entry we are on, so it is not a step either.
    if (seen !== null && !replacing) depth += 1;
    replacing = false;
    seen = pathname;
  }, [pathname]);

  return null;
}
