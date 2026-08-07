"use client";

// A short buzz when something happens.
//
// ——— Read this before building anything on it ———
//
// This works on Android and it does not work on iPhone. That is not a bug here
// and there is no workaround worth having: `navigator.vibrate` is unimplemented
// in Safari on iOS, Apple has never exposed the Taptic Engine to the web, and
// the tricks that appear to (a hidden `<input type="checkbox" switch>` whose
// toggle Apple *does* buzz) work by pretending a button is a switch, which
// breaks the control for anybody using it with a screen reader or a keyboard.
// Trading a real control for a fake one to get a vibration is a bad trade.
//
// So the rule this file follows: haptics are a *bonus* on the platforms that
// have them, never the feedback itself. Every press has to look like it landed
// without this — see `.cb-press` in globals.css, which is what actually carries
// the job on an iPhone. If you find yourself relying on a buzz to tell somebody
// something worked, the visual is wrong and the buzz is hiding it.
//
// Patterns are short on purpose. A phone buzzing for 100ms in a quiet room is
// a phone somebody turns off; 8ms is the length of a key click.

/** A press landed. The shortest thing the API will do. */
export function tapped() {
  buzz(8);
}

/** Something was added, chosen, applied. A shade more than a press. */
export function confirmed() {
  buzz(14);
}

/** Two beats — an order placed, a card saved. Reserved for the once-a-visit
    things, so it keeps meaning something. */
export function completed() {
  buzz([16, 40, 24]);
}

/** Something was refused: a field that won't pass, a button that can't. */
export function refused() {
  buzz([22, 60, 22]);
}

function buzz(pattern: number | number[]) {
  // Every guard here has fired in the wild at some point. `vibrate` is absent
  // on desktop Safari and iOS, throws inside cross-origin iframes on some
  // Android builds, and is a silent no-op on a page that has never been
  // interacted with — which is fine, but only if it doesn't throw on the way.
  try {
    if (typeof navigator === "undefined") return;
    if (typeof navigator.vibrate !== "function") return;
    // Somebody who has asked their OS to stop things moving has not asked for
    // their phone to buzz instead.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate(pattern);
  } catch {
    // A device that won't buzz is a device that won't buzz.
  }
}
