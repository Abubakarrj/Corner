"use client";

import { useEffect } from "react";
import { primeHaptics, tappedUnlessBusy } from "./haptics";

// One listener, every control.
//
// The haptic used to live on the `Button` component's onClick, which covered
// twelve files and missed the rest — the catalog tiles, the category strip, the
// quantity steppers, the chat's chips and tabs, the option pickers, and (the
// one that gave the game away) "Add to basket" on a product page, which is a
// raw <button>. So most of the app was silent and it looked like the mechanism
// was broken rather than the wiring.
//
// Per-component wiring was the wrong shape for this anyway. A haptic on press
// isn't a property of one component, it is a property of *being pressed*, and
// anything that has to be remembered on every new button will eventually be
// forgotten on one. Delegation can't be forgotten.
//
// ——— Why click and not pointerdown ———
//
// pointerdown is earlier and would feel snappier, and it is wrong here: a
// finger landing on a button and then dragging is a scroll, not a press, and
// firing on contact means the phone buzzes every time somebody flicks a list
// that happens to have buttons in it. A click only exists once the press
// completed on the element it started on. That is the event that means "they
// pressed this".
//
// ——— Why the bubble phase, on document ———
//
// React attaches its own handlers at the app root, which is inside document, so
// by the time the event bubbles this far every onClick has run. That ordering
// is what makes the coalescing in tappedUnlessBusy work: adding to the basket
// has already fired its own, stronger buzz, and this one stands down instead of
// arriving on top of it.
const INTERACTIVE =
  'button, a[href], [role="button"], [role="tab"], [role="switch"], summary, ' +
  'input[type="checkbox"], input[type="radio"], label[for], select';

export default function PressHaptics() {
  useEffect(() => {
    // Build the hidden switch now. See primeHaptics: a control Safari has not
    // laid out yet plays nothing, so creating it on the first press means
    // losing the first press.
    primeHaptics();

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      // Our own hidden switch, clicked by the haptics module itself. Without
      // this it would bubble up here, buzz, toggle again and buzz again, which
      // is a loop that ends when the phone runs out of battery.
      if (target.closest("#cb-haptic-switch, [data-cb-haptic-sidecar]")) return;

      const control = target.closest(INTERACTIVE);
      if (!control) return;
      // Nothing happened, so nothing should say it did.
      if (control.matches(":disabled, [aria-disabled='true']")) return;
      // An escape hatch for anything that shouldn't buzz — a control pressed
      // repeatedly in a row, or one inside a scrolling surface.
      if (control.closest("[data-no-haptic]")) return;

      tappedUnlessBusy();
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
