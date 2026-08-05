"use client";

import Link from "next/link";
import { useAccount } from "../account";
import { PALETTE, SHOP_FONT } from "../shop/shopControls";

// Same produce palette as the pantry: olive marks the active tab, cream is
// the ground, and the rule above the bar is the shop's section border.
const { cream, olive, border, muted } = PALETTE;

// Resting tabs sit at the palette's muted tier and the current one steps up
// to full olive with its underline. The gap is deliberately wider than the
// reference's, where inactive and active are nearly the same lightness and
// only the hue separates them; that reads as five equal tabs with one tinted,
// rather than one you're on and four you could go to.
//
// This used to be the `faint` tier, which measured 3.3:1 on cream — fine for
// an icon, under the 4.5:1 text needs at 13px. Muted is 5.3:1 and still reads
// clearly duller than olive, so the state contrast survives the fix.
const TAB_REST = muted;

export type TabId = "home" | "menu" | "reorder" | "gift" | "about";

// The app-shell tab bar, shared by every screen that has one. It lives here
// rather than inside the location finder because more than one page shows it
// now, and a tab bar that differs between screens is worse than none.
//
// Home and Menu both open the map. Menu never goes straight to /shop, even
// when a destination is already stored: the map is where you say how the food
// is coming or going, and the shop is what you get once you have. Tapping
// Menu means "start an order", and that starts there — the way through is
// choosing a shop or an address, not the tab.
//
// Reorder is membership: signing in is what makes reordering possible, so
// that's the door it opens. Gift is the gift-card gallery.
//
// Every tab has a destination now, so nothing is dimmed — the disabled
// branch below stays because a new tab will arrive before its page does.
const NAV: { id: TabId; label: string; href: string | null }[] = [
  { id: "home", label: "Home", href: "/locations" },
  // ?for=menu is how the map knows to light Menu rather than Home — they
  // are the same screen reached two ways.
  { id: "menu", label: "Menu", href: "/locations?for=menu" },
  { id: "reorder", label: "Reorder", href: "/membership" },
  { id: "gift", label: "Gift", href: "/gift" },
  { id: "about", label: "About", href: "/about" },
];

// Each icon has a resting outline and a filled or opened state for the tab
// you're on, and animates between them. currentColor throughout, so the tone
// change in the parent carries the icons with it for free.
//
// The transitions are on the SVG's own properties — fill and transform —
// rather than swapping one icon for another, because React keeps the same
// DOM node across a route change and a swap would just pop. Reduced motion
// gets the end state with no travel.
const MOTION = "transition-all duration-300 ease-out motion-reduce:transition-none";

// Crumbs thrown off the seam as the bagel parts. Positions are on the split
// line, directions fan out from it, and the small delays mean they don't all
// leave at once — a single burst reads as a glitch, a stagger reads as
// crumbs. Mounted only while the tab is active, so the animation replays
// every time you come back to it rather than firing once on load.
const CRUMBS = [
  { x: 11.4, y: 6.2, dx: "-7px", dy: "-5px", r: 1.05, delay: 0 },
  { x: 12.7, y: 8.4, dx: "8px", dy: "-3px", r: 0.8, delay: 60 },
  { x: 11.2, y: 12, dx: "-9px", dy: "1px", r: 0.95, delay: 30 },
  { x: 12.8, y: 15.4, dx: "9px", dy: "3px", r: 0.75, delay: 90 },
  { x: 11.6, y: 18, dx: "-6px", dy: "5px", r: 0.9, delay: 120 },
  { x: 12.4, y: 4.6, dx: "3px", dy: "-7px", r: 0.7, delay: 150 },
] as const;

function Crumbs() {
  return (
    <g aria-hidden>
      {CRUMBS.map((crumb, index) => (
        <circle
          key={index}
          cx={crumb.x}
          cy={crumb.y}
          r={crumb.r}
          fill="currentColor"
          className="animate-crumb"
          style={
            {
              "--crumb-x": crumb.dx,
              "--crumb-y": crumb.dy,
              animationDelay: `${crumb.delay}ms`,
              // Without this the percentage transform-origin resolves
              // against the whole SVG viewport rather than the crumb.
              transformBox: "fill-box",
              transformOrigin: "center",
            } as React.CSSProperties
          }
        />
      ))}
    </g>
  );
}

