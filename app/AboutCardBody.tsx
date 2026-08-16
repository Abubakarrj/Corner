"use client";

import BagelMark from "./BagelMark";
import { useT } from "./i18n";
import { SHOP_EMAIL } from "./shopFacts";

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

      {/* ——— Four paragraphs, and they stay four ———

          These were cut to two once, under a sweep for narrative copy across
          the app. That sweep was right about the rest of the app and wrong
          here. This is the About card: narrative is not padding on a page
          whose entire job is to say who the shop is, it is the content. A
          sentence like "we're honored that you chose to spend a small part of
          your day with us" would be filler above a form and is the point of
          this card.

          If something on this card ever needs shortening, shorten it for
          being badly written, not for being a story. */}
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
      {/* The email, and only the email. The phone was here for a moment and
          came back off: this card is the shop's story, and the number belongs
          where somebody is trying to reach the counter about something —
          the store sheet, the order tracker, Riley's dead ends. Putting it in
          the middle of the About copy is an invitation to ring during a
          breakfast rush to ask a question the page just answered.

          self-center is load-bearing, not tidying. This card is a flex column,
          so a link in it stretches to the column's full width by default —
          measured at 342px on a 390px phone for an address that draws about
          165. That made the mailto a full-width tap band running under the
          bagel icon, which is how a tap aimed at a 16px bagel opened an email.
          Sized to its own text, it ends 48px short of the icon's column. */}
      <a
        href={`mailto:${SHOP_EMAIL}`}
        className="cb-press self-center underline whitespace-nowrap"
      >
        {SHOP_EMAIL}
      </a>

      {/* The bagel, on phones only.
          Above sm it's the fixed corner mark instead, which has room there and
          lands 20px clear of this card. On a phone it has no such place to
          stand, so it comes into the flow and takes its distance from the
          email as layout rather than as luck — 2em of margin, the same in
          every language, because it is measured from the line above it and not
          from the viewport. See CornerBagelIcon for the measurements. */}
      <BagelMark className="mt-[2em] self-center sm:hidden" />
    </>
  );
}
