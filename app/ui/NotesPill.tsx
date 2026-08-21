"use client";

import Link from "next/link";
import { useT } from "../i18n";

// Corner Notes, in the corner strip beside About Us.
//
// ——— Why it is dressed like About Us and not like the other two ———
//
// The strip holds four things now and they are two kinds. About Us and this
// are doors to a page; the language and appearance chips are settings that
// change what you are already looking at. Same size and same shell so the row
// still reads as one strip, and adjacent so the pair is obvious.
//
// ——— A link, not a menu ———
//
// AboutMenu is a menu because it holds two destinations. This holds one, and a
// chip that opens a list of one is a chip that makes somebody tap twice.
//
// ——— A client component for one string ———
//
// The landing page is a server component, so it has no useT. Every other
// translated chip in that strip is a client component for the same reason;
// this follows them rather than hardcoding English into the one door on the
// page that leads to something the neighbourhood wrote.
export default function NotesPill({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <Link
      href="/notes"
      // whitespace-nowrap and no truncate, matching AboutMenu: the strip wraps
      // to a second line rather than shortening a name into nonsense.
      className={`cb-press inline-flex h-7 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full border border-line-grey bg-page px-2.5 text-[11px] font-medium leading-none text-quiet transition-colors hover:text-ink ${className}`}
    >
      {t("notes.pill")}
    </Link>
  );
}
