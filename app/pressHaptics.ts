"use client";

import { useEffect } from "react";
import { hapticCount, primeHaptics, tapped } from "./haptics";

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
// ——— Why two listeners for one event ———
//
// Some presses do something that has its own, stronger buzz: adding to the
// basket, placing an order, a submit that gets refused. Those fire from a React
// handler, and the generic tap has to stand down for them or both arrive
// together as a rattle.
//
// Knowing whether that happened is a question about *this click*, so it's
// answered by bracketing it. The capture listener runs before React's handlers
// and notes the haptic count; the bubble listener runs after them and compares.
// Same count, nothing else buzzed, so tap. Different, something already did.
//
// It replaced a 300ms "has anything buzzed recently" window, which failed on
// exactly the control you'd notice it on: three quick taps on a quantity
// stepper buzzed once, because presses two and three landed inside the window
// press one had opened. A counter compared across one event has no window to
// fall inside.
// ——— What is deliberately NOT in this list ———
//
// Anything whose press opens native UI. <select> was in here and it broke the
// bagel picker on iOS: tapping a select opens a picker sheet, and this fires
// label.click() on the hidden switch during that same click, then again 40ms
// later while the sheet is animating in. A synthetic click on a <label for>
// moves focus, and the sheet goes straight back down. From the counter it
// looks like the dropdown is dead — which is exactly how it was reported.
//
// It only happens on a real iPhone. An emulator has no native sheet to
// dismiss, so every automated check passed while the thing was broken.
//
// No haptic on a select at all rather than moving it to `change`: on iOS the
// wheel picker can fire change per detent, and a phone that buzzes six times
// while somebody scrolls to "Sesame" is worse than one that doesn't buzz. If
// it's wanted later it needs testing on a device first.
//
// Same reasoning applies to anything else that opens system UI — file, date,
// time and color inputs. None of them match the selector below, and none of
// them should be added to it.
const INTERACTIVE =
  'button, a[href], [role="button"], [role="tab"], [role="switch"], summary, ' +
  'input[type="checkbox"], input[type="radio"], label[for], ' +
  // The app's own marker for "this is pressable", which catches anything
  // styled as a control without being a <button> — see .cb-press in globals.css.
  ".cb-press";

// A press that lands inside one of these is a press on native UI, whatever
// else it also matched. `label[for]` pointing at a select is the case that
// gets here — the label forwards the click to the control, and the control
// opens a sheet.
const OPENS_NATIVE_UI = 'select, input[type="file"], input[type="date"], ' +
  'input[type="time"], input[type="datetime-local"], input[type="month"], ' +
  'input[type="week"], input[type="color"]';

export default function PressHaptics() {
  useEffect(() => {
    // Build the hidden switch now. See primeHaptics: a control Safari has not
    // laid out yet plays nothing, so creating it on the first press means
    // losing the first press.
    primeHaptics();

    let before = hapticCount();
    const onCapture = () => {
      before = hapticCount();
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      // Our own hidden switch, clicked by the haptics module itself. Without
      // this it would bubble up here, buzz, toggle again and buzz again, which
      // is a loop that ends when the phone runs out of battery.
      if (target.closest("#cb-haptic-switch, [data-cb-haptic-sidecar]")) return;

      // Before anything else: never touch a press that is opening system UI.
      // See OPENS_NATIVE_UI — clicking our hidden switch mid-sheet closes it.
      if (target.closest(OPENS_NATIVE_UI)) return;

      const control = target.closest(INTERACTIVE);
      if (!control) return;
      // A label whose control opens a sheet is the same press by another name.
      const forId = control.getAttribute("for");
      if (forId && document.getElementById(forId)?.matches(OPENS_NATIVE_UI)) return;
      // Nothing happened, so nothing should say it did.
      if (control.matches(":disabled, [aria-disabled='true']")) return;
      // An escape hatch for anything that shouldn't buzz.
      if (control.closest("[data-no-haptic]")) return;
      // Something with its own, stronger buzz already fired for this press.
      if (hapticCount() !== before) return;

      tapped();
    };

    document.addEventListener("click", onCapture, true);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onCapture, true);
      document.removeEventListener("click", onClick);
    };
  }, []);

  return null;
}
