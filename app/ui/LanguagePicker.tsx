"use client";

import { useEffect, useRef, useState } from "react";
import { setLocale, useLocale, useT } from "../locale";
import { LOCALES, localeById } from "../localeScript";

// The language picker: a chip showing the current language, and a menu.
//
// A menu rather than a row of segments, because seven of anything does not fit
// beside a toggle in the corner of a phone. The chip is the same 28px height
// as the appearance switch next to it so the pair reads as one strip of
// chrome.
//
// Every language is written in its own script, not in English. A list that
// says "Korean" to somebody who reads Korean is a list written for the people
// who already understand the app, and those are exactly the people who don't
// need it. The English name comes along in the aria-label, where a screen
// reader set to English can still find it.
export default function LanguagePicker({
  className = "",
  shell = "surface",
}: {
  className?: string;
  shell?: "surface" | "page";
}) {
  const locale = useLocale();
  const t = useT();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const current = localeById(locale);

  // Close on an outside press or Escape. A menu that can only be dismissed by
  // choosing something is a menu that traps you into changing the language to
  // get rid of it.
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
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t("settings.language")}: ${current.english}`}
        onClick={() => setOpen((was) => !was)}
        className={`cb-press inline-flex h-7 max-w-[112px] cursor-pointer items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium leading-none transition-colors hover:text-ink ${ring} ${
          shell === "page" ? "text-quiet" : "text-muted"
        }`}
      >
        <GlobeIcon />
        <span className="truncate">{current.native}</span>
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label={t("settings.language")}
          // Anchored to the end of the chip rather than the right of it, so on
          // an Urdu page, where the whole document is mirrored, it opens
          // inward instead of off the edge of the screen.
          className={`absolute end-0 top-[calc(100%+6px)] z-50 m-0 max-h-[60vh] min-w-[168px] list-none overflow-y-auto rounded-2xl border p-1 shadow-[0_10px_34px_rgba(0,0,0,0.18)] ${ring}`}
        >
          {LOCALES.map((entry) => {
            const active = entry.id === locale;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  lang={entry.tag}
                  onClick={() => {
                    setLocale(entry.id);
                    setOpen(false);
                  }}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-start text-[14px] transition-colors hover:bg-raise ${
                    active ? "text-ink" : "text-muted"
                  }`}
                >
                  <span className="w-3.5 shrink-0">{active ? <TickIcon /> : null}</span>
                  {/* The name in its own script, then in English, because a
                      picker somebody opened by accident should be escapable by
                      somebody who cannot read any of the other six. */}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{entry.native}</span>
                    {entry.native !== entry.english ? (
                      <span className="block truncate text-[11px] text-faint" lang="en">
                        {entry.english}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
      <circle cx="8" cy="8" r="6.1" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M1.9 8h12.2M8 1.9c1.6 1.8 2.4 3.9 2.4 6.1S9.6 12.3 8 14.1C6.4 12.3 5.6 10.2 5.6 8S6.4 3.7 8 1.9Z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}

function TickIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 8.6 6.2 11.8 13 5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
