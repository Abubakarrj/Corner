"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

// The corner bagel icon — a small brand mark in an actual corner of the
// viewport, linking to /about. Lives on /order only: that's the one
// marketing page a real visitor can reach (the homepage's logo links there;
// nothing links to /bagel or /about anymore, so this icon is /about's only
// remaining entry point). Top-left, not bottom-right, so it doesn't collide
// with the privacy-policy link fixed in the opposite corner.
//
// This used to double as the /bagel page's own corner mark too, positioned
// by replicating that page's image-frame layout so the icon would land
// against the bagel photo. That math doesn't apply here — /order has no
// photo — so this is a plain fixed position instead.
export default function CornerBagelIcon() {
  const pathname = usePathname();
  if (pathname !== "/order") return null;

  return (
    <Link
      href="/about"
      aria-label="About Corner Bagel"
      className="fixed left-4 top-4 z-40 h-6 w-6 cursor-pointer sm:left-6 sm:top-6 sm:h-7 sm:w-7"
    >
      <Image
        src="/icon.svg"
        alt="Corner Bagel Icon"
        fill
        unoptimized
        className="object-contain"
      />
    </Link>
  );
}
