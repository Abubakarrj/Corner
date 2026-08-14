"use client";

import Link from "next/link";
import { useT } from "../i18n";

// The (i) beside the mark on the front door.
//
// A client component for one reason: the label is translated, and the landing
// page is a server component. Rather than make the whole page client to reach
// useT — it is a logo, a link and three chips, all of it prerenderable — the
// one translated thing is its own island.
//
// The label is the only text here. The glyph is an `i` and means nothing to a
// screen reader, so aria-label carries the whole button.
//
// ——— Small mark, ordinary hit area ———
//
// The circle is 16px and the link around it is 28px. Those are deliberately
// different numbers. The first cut made the visible mark the whole button at
// 28px, and beside a logo it stopped reading as a footnote and started
// competing with the name — the loudest thing on a page whose only job is the
// mark. Shrinking the button to match would have fixed the look by making a
// 16px tap target, which is half of what a thumb needs.
//
// So the padding is the hit area and the circle is the mark. It looks like
// small print and behaves like a button.
export default function AboutMark({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <Link
      href="/about"
      aria-label={t("nav.about")}
      className={`cb-press group flex h-7 w-7 cursor-pointer items-center justify-center ${className}`}
    >
      <span
        aria-hidden
        className="flex h-4 w-4 items-center justify-center rounded-full border border-line-grey text-[9px] leading-none text-quiet transition-colors group-hover:border-ink group-hover:text-ink"
      >
        i
      </span>
    </Link>
  );
}
