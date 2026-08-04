"use client";

import Link from "next/link";
import { useFulfillment } from "../fulfillment";
import { PALETTE, SHOP_FONT } from "../shop/shopControls";

// Same produce palette as the pantry: olive marks the active tab, cream is
// the ground, and the rule above the bar is the shop's section border.
const { cream, olive, border } = PALETTE;

export type TabId = "home" | "menu" | "reorder" | "gift" | "about";

// The app-shell tab bar, shared by every screen that has one. It lives here
// rather than inside the location finder because more than one page shows it
// now, and a tab bar that differs between screens is worse than none.
//
// Home is the map — the finder is the front door, not a sub-page of one.
// Menu is the pantry, but only once an order has somewhere to go: until a
// shop, an outpost, or a delivery address is chosen, Menu leads back to the
// map, because the shop can't price or route an order without knowing where
// it's headed (see app/fulfillment.ts and the gate in app/shop/layout.tsx).
// Reorder is membership: signing in is what makes reordering possible, so
// that's the door it opens. Gift is the gift-card gallery.
//
// Every tab has a destination now, so nothing is dimmed — the disabled
// branch below stays because a new tab will arrive before its page does.
const NAV: { id: TabId; label: string; href: string | null }[] = [
  { id: "home", label: "Home", href: "/locations" },
  // href is overridden at render — see menuHref below.
  { id: "menu", label: "Menu", href: "/shop" },
  { id: "reorder", label: "Reorder", href: "/membership" },
  { id: "gift", label: "Gift", href: "/gift" },
  { id: "about", label: "About", href: "/about" },
];

function NavIcon({ id }: { id: TabId }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none" } as const;
  if (id === "home")
    return (
      <svg {...common} aria-hidden>
        <path
          d="M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-9.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  if (id === "menu")
    return (
      <svg {...common} aria-hidden>
        <path
          d="M4 11.5h16a8 8 0 0 1-8 7.5 8 8 0 0 1-8-7.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M6 8.2c1.6-1.4 10.4-1.4 12 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  // Heart for Reorder and a wrapped box for Gift, as in the reference.
  if (id === "reorder")
    return (
      <svg {...common} aria-hidden>
        <path
          d="M12 20s-7.4-4.6-7.4-9.6a4.2 4.2 0 0 1 7.4-2.7 4.2 4.2 0 0 1 7.4 2.7c0 5-7.4 9.6-7.4 9.6Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  if (id === "gift")
    return (
      <svg {...common} aria-hidden>
        <rect x="3.4" y="9.4" width="17.2" height="11.2" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
        <path d="M2.6 9.4h18.8M12 9.4V20.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path
          d="M12 9.4S10.9 4 8.6 4a2.2 2.2 0 0 0 0 4.4h6.8a2.2 2.2 0 0 0 0-4.4C13.1 4 12 9.4 12 9.4Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  return (
    <svg {...common} aria-hidden>
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 11v5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="7.9" r="1" fill="currentColor" />
    </svg>
  );
}

export default function TabBar({ active }: { active: TabId }) {
  const fulfillment = useFulfillment();
  // Sending someone to a gated shop just to be told to pick a location is a
  // wasted tap; send them where the choice is made instead.
  const menuHref = fulfillment ? "/shop" : "/locations";

  return (
    <nav
      className="shrink-0 border-t pb-[env(safe-area-inset-bottom)]"
      style={{ backgroundColor: cream, borderColor: border, fontFamily: SHOP_FONT }}
      aria-label="Primary"
    >
      <ul className="m-0 flex list-none items-stretch justify-around p-0 px-2 pt-[9px]">
        {NAV.map((item) => {
          const href = item.id === "menu" ? menuHref : item.href;
          const isActive = item.id === active;
          const tone = isActive ? olive : "#5F6553";
          const body = (
            <>
              <NavIcon id={item.id} />
              <span className="mt-1.5 text-[13px] leading-none">{item.label}</span>
              {/* The active underline, as in the reference: a short rule
                  under the label rather than a full-width indicator. */}
              <span
                className="mt-1.5 block h-[2px] w-7 rounded-full"
                style={{ backgroundColor: isActive ? olive : "transparent" }}
              />
            </>
          );

          return (
            <li key={item.id} className="flex-1">
              {href ? (
                <Link
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  style={{ color: tone }}
                  className="flex cursor-pointer flex-col items-center pb-[7px] transition-opacity hover:opacity-70"
                >
                  {body}
                </Link>
              ) : (
                // Dimmed because it has nowhere to go — distinct from the
                // active tab, which stays at full strength.
                <span
                  aria-disabled="true"
                  style={{ color: tone, opacity: 0.45 }}
                  className="flex flex-col items-center pb-[7px]"
                >
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
