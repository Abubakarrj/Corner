"use client";

import { useT } from "../../i18n";
import CardBrandMark from "./CardBrandMark";
import type { CardBrand } from "./card";

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
// ——— Marks rather than words ———
//
// This row was three bordered text pills reading "Visa" "Mastercard" "Amex",
// which is a list of words and reads as one. People scan a checkout for the
// shape of their own card, and the marks answer that in a glance where a word
// has to be parsed — the processor's own card field shows the mark a few
// pixels above, so words here made one payment sheet look like two.
//
// See CardBrandMark.tsx for why they are drawn here rather than fetched, and
// for what that file will and will not copy.
//
// ⚠️ The name goes with each mark, in sr-only text. This row is the only place
// the payment step says which cards are taken, and a picture is not a sentence
// — leaving the marks as decoration would have deleted the whole statement for
// anybody using a screen reader.
const BRANDS: { brand: CardBrand; name: string }[] = [
  { brand: "visa", name: "Visa" },
  { brand: "mastercard", name: "Mastercard" },
  { brand: "amex", name: "Amex" },
];

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
      {/* A list, because it is one: these are the cards this shop takes, and a
          screen reader should hear three items rather than a run-on line. */}
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {BRANDS.map(({ brand, name }) => (
          <li key={brand} className="flex">
            {/* The hairline keeps the white marks from floating on a pale
                ground. It is the same border the pills had, now doing a job:
                a Mastercard tile on cream has no edge of its own. */}
            <span className="flex overflow-hidden rounded-[4px] ring-1 ring-line-soft">
              <CardBrandMark brand={brand} />
            </span>
            <span className="sr-only">{name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
