"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Hidden on the app-shell routes — the full-screen ones that carry their own
// bottom tab bar (app/(marketing)/TabBar.tsx). This link is fixed to the same
// bottom-right corner, so on those pages it lands on top of the last tab.
// Route-scoping it here follows what CornerBagelIcon already does for the
// same reason. Add a route to this list whenever it starts rendering TabBar.
//
// /shop needs no entry: it sits outside the marketing route group, so it
// never renders this component at all.
//
// Visibility on the shop subdomain is decided by the caller — app/layout.tsx
// — server-side via the Host header. See the comment there for why.
const TAB_BAR_ROUTES = ["/locations", "/membership", "/gift"];

export default function PrivacyFooterLink() {
  const pathname = usePathname();
  if (TAB_BAR_ROUTES.includes(pathname)) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 text-[12px] opacity-75 font-sans"
      style={{
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
