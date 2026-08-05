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
  color: "#000000",
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
        Right Around The Corner
      </p>

      <p
        className="m-0 mx-auto mb-[1em] leading-[1.7] sm:leading-[1.8]"
        style={bodyStyle}
      >
        Corner Bagel was created with the belief that the best neighborhood
        places are simple, thoughtful, and made to be part of everyday life. We
        bring together naturally fermented, kettle-boiled bagels, house-made
        spreads, carefully sourced ingredients, and genuine hospitality to
        create food that&rsquo;s satisfying without being complicated.
      </p>
      <p
        className="m-0 mx-auto mb-[1em] leading-[1.7] sm:leading-[1.8]"
        style={bodyStyle}
      >
        Our menu is intentionally focused. Rather than offering everything, we
        choose to do a handful of things exceptionally well. Every bagel,
        sandwich, and spread is prepared with care so you can enjoy a meal that
        feels both familiar and memorable.
      </p>
      <p
        className="m-0 mx-auto mb-[1em] leading-[1.7] sm:leading-[1.8]"
        style={bodyStyle}
      >
        Whether you&rsquo;re grabbing breakfast before work, meeting a friend
        over coffee, or bringing a dozen bagels home to your family, we&rsquo;re
        honored that you chose to spend a small part of your day with us.
      </p>
      <p
        className="m-0 mx-auto mb-[2em] leading-[1.7] sm:leading-[1.8]"
        style={bodyStyle}
      >
        Thank you for supporting a neighborhood business. We look forward to
        welcoming you back, right around the corner.
      </p>

      <p className="m-0 mb-[0.3em] whitespace-nowrap">
        To speak with a member of our team:
      </p>
      <a
        href="mailto:cornerbagel@publicentity.co"
        className="underline whitespace-nowrap"
      >
        cornerbagel@publicentity.co
      </a>
    </>
  );
}
