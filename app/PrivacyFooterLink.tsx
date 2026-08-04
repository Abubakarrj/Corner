"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Hidden on /locations. That page is a full-screen finder with its own
// bottom tab bar, and this link is fixed to the same bottom-right corner —
// it landed on top of the "Contact" tab. Route-scoping it here follows what
// CornerBagelIcon already does for the same reason.
//
// Visibility on the shop subdomain is decided by the caller — app/layout.tsx
// — server-side via the Host header. See the comment there for why.
const HIDDEN_ON = ["/locations"];

export default function PrivacyFooterLink() {
  const pathname = usePathname();
  if (HIDDEN_ON.includes(pathname)) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 text-[12px] opacity-75 font-sans"
      style={{
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
