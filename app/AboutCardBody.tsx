"use client";

import { useT } from "./i18n";
import { SHOP_EMAIL, SHOP_PHONE, shopPhoneLabel } from "./shopFacts";

// This card used to hold a handful of short one-line facts ("No Online
// Ordering", a partner-location list), sized by shrinking to fit the widest
// single line. It now holds running paragraph copy instead, so it's sized
// and wrapped for that: a continuous clamp between a comfortable phone
// floor and a desktop ceiling, rather than measured off any one line.
//
// 13px on a phone, growing to 17px by desktop width.
const cardFontSize = "clamp(13px, 0.44vw + 11.35px, 17px)";

// The text style the about card is measured and rendered with.
export const aboutTextStyle = {
  fontFamily: "var(--font-geist-sans), sans-serif",
  fontWeight: 400,
  fontSize: cardFontSize,
  lineHeight: "100%",
  letterSpacing: "-0.03em",
  color: "var(--cb-heading)",
} as const;

// Running copy wants more air than a heading's tight 100% leading and
// -0.03em tracking allow — those are display settings that make a paragraph
// hard to follow. 30em (~55 characters a line) so a centred line stays
// comfortable to read.
//
// textWrap is pinned to "wrap" rather than left to `text-pretty`. Pretty is
// a hint, and browsers honour it differently: Chromium only reworks the last
// couple of lines, while Safari rebalances the whole paragraph and pulls
// every line in. That made the two paragraphs here — same max-width, same
// class list — render at visibly different measures on iOS, the first one
// running the full column and the second inset on both sides. Plain wrapping
// is the only way both fill the same column in every browser.
const bodyStyle = {
  letterSpacing: "-0.005em",
  maxWidth: "30em",
  textWrap: "wrap",
} as const;

// The about card's content — every child that gives the card its size.
export default function AboutCardBody() {
  const t = useT();
  return (
    <>
      {/* 1.15x the body size, down from 1.35x. The heading sat a third
          larger than the copy under it, which reads as a page title — but
          this is a short card, and the paragraphs are the content. Medium
          and a slight step up is enough separation at this length; the extra
          size was only making the block top-heavy. */}
      <p
        className="m-0 mb-[0.75em] whitespace-nowrap"
        style={{ fontWeight: 500, fontSize: `calc(${cardFontSize} * 1.15)` }}
      >
        {t("about.tagline")}
      </p>

      <p
        className="m-0 mx-auto mb-[1em] leading-[1.7] sm:leading-[1.8]"
        style={bodyStyle}
      >
        {t("about.p1")}
      </p>
      <p
        className="m-0 mx-auto mb-[1em] leading-[1.7] sm:leading-[1.8]"
        style={bodyStyle}
      >
        {t("about.p2")}
      </p>
      <p
        className="m-0 mx-auto mb-[1em] leading-[1.7] sm:leading-[1.8]"
        style={bodyStyle}
      >
        {t("about.p3")}
      </p>
      <p
        className="m-0 mx-auto mb-[2em] leading-[1.7] sm:leading-[1.8]"
        style={bodyStyle}
      >
        {t("about.p4")}
      </p>

      <p className="m-0 mb-[0.3em] whitespace-nowrap">
        {t("about.speakToTeam")}
      </p>
      {/* The phone first, because the line above says "speak" and an inbox is
          not speaking to anybody. The email stays underneath for the things
          that want a paper trail — catering, press, a privacy request. */}
      <a href={`tel:${SHOP_PHONE}`} className="underline whitespace-nowrap">
        {shopPhoneLabel()}
      </a>
      <a
        href={`mailto:${SHOP_EMAIL}`}
        className="mt-[0.2em] block underline whitespace-nowrap"
      >
        {SHOP_EMAIL}
      </a>
    </>
  );
}
