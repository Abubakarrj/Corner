"use client";

// A way to open the drop-list modal on purpose.
//
// ——— Why this exists ———
//
// Everything about when that modal appears is designed to protect somebody who
// does not want it: never on a first visit, only on four routes, only after a
// dwell, and a growing cooldown once it has been closed. All of that is right,
// and all of it is about the person saying no.
//
// It left the person saying yes with nothing. The pop-up was the only door, so
// somebody who closed it once and thought better of it, or who was on the
// finder where it never opens, or who was on their first visit, had no way to
// join at all — however much they wanted to. Rules written to stop a modal
// being a nuisance had quietly become rules about who is allowed on the list.
//
// So the modal keeps every one of those rules for the times it decides to ask,
// and this opens it when somebody asks for it. A deliberate open answers to
// nothing: no dwell, no cooldown, no route check, no visit count, and no
// consent gate — the banner is there so an interruption cannot pile on top of
// it, and a tap is not an interruption.
//
// Same shape as subscribeConsentChanged in CookieConsent.tsx, and for the same
// reason: one component owns the state, several places need to poke it, and a
// context provider around the whole app would be a lot of machinery for a
// single boolean.

type Listener = () => void;

const listeners = new Set<Listener>();

/** Open the drop-list modal now, wherever it is mounted.
 *
 *  A no-op on a route that does not mount it — the marketing layout does, and
 *  /shop deliberately does not. Callers do not have to know which they are on. */
export function openDropList(): void {
  for (const listener of [...listeners]) listener();
}

export function subscribeOpenDropList(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
