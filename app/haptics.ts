"use client";

// A short buzz when something happens, on both platforms.
//
// ——— How this works, because it is not obvious ———
//
// Two mechanisms, because there are two answers:
//
//   Android    navigator.vibrate(pattern). The real API, arbitrary patterns.
//   iOS        a hidden <input type="checkbox" switch>, toggled.
//
// The second one needs explaining. Safari on iOS has never implemented the
// Vibration API and Apple has never exposed the Taptic Engine to the web. But
// since iOS 17.4 the *switch* control plays a system haptic when it changes,
// because it is a real UIKit control underneath, and that fires for a
// programmatic toggle as well as a finger. So a switch that nobody can see,
// clicked when something happens, is a haptic.
//
// I had written this off as a trick that breaks the control it's applied to,
// which was wrong, and the correction is worth keeping: the switch is a
// *side-car*, not a costume. Nothing is done to the button somebody actually
// pressed. A single hidden input is appended to <body> once and toggled; every
// real control on the page stays a real control, keyboard-reachable and
// correctly announced. Credit where due — this is the mechanism the
// `web-haptics` package uses, read out of its source rather than its README.
//
// ⚠️ The one thing that is *not* copied from it: it hides the switch with
// `display: none`, and this uses opacity and a 1px box instead. A display:none
// element is not rendered at all, and the reason iOS plays a sound here is
// that it *is* rendering a control. Whether Apple's haptic survives display
// removal is exactly the sort of thing that works on one iOS point release and
// not the next; a rendered-but-invisible control has nothing to survive.
// aria-hidden and tabIndex=-1 keep it out of the accessibility tree and the
// tab order, which display:none was doing for free.
//
// Still a bonus, never the feedback itself. Every press has to look like it
// landed without any of this — see `.cb-press` in globals.css. If a buzz is
// the only thing telling somebody it worked, the visual is wrong.

/** A press landed. The shortest thing either platform will do. */
export function tapped() {
  fire([8], 1);
}

/** Something was added, chosen, applied. A shade more than a press. */
export function confirmed() {
  fire([14], 1);
}

/** Two beats — an order placed, a card saved. Reserved for the once-a-visit
    things, so it keeps meaning something. */
export function completed() {
  fire([16, 40, 24], 2);
}

/** Something was refused: a field that won't pass, a button that can't. */
export function refused() {
  fire([22, 60, 22], 3);
}

// One call, two spellings. `pattern` is the Vibration API's alternating
// on/off milliseconds; `beats` is how many times to toggle the switch, since
// iOS gives one fixed tick per toggle and duration means nothing to it.
function fire(pattern: number[], beats: number) {
  try {
    if (typeof window === "undefined") return;
    // Somebody who has asked their OS to stop things moving has not asked for
    // their phone to buzz instead.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    if (typeof navigator?.vibrate === "function") {
      navigator.vibrate(pattern);
      return;
    }
    toggle(beats);
  } catch {
    // A device that won't buzz is a device that won't buzz.
  }
}

const SWITCH_ID = "cb-haptic-switch";
let sidecar: HTMLLabelElement | null = null;

function ensureSidecar(): HTMLLabelElement | null {
  if (sidecar?.isConnected) return sidecar;
  if (typeof document === "undefined") return null;

  const label = document.createElement("label");
  label.htmlFor = SWITCH_ID;
  label.setAttribute("aria-hidden", "true");
  // Rendered, and invisible. Not display:none — see the note at the top.
  // pointer-events off so a 1px box in the corner can never eat a real tap.
  label.style.cssText =
    "position:fixed;bottom:0;left:0;width:1px;height:1px;opacity:0;" +
    "pointer-events:none;overflow:hidden;z-index:-1";

  const input = document.createElement("input");
  input.type = "checkbox";
  // The whole mechanism, in one attribute. Meaningless everywhere but Safari.
  input.setAttribute("switch", "");
  input.id = SWITCH_ID;
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");
  // `appearance: auto` matters: this only works while it is a real switch
  // control rather than something a stylesheet has flattened.
  input.style.cssText = "appearance:auto;width:1px;height:1px;margin:0";

  label.appendChild(input);
  document.body.appendChild(label);
  sidecar = label;
  return label;
}

// Beats rather than a duration: iOS gives one tick per toggle, and how hard or
// how long is Apple's to decide. Spaced by 60ms, which is far enough apart to
// register as two and close enough to read as one event.
function toggle(beats: number) {
  const label = ensureSidecar();
  if (!label) return;
  for (let beat = 0; beat < beats; beat++) {
    if (beat === 0) label.click();
    else window.setTimeout(() => label.click(), beat * 60);
  }
}
