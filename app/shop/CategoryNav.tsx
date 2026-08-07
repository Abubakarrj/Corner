"use client";

import Link from "next/link";
import { useT } from "../i18n";
import { useMenu } from "../i18n/menu";
import { useEffect, useRef } from "react";
import { CATEGORIES, type Product, type SortValue } from "./products";

// Underline tabs, matching the reference catalog: a horizontal row of
// category names over a hairline, with the active one darkened and
// underlined. Scrolls sideways on narrow screens rather than wrapping.
const tabBase =
  "-mb-px shrink-0 snap-start cursor-pointer whitespace-nowrap border-b-2 pb-3 text-[16px] transition-colors";
const tabActive = "border-ink font-medium text-ink";
const tabIdle = "border-transparent text-muted hover:text-ink";

export default function CategoryNav({
  activeCategory,
  activeSort,
}: {
  activeCategory: Product["category"] | undefined;
  activeSort: SortValue;
}) {
  const t = useT();
  const menu = useMenu();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  // Tapping a tab is a navigation, so the strip re-renders scrolled to the
  // left — and the tab you just chose can be off the right-hand edge, which
  // looks like the tap did nothing. Put it back in view on arrival, without
  // animating: this is where the strip should already have been, not a
  // movement worth showing.
  //
  // Measured off getBoundingClientRect and applied as a *delta* to scrollLeft,
  // rather than computing an absolute offsetLeft. Both halves of that matter
  // in Urdu: the strip is laid out right-to-left, so the tab that runs off the
  // edge runs off the *left* one, and an RTL scroller's scrollLeft starts at 0
  // at the right and counts down into negatives. Absolute arithmetic written
  // for the left-to-right case sends it hard against the wrong end. Deltas are
  // signed the same way in both directions, so this needs no branch.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const active = activeRef.current;
    if (!scroller || !active) return;
    const tab = active.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    const pastEnd = tab.right - (view.right - 20);
    const pastStart = view.left + 20 - tab.left;
    if (pastEnd > 0) scroller.scrollLeft += pastEnd;
    else if (pastStart > 0) scroller.scrollLeft -= pastStart;
  }, [activeCategory]);

  // Preserves whichever sort is active across a category switch — sort and
  // category are independent filters, and only /shop's own "All" reset
  // clears the category half.
  function hrefFor(category: Product["category"] | undefined) {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (activeSort !== "featured") params.set("sort", activeSort);
    const query = params.toString();
    return query ? `/shop?${query}` : "/shop";
  }

  return (
    // Four things this row needs that a bare overflow-x-auto doesn't give it,
    // all of which showed up as the strip feeling laggy or landing wrong:
    //
    //  touch-pan-x       tells the browser this is a horizontal scroller, so
    //                    it can start the scroll on the first frame instead
    //                    of holding the touch to work out which way you meant
    //                    to go.
    //  overscroll-x-contain  keeps a flick past the last tab from becoming
    //                    the page's back-swipe on iOS, which is what made a
    //                    fast scroll feel like it snagged.
    //  snap-x            settles on a tab rather than halfway through a word.
    //                    "proximity", not "mandatory" — mandatory fights a
    //                    deliberate small nudge.
    //  no scrollbar      a scrollbar tracking along the hairline, appearing
    //                    and disappearing, is the "off" part.
    //
    // The gutter padding, with the negative margin cancelling it, lets the
    // row run to the page edge — a tab clipped by the screen edge reads as
    // "there's more", where one clipped by a margin just reads as broken.
    <div
      ref={scrollerRef}
      className="mb-5 -mx-5 snap-x overflow-x-auto overscroll-x-contain border-b border-line px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6"
      style={{ touchAction: "pan-x", scrollPaddingLeft: "1.25rem" }}
    >
      <div className="flex w-max gap-7">
        <Link
          ref={activeCategory ? undefined : activeRef}
          href={hrefFor(undefined)}
          className={`${tabBase} ${activeCategory ? tabIdle : tabActive}`}
        >
          {t("shop.all")}
        </Link>
        {CATEGORIES.map((category) => (
          <Link
            key={category}
            ref={category === activeCategory ? activeRef : undefined}
            href={hrefFor(category)}
            className={`${tabBase} ${category === activeCategory ? tabActive : tabIdle}`}
          >
            {menu.category(category)}
          </Link>
        ))}
      </div>
    </div>
  );
}
