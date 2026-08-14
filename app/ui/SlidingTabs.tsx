"use client";

import { useEffect, useRef } from "react";

// A segmented control whose highlight slides between options.
//
// transitions.dev's tabs-sliding (16-tabs-sliding.md). The pill is one element
// that moves and resizes; JS writes the active tab's offsetLeft and
// offsetWidth onto it and the CSS owns the tween. That is the whole trick, and
// it is why the pill can travel between options of different widths — the Cart
// segment in the chat panel is wider than Chat, and wider still once it is
// carrying a count and a dot.
//
// ——— The first position is written without a transition ———
//
// The snippet's documented wire-up, and the mistake it warns about: on first
// paint the pill has `width: 0` and `translateX(0)`, so writing the real
// values with the transition live animates it in from the left edge at zero
// width every time the control mounts. Suspending the transition, writing,
// forcing a reflow and restoring is what makes it simply *be* in the right
// place. Same on resize, where an animated correction is a pill drifting
// across the bar after a rotation.
//
// ——— Why the measurement is in an effect on every change ———
//
// The labels are translated, so a tab's width is a property of the language,
// and the Cart segment's width changes when the basket does. Reading the DOM
// after the browser has laid it out is the only honest way to know where the
// pill goes; a width computed from the label's length would be right in
// English and wrong in Japanese.

export type SlidingTab = {
  id: string;
  label: React.ReactNode;
  /** Announced instead of the label when the label is not plain text. */
  ariaLabel?: string;
};

export default function SlidingTabs({
  tabs,
  active,
  onSelect,
  className = "",
  tabClassName = "",
}: {
  tabs: SlidingTab[];
  active: string;
  onSelect: (id: string) => void;
  className?: string;
  tabClassName?: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const painted = useRef(false);

  useEffect(() => {
    const bar = barRef.current;
    const pill = pillRef.current;
    if (!bar || !pill) return;

    const move = (animate: boolean) => {
      const tab = bar.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(active)}"]`);
      if (!tab) return;
      if (animate) {
        pill.style.transform = `translateX(${tab.offsetLeft}px)`;
        pill.style.width = `${tab.offsetWidth}px`;
        return;
      }
      const previous = pill.style.transition;
      pill.style.transition = "none";
      pill.style.transform = `translateX(${tab.offsetLeft}px)`;
      pill.style.width = `${tab.offsetWidth}px`;
      void pill.offsetWidth;
      pill.style.transition = previous;
    };

    move(painted.current);
    painted.current = true;

    // Not just window resize: the bar is inside a panel that can change width
    // on its own, and the Cart label grows when a line is added to the basket
    // without anything about the window changing.
    const observer = new ResizeObserver(() => move(false));
    observer.observe(bar);
    return () => observer.disconnect();
  }, [active, tabs]);

  return (
    <div ref={barRef} role="tablist" className={`t-tabs ${className}`}>
      <span ref={pillRef} className="t-tabs-pill" aria-hidden="true" />
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          data-tab-id={tab.id}
          aria-selected={tab.id === active}
          aria-label={tab.ariaLabel}
          onClick={() => onSelect(tab.id)}
          className={`t-tab cb-press ${tabClassName}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
