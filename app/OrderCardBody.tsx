// This card used to hold a handful of short one-line facts ("No Online
// Ordering", a partner-location list), sized by shrinking to fit the widest
// single line. It now holds running paragraph copy instead — the same kind
// of content /about carries — so it's sized and wrapped the same way that
// page is: a continuous clamp between a comfortable phone floor and a
// desktop ceiling, rather than measured off any one line.
//
// 13px on a phone, growing to 17px by desktop width. See app/about/page.tsx
// for the full reasoning; kept in step with its FONT_SIZE by eye since nothing
// here imports the other.
const cardFontSize = "clamp(13px, 0.44vw + 11.35px, 17px)";

// The text style the order card is measured and rendered with. Exported so
// /about can render its own paragraph in the same typeface, weight and
// colour (it overrides fontSize itself, since its copy is longer).
export const orderTextStyle = {
  fontFamily: "var(--font-geist-sans), sans-serif",
  fontWeight: 400,
  fontSize: cardFontSize,
  lineHeight: "100%",
  letterSpacing: "-0.03em",
  color: "#000000",
} as const;

// The style of the card's close link, used on /about (this card has no
// close link of its own). 7/8 of the body text, the ratio it had at desktop
// size (14/16), so it shrinks in step with the rest of the card.
export const closeStyle = {
  fontFamily: "var(--font-geist-sans), sans-serif",
  fontWeight: 400,
  fontSize: `calc(${cardFontSize} * 0.875)`,
  lineHeight: "100%",
  letterSpacing: "-0.02em",
  textDecoration: "underline",
  textDecorationStyle: "solid" as const,
  color: "#2D2D2D",
  opacity: "0.4"
};

// Running copy wants more air than a heading's tight 100% leading and
// -0.03em tracking allow — those are display settings that make a paragraph
// hard to follow. Same measure as /about's paragraph (30em, ~55 characters a
// line) so a centred line stays comfortable to read.
const bodyStyle = {
  letterSpacing: "-0.005em",
  maxWidth: "30em",
};

// The order card's content — every child that gives the card its size — but
// NOT the corner icon. Both the real order page and the icon overlay render
// this, so they always share identical dimensions.
export default function OrderCardBody() {
  return (
    <>
      <p
        className="m-0 mb-[0.75em] whitespace-nowrap"
        style={{ fontWeight: 700, fontSize: `calc(${cardFontSize} * 1.35)` }}
      >
        Right Around The Corner
      </p>

      {/* text-pretty stops the browser leaving a one-word last line, which is
          what makes a centred paragraph look ragged. */}
      <p
        className="m-0 mx-auto mb-[1em] text-pretty leading-[1.7] sm:leading-[1.8]"
        style={bodyStyle}
      >
        Corner Bagel brings East Coast bagel craftsmanship to a laid-back
        way of life.
      </p>
      <p
        className="m-0 mx-auto mb-[1em] text-pretty leading-[1.7] sm:leading-[1.8]"
        style={bodyStyle}
      >
        Our bagels are naturally fermented, kettle-boiled bagels baked for a
        crisp crust and chewy interior.
      </p>
      <p
        className="m-0 mx-auto mb-[2em] text-pretty leading-[1.7] sm:leading-[1.8]"
        style={bodyStyle}
      >
        We source fresh produce from local farmers markets and pair it with
        thoughtfully selected ingredients, house-made spreads, and seasonal
        flavors. Simple, intentional, and made fresh, right around the
        corner.
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
