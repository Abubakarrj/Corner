"use client";

import { usePathname } from "next/navigation";

// A menu icon, homepage-only. Not wired to anything yet — just the icon,
// positioned where the eventual menu button will live.

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
  if (pathname !== "/") return null;

  return (
    <div className="fixed right-5 top-5 z-40 flex h-14 w-14 items-center justify-center sm:right-6 sm:top-6">
      <HamburgerIcon />
    </div>
  );
}
