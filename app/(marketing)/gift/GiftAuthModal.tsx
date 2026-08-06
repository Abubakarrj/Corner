"use client";

import Link from "next/link";
import { useT } from "../../i18n";
import Modal from "../../ui/Modal";
import { ButtonLink } from "../../ui/Button";
import { PALETTE } from "../../shop/shopControls";

const { cream, surface, olive, controlBorder, sage } = PALETTE;

// The sheet that comes up when a gift card is tapped, and when Redeem now is.
// Built to the reference: an illustration, a line asking you to sign in, a
// filled primary button, and a quieter guest link under it.
//
// Both doors need an account, so both land here — only the copy differs, and
// only enough to answer "why am I being asked to sign in": buying a card and
// redeeming one are different errands and the sheet should say which it
// thinks you're on.
//
// What's behind each door, honestly:
//
//   {t("account.joinOrSignIn")}    goes to /membership, which is a real screen. Nothing
//                      authenticates yet (see the note in MembershipForm),
//                      but it's a destination rather than a dead end.
//
//   {t("gift.continueAsGuest")}  goes on to the purchase flow when there is one to go
//                      on to (`guestHref`), and otherwise closes the sheet.
//                      Redeeming still has nowhere to continue to: reading a
//                      card's balance needs Toast's gift card API, so that
//                      door closes rather than pretending.
export type GiftIntent = "send" | "redeem";

const COPY: Record<GiftIntent, { label: string; heading: string; lede: string }> = {
  send: {
    label: "Sign in to keep this gift card",
    heading: "Sign in to continue gifting",
    lede: "Excellent choice, let\u2019s get that into your account.",
  },
  redeem: {
    label: "Sign in to redeem a gift card",
    heading: "Sign in to redeem",
    lede: "Gift card redeem coming right up!",
  },
};

export default function GiftAuthModal({
  open,
  onClose,
  intent = "send",
  guestHref,
}: {
  open: boolean;
  onClose: () => void;
  intent?: GiftIntent;
  // Where "continue as guest" leads, when it leads anywhere.
  guestHref?: string;
}) {
  const t = useT();
  const copy = COPY[intent];

  return (
    // No z override. This used to sit at 180, which put it under the cookie
    // consent bar — a sheet that something else can paint over is not a
    // modal. Modal's default 1200 is the top of the stack.
    <Modal open={open} onClose={onClose} label={copy.label}>
      <GiftIllustration />

      <p className="m-0 mt-5 text-center text-[20px] font-medium leading-[1.25] tracking-[-0.01em] text-ink">
        {copy.heading}
      </p>
      <p className="m-0 mt-2 text-center text-[14px] leading-[1.5] text-muted">
        {copy.lede}
      </p>

      <ButtonLink href="/membership" block className="mt-6">
        {t("account.joinOrSignIn")}
      </ButtonLink>

      {guestHref ? (
        <Link
          href={guestHref}
          className="cb-press mx-auto mt-4 block cursor-pointer text-center text-[14px] text-muted underline underline-offset-2 hover:text-ink"
        >
          {t("gift.continueAsGuest")}
        </Link>
      ) : (
      <button
        type="button"
        onClick={onClose}
        className="cb-press mx-auto mt-4 block cursor-pointer text-[14px] text-muted underline underline-offset-2 hover:text-ink"
      >
        {t("gift.continueAsGuest")}
      </button>
      )}
    </Modal>
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