function NavIcon({ id, active }: { id: TabId; active: boolean }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none" } as const;
  const filled = active ? "currentColor" : "transparent";

  if (id === "home")
    return (
      <svg {...common} aria-hidden>
        <path
          d="M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-9.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          fill={filled}
          className={MOTION}
        />
      </svg>
    );

  // A bagel, which splits down the middle when this is the tab you're on.
  //
  // Two drawings crossfading rather than one that opens: a half-ring has to
  // be stroked along its flat edge, so a single pair sitting closed shows a
  // seam top and bottom and reads as a power symbol. The whole ring carries
  // the resting state, the halves carry the split, and they trade places as
  // the halves part.
  if (id === "menu")
    return (
      <svg {...common} aria-hidden>
        <g className={MOTION} style={{ opacity: active ? 0 : 1 }}>
          <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="1.6" />
        </g>
        <g
          className={MOTION}
          style={{
            opacity: active ? 1 : 0,
            transform: active ? "translateX(-1.7px)" : "none",
          }}
        >
          <path
            d="M12 3.6A8.4 8.4 0 0 0 12 20.4V15.4a3.4 3.4 0 0 1 0-6.8Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
            fill="currentColor"
          />
        </g>
        <g
          className={MOTION}
          style={{
            opacity: active ? 1 : 0,
            transform: active ? "translateX(1.7px)" : "none",
          }}
        >
          <path
            d="M12 3.6A8.4 8.4 0 0 1 12 20.4V15.4a3.4 3.4 0 0 0 0-6.8Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
            fill="currentColor"
          />
        </g>
        {active ? <Crumbs /> : null}
      </svg>
    );

  if (id === "reorder")
    return (
      <svg {...common} aria-hidden>
        <path
          d="M12 20s-7.4-4.6-7.4-9.6a4.2 4.2 0 0 1 7.4-2.7 4.2 4.2 0 0 1 7.4 2.7c0 5-7.4 9.6-7.4 9.6Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          fill={filled}
          className={MOTION}
        />
      </svg>
    );

  // The lid lifts and tilts off the box when this tab is the one you're on.
  if (id === "gift")
    return (
      <svg {...common} aria-hidden>
        <rect
          x="4.6"
          y="11.6"
          width="14.8"
          height="9"
          rx="1.2"
          stroke="currentColor"
          strokeWidth="1.6"
          fill={filled}
          className={MOTION}
        />
        <path d="M12 11.6V20.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <g
          className={MOTION}
          style={{
            transform: active ? "translateY(-2.6px) rotate(-9deg)" : "none",
            transformOrigin: "12px 10px",
          }}
        >
          <rect
            x="3.4"
            y="8"
            width="17.2"
            height="3.6"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.6"
            fill={filled}
            className={MOTION}
          />
          <path
            d="M12 8S10.9 3.4 8.6 3.4a2.2 2.2 0 0 0 0 4.4h6.8a2.2 2.2 0 0 0 0-4.4C13.1 3.4 12 8 12 8Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    );

  return (
    <svg {...common} aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="8.4"
        stroke="currentColor"
        strokeWidth="1.6"
        fill={filled}
        className={MOTION}
      />
      <path
        d="M12 11v5.4"
        stroke={active ? PALETTE.cream : "currentColor"}
        strokeWidth="1.6"
        strokeLinecap="round"
        className={MOTION}
      />
      <circle
        cx="12"
        cy="7.9"
        r="1"
        fill={active ? PALETTE.cream : "currentColor"}
        className={MOTION}
      />
    </svg>
  );
}

export default function TabBar({ active }: { active: TabId }) {
  // Reorder means "sign in so you can reorder" until you have; after that it
  // means your account, where the usuals and the history actually are.
  // Sending someone who's already signed in back to a login screen is the
  // one thing this tab must not do.
  const account = useAccount();

  return (
    <nav
      className="shrink-0 border-t pb-[env(safe-area-inset-bottom)]"
      style={{ backgroundColor: cream, borderColor: border, fontFamily: SHOP_FONT }}
      aria-label="Primary"
    >
      <ul className="m-0 flex list-none items-stretch justify-around p-0 px-2 pt-[9px]">
        {NAV.map((item) => {
          const href =
            item.id === "reorder" && account ? "/shop/account" : item.href;
          const isActive = item.id === active;
          const tone = isActive ? olive : TAB_REST;
          const body = (
            <>
              <NavIcon id={item.id} active={isActive} />
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
