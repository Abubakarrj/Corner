"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { PALETTE, SHOP_FONT } from "../../shop/shopControls";

const { cream, surface, olive, onOlive, controlBorder, muted, sage } = PALETTE;

// The sheet that comes up when a gift card is tapped. Built to the reference:
// an illustration, a line asking you to sign in, a filled primary button, and
// a quieter guest link under it.
//
// What's behind each door, honestly:
//
//   Join or sign in    goes to /membership, which is a real screen. Nothing
//                      authenticates yet (see the note in MembershipForm),
//                      but it's a destination rather than a dead end.
//
//   Continue as guest  closes this and leaves you on the gallery. There is no
//                      gifting flow to continue into — issuing a card, taking
//                      payment, storing a balance and redeeming against it are
//                      all unbuilt — so it does the one thing it can do
//                      truthfully. Once amount-and-recipient exists, this is
//                      where it gets wired in.
export default function GiftAuthModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    // Move focus into the sheet so a keyboard or screen reader lands on it
    // rather than staying behind on the card that opened it.
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    // Always mounted so it can animate closed as well as open; inert keeps
    // focus and clicks out of it the rest of the time.
    <div
      inert={!open}
      className={`fixed inset-0 z-[180] flex items-end justify-center transition-opacity duration-200 sm:items-center ${
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
        aria-label="Sign in to continue gifting"
        tabIndex={-1}
        className={`relative w-full max-w-[420px] rounded-t-3xl px-6 pb-[calc(28px+env(safe-area-inset-bottom))] pt-8 outline-none transition-transform duration-200 ease-out sm:rounded-3xl sm:pb-8 ${
          open ? "translate-y-0" : "translate-y-6"
        }`}
        style={{ backgroundColor: surface }}
      >
        <GiftIllustration />

        <p
          className="m-0 mt-6 text-center text-[21px] font-medium leading-[1.2] tracking-[-0.01em]"
          style={{ color: olive }}
        >
          Sign in to continue gifting
        </p>
        <p
          className="m-0 mt-2.5 text-center text-[14px] leading-[1.5]"
          style={{ color: muted }}
        >
          We&rsquo;ll keep your card with your account, so you can send it,
          resend it, and see when it&rsquo;s opened.
        </p>

        <Link
          href="/membership"
          style={{ backgroundColor: olive, color: onOlive }}
          className="mt-7 block cursor-pointer rounded-full py-4 text-center text-[16px] font-medium transition-opacity hover:opacity-90"
        >
          Join or sign in
        </Link>

        <button
          type="button"
          onClick={onClose}
          className="mx-auto mt-5 block cursor-pointer text-[14px] underline underline-offset-2 transition-opacity hover:opacity-70"
          style={{ color: muted }}
        >
          Continue as guest
        </button>
      </div>
    </div>
  );
}

// A gift box with a bagel where the bow would be — drawn in the same stroke
// language as the tab-bar icons so it belongs to this app rather than looking
// like clip art dropped in.
function GiftIllustration() {
  return (
    <svg
      width="112"
      height="112"
      viewBox="0 0 112 112"
      fill="none"
      aria-hidden
      className="mx-auto block"
    >
      <circle cx="56" cy="56" r="52" fill={cream} />
      <g stroke={olive} strokeWidth="3" strokeLinejoin="round">
        <rect x="30" y="58" width="52" height="30" rx="4" fill="none" />
        <rect x="26" y="47" width="60" height="12" rx="3" fill={sage} />
        <path d="M56 59v29" strokeLinecap="round" />
      </g>
      <g stroke={olive} strokeWidth="3">
        <circle cx="56" cy="33" r="14" fill={surface} />
        <circle cx="56" cy="33" r="5" fill={cream} />
      </g>
      {/* Sesame, so it's unmistakably ours. */}
      <g fill={olive}>
        <circle cx="49" cy="26" r="1.4" />
        <circle cx="63" cy="27" r="1.4" />
        <circle cx="46" cy="36" r="1.4" />
        <circle cx="66" cy="35" r="1.4" />
        <circle cx="56" cy="22.5" r="1.4" />
      </g>
      <circle cx="56" cy="56" r="52" stroke={controlBorder} strokeWidth="2" fill="none" />
    </svg>
  );
}
