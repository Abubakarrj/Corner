"use client";

import { useEffect, useRef } from "react";
import { SHOP_EMAIL } from "../../shopFacts";
import { PALETTE, SHOP_FONT } from "../../shop/shopControls";
import type { StoreLocation } from "./locations";

const { cream, surface, olive, onOlive, muted, controlBorder } = PALETTE;

// Catering doesn't go through the basket.
//
// A catering order is a conversation — headcount, date, what's in the tray,
// how it gets there — and none of that fits a checkout that takes a quantity
// and a bagel kind. So choosing a shop under Catering opens this instead of
// the menu, and hands the visitor a pre-addressed email rather than a form
// nobody is on the other end of.
//
// mailto rather than a form on purpose: it needs no backend, the reply lands
// in a thread the shop already reads, and the visitor keeps a copy of what
// they asked for.
export default function CateringModal({
  location,
  onClose,
}: {
  location: StoreLocation | null;
  onClose: () => void;
}) {
  const open = location !== null;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // The subject is the store's address so the shop can tell at a glance which
  // counter is being asked, without opening the mail.
  const mailto = location
    ? `mailto:${SHOP_EMAIL}?subject=${encodeURIComponent(
        `${location.address}, ${location.city}`,
      )}&body=${encodeURIComponent(
        "Hello, looking to place a catering order for pickup",
      )}`
    : "#";

  return (
    <div
      inert={!open}
      // Above Leaflet, not just above the page. Leaflet gives its own panes
      // and controls z-indexes in the 400–800 range and the map's card rail
      // sits at 500, so a modal in the app's usual 150–220 band renders
      // underneath the very screen it was opened from.
      className={`fixed inset-0 z-[1200] flex items-end justify-center transition-opacity duration-200 sm:items-center ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      style={{ fontFamily: SHOP_FONT }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/35"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Catering"
        tabIndex={-1}
        className={`relative w-full max-w-[420px] rounded-t-3xl px-6 pb-[calc(28px+env(safe-area-inset-bottom))] pt-7 outline-none transition-transform duration-200 ease-out sm:rounded-3xl sm:pb-8 ${
          open ? "translate-y-0" : "translate-y-6"
        }`}
        style={{ backgroundColor: surface }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-[#EFEBDD]"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path
              d="M4.5 4.5l9 9M13.5 4.5l-9 9"
              stroke={muted}
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <TrayIllustration />

        <p
          className="m-0 mt-5 text-[22px] font-medium leading-[1.2] tracking-[-0.01em]"
          style={{ color: olive }}
        >
          Catering, Right Around the Corner
        </p>
        <p className="m-0 mt-3 text-[14px] leading-[1.55]" style={{ color: muted }}>
          Bagels, spreads, and sandwiches for office mornings, meetings,
          celebrations, and everything in between.
        </p>
        <p className="m-0 mt-3 text-[14px] leading-[1.55]" style={{ color: muted }}>
          Catering packages start at 10 guests.
        </p>

        <a
          href={mailto}
          style={{ backgroundColor: olive, color: onOlive }}
          className="mt-7 block cursor-pointer rounded-full py-4 text-center text-[16px] font-medium transition-opacity hover:opacity-90"
        >
          Request Catering
        </a>

        <p className="m-0 mt-3 text-center text-[12px]" style={{ color: muted }}>
          Opens an email to {SHOP_EMAIL}.
        </p>
      </div>
    </div>
  );
}

// A tray of bagels, in the same stroke language as the tab-bar icons.
function TrayIllustration() {
  return (
    <svg
      width="104"
      height="104"
      viewBox="0 0 104 104"
      fill="none"
      aria-hidden
      className="mx-auto block"
    >
      <circle cx="52" cy="52" r="48" fill={cream} />
      <g stroke={olive} strokeWidth="3">
        <circle cx="38" cy="42" r="11" fill={surface} />
        <circle cx="38" cy="42" r="4" fill={cream} />
        <circle cx="64" cy="42" r="11" fill={surface} />
        <circle cx="64" cy="42" r="4" fill={cream} />
        <circle cx="51" cy="58" r="11" fill={surface} />
        <circle cx="51" cy="58" r="4" fill={cream} />
      </g>
      <g stroke={olive} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 70h56l-4 8H28l-4-8Z" fill={PALETTE.sage} />
      </g>
      <circle cx="52" cy="52" r="48" stroke={controlBorder} strokeWidth="2" fill="none" />
    </svg>
  );
}
