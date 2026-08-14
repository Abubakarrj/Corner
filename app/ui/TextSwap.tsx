"use client";

import { useEffect, useRef, useState } from "react";
import { msFrom } from "./transitions";

// A line of text that replaces itself, visibly.
//
// transitions.dev's text-states-swap (04-text-states-swap.md): the old line
// exits upward with a blur, the new one enters from below. Its stated use is
// "Processing… → Done", which is the order tracker's headline exactly — a
// status line that changes underneath somebody who is watching it.
//
// ——— Why this one is imperative when Swap is not ———
//
// The price swap next door replays on a React key, because it only has an
// entrance: the new value replaces the old one immediately and rises in. This
// one has two halves. The old text has to stay on screen for the length of its
// exit, and a keyed remount throws it away on the first frame — there is
// nothing left to animate out.
//
// So the reference's three-phase sequence is followed as written: exit, then
// swap the text and jump it below with no transition, then a forced reflow and
// release.
//
// After the first paint the text is the effect's to own, exactly as it is in
// the reference — which is why React renders the mounting value and never
// anything else. Rendering the live prop instead would put React and the
// effect in a fight over one text node, and React would win halfway through
// the exit by replacing the outgoing line with the incoming one.
//
// ——— Reduced motion skips the wait, not just the movement ———
//
// The snippet's guard zeroes the transitions, which stops the blur and the
// travel but not the 150ms the sequence spends waiting for an exit that no
// longer happens. On a status line that is 150ms of stale text for somebody
// who asked for less motion — the wrong trade, since the point of the line is
// what it says. Here the swap is immediate instead.
export default function TextSwap({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  // The value at mount, frozen. It is state rather than a ref because it is
  // read while rendering, and it never changes, so it never causes one.
  const [initial] = useState(value);

  useEffect(() => {
    const element = ref.current;
    if (!element || shown.current === value) return;

    const still =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      element.textContent = value;
      shown.current = value;
      return;
    }

    element.classList.add("is-exit");
    const timer = window.setTimeout(() => {
      element.textContent = value;
      shown.current = value;
      element.classList.remove("is-exit");
      element.classList.add("is-enter-start");
      // The reflow is what makes the release animate rather than apply. Take
      // it out and the new text simply appears in place.
      void element.offsetHeight;
      element.classList.remove("is-enter-start");
    }, msFrom("--text-swap-dur", 150));

    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <span ref={ref} className={`t-text-swap ${className}`}>
      {initial}
    </span>
  );
}
