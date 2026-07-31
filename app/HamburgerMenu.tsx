"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// A floating menu button, homepage-only. Everywhere else the site's
// navigation is contextual (the corner icon, the "Close" link on /about) —
// this is the one page with nothing else to click, so it's the one page that
// gets a menu.

const CAREERS_EMAIL = "careers@thecornerbagel.com";

const sansStyle = {
  fontFamily: "var(--font-geist-sans), sans-serif",
} as const;

function HamburgerIcon() {
  // Three rounded bars, the bottom one shorter — matches the reference icon
  // rather than an even/symmetric hamburger.
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" fill="none" aria-hidden>
      <path d="M1 1.5H19" stroke="#2D2D2D" strokeWidth="2" strokeLinecap="round" />
      <path d="M1 7H19" stroke="#2D2D2D" strokeWidth="2" strokeLinecap="round" />
      <path d="M1 12.5H12.5" stroke="#2D2D2D" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function HamburgerMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape, or on a click/tap outside the button and panel.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  if (pathname !== "/") return null;

  return (
    <div className="fixed left-5 top-5 z-40 sm:left-6 sm:top-6" style={sansStyle}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu"
        aria-expanded={open}
        className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-white shadow-[0_2px_12px_rgba(0,0,0,0.12)] transition-opacity hover:opacity-80"
      >
        <HamburgerIcon />
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="menu"
          className="absolute left-0 top-[calc(100%+8px)] w-48 overflow-hidden rounded-2xl bg-white py-2 shadow-[0_8px_30px_rgba(0,0,0,0.15)]"
        >
          <Link
            href="/bagel"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-5 py-2.5 text-[15px] text-[#2D2D2D] transition-colors hover:bg-[#F7F7F7]"
          >
            Menu
          </Link>
          <Link
            href="/order"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-5 py-2.5 text-[15px] text-[#2D2D2D] transition-colors hover:bg-[#F7F7F7]"
          >
            Order
          </Link>
          <Link
            href="/catering"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-5 py-2.5 text-[15px] text-[#2D2D2D] transition-colors hover:bg-[#F7F7F7]"
          >
            Catering
          </Link>
          <a
            href={`mailto:${CAREERS_EMAIL}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-5 py-2.5 text-[15px] text-[#2D2D2D] transition-colors hover:bg-[#F7F7F7]"
          >
            Careers
          </a>
        </div>
      ) : null}
    </div>
  );
}
