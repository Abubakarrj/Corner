"use client";

// The open / close class dance the transitions.dev dropdown and modal
// snippets document, as one function.
//
// ——— Why this is imperative and not React state ———
//
// Both snippets want three states on one element: at rest, `.is-open`, and
// `.is-closing` — the last held for exactly the close duration so the surface
// animates out before it snaps back to its pre-open scale. The skill's own
// orchestration does that with classList and a setTimeout, and doing it in
// React state instead would mean a setState inside an effect on every open and
// every close, which this codebase's lint rule refuses on sight and which buys
// nothing: nothing renders differently, a class is just present or absent.
//
// It is safe to write classes on a node React also renders *only* because the
// elements this is used on carry a constant className. React rewrites
// className wholesale when the prop changes, which would take `.is-open` with
// it — so if a caller ever makes that class list dynamic, this stops working
// and the surface will flicker rather than fail loudly. Worth knowing before
// adding a conditional class to a modal panel.
//
// ——— Reading the duration from CSS ———
//
// The timeout has to match the CSS, and the CSS is the source of truth: the
// duration lives in :root as --dropdown-close-dur / --modal-close-dur, so it
// is read from there rather than typed here a second time. A tuning change in
// globals.css then moves both halves at once, which is the whole point of the
// token.

// ⚠️ The unit has to be read, not assumed.
//
// globals.css says `--dropdown-close-dur: 150ms`. The compiled stylesheet says
// `.15s`, because the minifier rewrites time values into whichever unit is
// shorter. A parseFloat that ignores the suffix therefore returns 150 in
// development and 0.15 in production — and 0.15 as a setTimeout delay is
// "next tick", so every close-state class was being stripped about two
// milliseconds after it was applied. The dropdown snapped from open straight
// to its pre-open scale with no exit at all, and only in the built app.
//
// The reference's own snippet has the same shape, so this is worth knowing
// before copying the next one: `parseFloat(getPropertyValue(...))` is only
// safe if nothing between the source and the browser is allowed to change the
// unit, and a bundler is exactly that.
export function msFrom(variable: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  if (raw.endsWith("ms")) return value;
  if (raw.endsWith("s")) return value * 1000;
  // Unitless: take it at face value rather than guessing a scale.
  return value;
}

/** Drive one `.t-dropdown` / `.t-modal` node from an `open` boolean.
 *
 *  Returns a cleanup for the pending close timer, so it can be returned
 *  straight out of an effect.
 *
 *  `everOpened` keeps a surface that has never been open from playing a
 *  closing animation on mount — every modal in the app is mounted closed, and
 *  without this each one would run its exit once on first paint. */
export function closeAfter(
  node: HTMLElement | null,
  open: boolean,
  everOpened: { current: boolean },
  durationVariable: string,
  fallbackMs: number,
): (() => void) | undefined {
  if (!node) return undefined;

  if (open) {
    node.classList.remove("is-closing");
    node.classList.add("is-open");
    everOpened.current = true;
    return undefined;
  }

  if (!everOpened.current) return undefined;

  node.classList.remove("is-open");
  node.classList.add("is-closing");
  const timer = window.setTimeout(
    () => node.classList.remove("is-closing"),
    msFrom(durationVariable, fallbackMs),
  );
  return () => window.clearTimeout(timer);
}
