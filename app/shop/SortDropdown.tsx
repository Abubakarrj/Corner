"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SORT_OPTIONS, type SortValue } from "./products";
import type { Product } from "./products";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="6"
      viewBox="0 0 10 6"
      fill="none"
      aria-hidden
      className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M1 1l4 4 4-4"
        stroke="#3E4A30"
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
        stroke="#3E4A30"
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
        className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-[#DDD6C2] px-3.5 text-[12px] text-[#3E4A30] transition-colors hover:border-[#3E4A30]"
      >
        Sort: {activeLabel}
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+6px)] z-30 w-52 overflow-hidden rounded-2xl border border-[#E7E2D2] bg-[#FAF8F0] py-1.5 shadow-[0_12px_30px_rgba(0,0,0,0.1)]"
        >
          {SORT_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={hrefFor(option.value)}
              role="option"
              aria-selected={option.value === activeSort}
              onClick={() => setOpen(false)}
              className="flex cursor-pointer items-center justify-between px-4 py-2 text-[13px] text-[#3E4A30] transition-colors hover:bg-[#EFEBDD]"
            >
              {option.label}
              {option.value === activeSort ? <CheckIcon /> : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
