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
export default function AboutMark({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <Link
      href="/about"
      aria-label={t("nav.about")}
      className={`cb-press flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-line-grey text-[12px] text-muted transition-colors hover:border-ink hover:text-ink ${className}`}
    >
      <span aria-hidden>i</span>
    </Link>
  );
}
