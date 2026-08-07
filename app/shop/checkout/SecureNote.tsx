"use client";

import { useT } from "../../i18n";

// The lock line and the card marks under the payment step.
//
// The reference has both, and they are the two things that make a payment
// sheet feel like one rather than like a form. Ours says something slightly
// different from theirs, and the difference is the point: "your payment info
// is encrypted" is a claim about transport that every site can make, and
// almost meaningless. Ours is a claim about architecture — the card is entered
// in the processor's own element and never reaches our servers, so there is
// nothing on our side to leak. That happens to be true, which is why it's
// worth saying.
//
// The marks are drawn rather than fetched. Real card-brand logos are
// trademarked artwork with usage rules, and three <img> tags to a CDN on the
// payment step is three more requests and three more things that can fail to
// load at the worst moment. These read as "we take these" without pretending
// to be the logos.
const BRANDS = ["Visa", "Mastercard", "Amex"];

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden className="shrink-0">
      <rect
        x="2.6"
        y="6"
        width="8.8"
        height="6.2"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M4.7 6V4.4a2.3 2.3 0 0 1 4.6 0V6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function SecureNote() {
  const t = useT();
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 flex items-start gap-1.5 text-[11px] leading-[1.45] text-quiet">
        <span className="mt-[2px]">
          <LockIcon />
        </span>
        {t("checkout.secure")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {BRANDS.map((brand) => (
          <span
            key={brand}
            className="rounded-md border border-line-soft px-1.5 py-[3px] text-[10px] font-medium leading-none text-muted"
          >
            {brand}
          </span>
        ))}
      </div>
    </div>
  );
}
