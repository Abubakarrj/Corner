"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { closeAfter } from "./transitions";

// "About Us", and the two pages behind it.
//
// ——— What this replaced ———
//
// A single "We Are Hiring!" chip linking straight to /careers, filled with the
// mark's red so it would not read as a third setting beside the language and
// appearance switches. That worked as an advertisement and it made the corner
// strip say something odd: two quiet pills about the page you are on, and one
// loud one about a job. The shop's story had no door here at all.
//
// So it is a menu now, and the red is gone. Careers is one of two things
// inside it rather than the only thing, which is a truer weight for it: this
// is a bagel shop's front door, not a recruiting page. Dressed like the
// language picker because it now *is* what that is, a pill that opens a short
// list, and two controls that behave the same should not look different.
//
// ——— Why a menu and not a listbox ———
//
// LanguagePicker is a listbox with options, because choosing one changes a
// setting and the current value is worth ticking. These are links. Nothing is
// selected, nothing is current, and a screen reader should hear a menu of
// places to go rather than a set of values to pick from.

type Entry = { href: string; label: Parameters<ReturnType<typeof useT>>[0] };

// Careers second, deliberately. "Our Story" is what somebody tapping "About
// Us" came for; the job opening is the one they might find on the way.
const ENTRIES: Entry[] = [
  { href: "/about", label: "about.ourStory" },
  { href: "/careers", label: "about.careers" },
];

export default function AboutMenu({
  className = "",
  shell = "page",
}: {
  className?: string;
  shell?: "surface" | "page";
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const everOpened = useRef(false);

  // t-dropdown's open / close, from 05-menu-dropdown.md. Same call the
  // language picker makes, so the two menus move identically.
  useEffect(
    () => closeAfter(menuRef.current, open, everOpened, "--dropdown-close-dur", 150),
    [open],
  );

  // Close on an outside press or Escape, so a menu opened by accident does not
  // have to be escaped by going somewhere.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const ring = shell === "page" ? "border-line-grey bg-page" : "border-line-soft bg-surface";

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        // whitespace-nowrap, no truncate: the label is the whole control, and
        // "About U…" is worse than a chip that takes its own line. The strip
        // wraps instead. See the marketing home page.
        className={`cb-press inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-[11px] font-medium leading-none transition-colors hover:text-ink ${ring} ${
          shell === "page" ? "text-quiet" : "text-muted"
        }`}
      >
        {t("about.aboutUs")}
        {/* The chevron carries what the globe carries next door: that this
            opens. "About Us" already says what it is, so the icon's job here
            is the affordance rather than the subject. */}
        <ChevronIcon open={open} />
      </button>

      {/* Always mounted — a menu that unmounts on close cannot animate one —
          with `inert` keeping the links out of the tab order while shut. */}
      <ul
        ref={menuRef}
        role="menu"
        inert={!open}
        // Grows out of the corner of the chip it belongs to, and under RTL
        // `end` is the left edge, so the origin follows the document.
        data-origin="top-right"
        aria-label={t("about.aboutUs")}
        className={`t-dropdown absolute end-0 top-[calc(100%+6px)] z-50 m-0 min-w-[168px] list-none overflow-hidden rounded-2xl border p-1 shadow-[0_10px_34px_rgba(0,0,0,0.18)] rtl:[transform-origin:top_left] ${ring}`}
      >
        {ENTRIES.map((entry) => (
          <li key={entry.href}>
            <Link
              href={entry.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full cursor-pointer items-center rounded-xl px-3 py-2.5 text-start text-[14px] text-muted transition-colors hover:bg-raise hover:text-ink"
            >
              {t(entry.label)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
