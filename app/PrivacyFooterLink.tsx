"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasTabBar } from "./(marketing)/TabBar";

// Hidden on the app-shell routes — the full-screen ones that carry their own
// bottom tab bar. This link is fixed to the same bottom-right corner, so on
// those pages it lands on top of the last tab. The list lives with the bar
// itself, since it's the bar that decides which routes are on it.
//
// Visibility on the shop subdomain is decided by the caller — app/layout.tsx
// — server-side via the Host header. See the comment there for why.

export default function PrivacyFooterLink() {
  const pathname = usePathname();
  if (hasTabBar(pathname)) return null;

  return (
    <div
      className="fixed right-4 z-50 text-[12px] opacity-75 font-sans"
      style={{
        // Clears the home indicator. Installed to an iPhone's home screen the
        // page runs under `viewport-fit: cover`, so bottom-4 puts this line
        // inside the gesture area and the descenders get cut off by the
        // screen's own curve. Inert (env() is 0) in a normal browser tab.
        bottom: "calc(1rem + env(safe-area-inset-bottom))",
        // Literal white, not a token. mixBlendMode:difference against white
        // is an inversion — it comes out dark on a light page and light on a
        // dark one, which is exactly the behaviour wanted and is why this
        // must NOT follow the theme. A themed value here blends near-black
        // with a near-black page and disappears.
        color: "#ffffff",
        mixBlendMode: "difference",
        fontFamily: "var(--font-geist-sans), sans-serif",
      }}
    >
      <Link href="/privacy-policy" className="hover:cursor-pointer">
        Privacy Policy &nbsp; © 2026
      </Link>
    </div>
  );
}
