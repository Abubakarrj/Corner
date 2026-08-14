"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { SORT_OPTIONS, type SortValue } from "./products";
import type { Product } from "./products";
import { CONTROL_PILL } from "./shopControls";
import { closeAfter } from "../ui/transitions";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="9"
      height="6"
      viewBox="0 0 10 6"
      fill="none"
      aria-hidden
      className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M1 1l4 4 4-4"
        stroke="var(--cb-ink)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2.5 6.2l2.3 2.3 4.7-5"
        stroke="var(--cb-ink)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// A sort-order picker, styled after the reference wholesale catalog's
// "Sort: Featured" control. Options are plain links (not a client-side
// setState) so the sort survives a reload and stacks with the category
// filter the same way CategoryNav's links do — both live in the query
// string, and each preserves the other when it changes.
export default function SortDropdown({
  activeSort,
  activeCategory,
}: {
  activeSort: SortValue;
  activeCategory: Product["category"] | undefined;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const everOpened = useRef(false);

  useEffect(
    () => closeAfter(menuRef.current, open, everOpened, "--dropdown-close-dur", 150),
    [open],
  );

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const activeLabel = SORT_OPTIONS.find((option) => option.value === activeSort)?.label;

  function hrefFor(sortValue: SortValue) {
    const params = new URLSearchParams();
    if (activeCategory) params.set("category", activeCategory);
    if (sortValue !== "featured") params.set("sort", sortValue);
    const query = params.toString();
    return query ? `/shop?${query}` : "/shop";
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`${CONTROL_PILL} flex cursor-pointer items-center gap-1.5 px-3 transition-colors hover:border-ink`}
      >
        {t("shop.sortPrefix", { label: activeLabel ? t(activeLabel) : "" })}
        <ChevronIcon open={open} />
      </button>

      {/* t-dropdown, from 05-menu-dropdown.md. Mounted at all times rather
          than behind `open ?` — the snippet animates a closing scale, and an
          element that unmounts on close has nothing left to animate.
          `inert` is what keeps the hidden options out of the tab order now
          that they are always in the DOM.

          data-origin="top-left" because that is where the trigger is: the
          menu grows out of the button rather than appearing beside it.
          RTL flips the anchor with it, since in Persian and Urdu the control
          sits at the other edge. */}
      <div
        role="listbox"
        inert={!open}
        data-origin="top-left"
        ref={menuRef}
        className="t-dropdown absolute start-0 top-[calc(100%+6px)] z-30 w-48 overflow-hidden rounded-xl border border-line-faint bg-panel py-1 shadow-[0_12px_30px_rgba(0,0,0,0.1)] rtl:[transform-origin:top_right]"
      >
        {SORT_OPTIONS.map((option) => (
          <Link
            key={option.value}
            href={hrefFor(option.value)}
            role="option"
            aria-selected={option.value === activeSort}
            onClick={() => setOpen(false)}
            className="flex cursor-pointer items-center justify-between px-3.5 py-2 text-[12px] text-ink transition-colors hover:bg-raise"
          >
            {t(option.label)}
            {option.value === activeSort ? <CheckIcon /> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
