"use client";

import Link from "next/link";
import { useT } from "./i18n";
import { usePathname } from "next/navigation";
import { hasTabBar } from "./(marketing)/TabBar";

// Hidden on the app-shell routes — the full-screen ones that carry their own
// bottom tab bar. This link is fixed to the same bottom-right corner, so on
// those pages it lands on top of the last tab. The list lives with the bar
// itself, since it's the bar that decides which routes are on it.
//
// Visibility on the shop subdomain is decided by the caller — app/layout.tsx
// — server-side via the Host header. See the comment there for why.

// Routes where this floating line lands on top of something. It is fixed to
// the bottom-right of the *viewport*, so on any page whose content reaches
// that corner it prints straight through the words.
//
// /careers and /careers/apply print their own privacy link in their own
// footer, so it was landing across the equal-opportunity paragraph next to a
// second copy of itself.
//
// /delivery-areas is here for the other reason: the page is about a phone
// screen tall, so the answer under the Check button — "Yes, 3545 Wilshire is
// 0.9 miles out" — sits at exactly the height this line floats at, and the
// two overlapped into an unreadable smudge. It is a sheet with a close button
// rather than a page somebody browses, and a sheet does not need a footer.
const OWN_PRIVACY_LINK = ["/careers", "/careers/apply", "/delivery-areas"];

export default function PrivacyFooterLink() {
  const t = useT();
  const pathname = usePathname();
  if (hasTabBar(pathname) || OWN_PRIVACY_LINK.includes(pathname)) return null;

  return (
    <div
      className="fixed right-4 z-50 text-[12px] opacity-75 font-sans"
      style={{
        // Clears the home indicator. Installed to an iPhone's home screen the
        // page runs under `viewport-fit: cover`, so bottom-4 puts this line
        // inside the gesture area and the descenders get cut off by the
        // screen's own curve. Inert (env() is 0) in a normal browser tab.
        //
        // And clears the cookie banner, which docks to the same edge at a
        // higher z-index — this line was printed straight through it. Same
        // for the live-order bar on the landing page: it publishes its own
        // height for exactly this, and the token is 0px wherever it isn't.
        bottom:
          "calc(1rem + env(safe-area-inset-bottom) + var(--cb-consent-h, 0px) + var(--cb-orderbar-h, 0px))",
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
        {t("footer.privacy")} &nbsp; © 2026
      </Link>
    </div>
  );
}
