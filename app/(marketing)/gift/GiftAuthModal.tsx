"use client";

import Modal from "../../ui/Modal";
import { ButtonLink } from "../../ui/Button";
import { PALETTE } from "../../shop/shopControls";

const { cream, surface, olive, controlBorder, sage } = PALETTE;

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
  return (
    <Modal open={open} onClose={onClose} label="Sign in to keep this gift card" z={180}>
      <GiftIllustration />

      <p className="m-0 mt-5 text-center text-[20px] font-medium leading-[1.25] tracking-[-0.01em] text-ink">
        Sign in to continue gifting
      </p>
      <p className="m-0 mt-2 text-center text-[14px] leading-[1.5] text-muted">
        Excellent choice, let&rsquo;s get that into your account.
      </p>

      <ButtonLink href="/membership" block className="mt-6">
        Join or sign in
      </ButtonLink>

      <button
        type="button"
        onClick={onClose}
        className="cb-press mx-auto mt-4 block cursor-pointer text-[14px] text-muted underline underline-offset-2 hover:text-ink"
      >
        Continue as guest
      </button>
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
