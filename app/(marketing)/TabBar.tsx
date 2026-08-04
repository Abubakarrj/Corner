"use client";

import Link from "next/link";

const BRAND_RED = "#BE1923";
const CHROME = "#F4F4EC";
const INK = "#1B1D16";

export type TabId = "home" | "menu" | "reorder" | "gift" | "about";

// The app-shell tab bar, shared by every screen that has one. It lives here
// rather than inside the location finder because more than one page shows it
// now, and a tab bar that differs between screens is worse than none.
//
// Home is the map — the finder is the front door, not a sub-page of one.
// Menu is the pantry. Reorder is membership: signing in is what makes
// reordering possible, so that's the door it opens. Gift has no destination
// yet and is dimmed rather than dressed up as a link.
const NAV: { id: TabId; label: string; href: string | null }[] = [
  { id: "home", label: "Home", href: "/locations" },
  { id: "menu", label: "Menu", href: "/shop" },
  { id: "reorder", label: "Reorder", href: "/membership" },
  { id: "gift", label: "Gift", href: null },
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
  return (
    <nav
      className="shrink-0 border-t border-[#DEDED4] pb-[env(safe-area-inset-bottom)]"
      style={{ backgroundColor: CHROME, fontFamily: "var(--font-geist-sans), sans-serif" }}
      aria-label="Primary"
    >
      <ul className="m-0 flex list-none items-stretch justify-around p-0 px-2 pt-[9px]">
        {NAV.map((item) => {
          const isActive = item.id === active;
          const tone = isActive ? BRAND_RED : INK;
          const body = (
            <>
              <NavIcon id={item.id} />
              <span className="mt-1.5 text-[13px] leading-none">{item.label}</span>
              {/* The active underline, as in the reference: a short rule
                  under the label rather than a full-width indicator. */}
              <span
                className="mt-1.5 block h-[2px] w-7 rounded-full"
                style={{ backgroundColor: isActive ? BRAND_RED : "transparent" }}
              />
            </>
          );

          return (
            <li key={item.id} className="flex-1">
              {item.href ? (
                <Link
                  href={item.href}
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
