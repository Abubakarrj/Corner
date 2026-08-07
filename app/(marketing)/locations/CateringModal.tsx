"use client";

import { SHOP_EMAIL } from "../../shopFacts";
import { useLocale, useT } from "../../i18n";
import { localeById, type Locale } from "../../localeScript";
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
  const locale = localeById(useLocale());
  const mailto = location
    ? cateringMailto(location, locale, t("catering.emailBody"))
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

// The mail is written in the language the visitor has the app in, not in
// English.
//
// Somebody who has read the whole site in Korean and pressed a Korean button
// should not have a draft open in English — that's the moment the translation
// stops being real. The shop's mail provider translates incoming mail for
// them, so the cost lands where it can be absorbed and the benefit lands on
// the person doing the writing.
//
// The subject keeps the address as written — it's how a courier and a map find
// the place, and translating it makes it worse in every language including the
// one it's in — and adds the language after it, so the shop knows which one to
// reply in before opening the mail.
//
// The body is a short form rather than one sentence, because a catering
// enquiry that arrives without a headcount or a date is a round trip, and the
// labels are the part a translation actually helps with.
//
// Exported and pure so it can be checked without a running map: this sheet
// only ever opens off the card rail, which needs a basemap to exist.
export function cateringMailto(
  location: Pick<StoreLocation, "address" | "city">,
  locale: Locale,
  body: string,
): string {
  const where = `${location.address}, ${location.city}`;
  const subject =
    locale.id === "en" ? where : `${where} · ${locale.native} (${locale.english})`;
  return (
    `mailto:${SHOP_EMAIL}?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`
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
