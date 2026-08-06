"use client";

import { SHOP_EMAIL } from "../../shopFacts";
import { useT } from "../../i18n";
import Modal from "../../ui/Modal";
import { ButtonAnchor } from "../../ui/Button";
import { PALETTE } from "../../shop/shopControls";
import type { StoreLocation } from "./locations";

const { cream, surface, olive, controlBorder } = PALETTE;

// Catering doesn't go through the basket.
//
// A catering order is a conversation — headcount, date, what's in the tray,
// how it gets there — and none of that fits a checkout that takes a quantity
// and a bagel kind. So the flow is: pick the shop you want catering from,
// then press Order on its card, and this opens instead of the menu, handing
// the visitor a pre-addressed email rather than a form nobody is on the other
// end of.
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
  const t = useT();
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
    <Modal open={location !== null} onClose={onClose} label={t("catering.title")}>
      <TrayIllustration />

      <p className="m-0 mt-5 text-[21px] font-medium leading-[1.2] tracking-[-0.01em] text-ink">
        {t("catering.heading")}
      </p>
      <p className="m-0 mt-3 text-[14px] leading-[1.55] text-muted">
        {t("catering.blurb")}
      </p>
      <ButtonAnchor href={mailto} block className="mt-6">
        {t("catering.request")}
      </ButtonAnchor>

      <p className="m-0 mt-3 text-center text-[12px] text-muted">
        {t("catering.minimum")}
      </p>
    </Modal>
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
