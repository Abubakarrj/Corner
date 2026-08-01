// This card used to hold a handful of short one-line facts ("No Online
// Ordering", a partner-location list), sized by shrinking to fit the widest
// single line. It now holds running paragraph copy instead, so it's sized
// and wrapped for that: a continuous clamp between a comfortable phone
// floor and a desktop ceiling, rather than measured off any one line.
//
// 13px on a phone, growing to 17px by desktop width.
const cardFontSize = "clamp(13px, 0.44vw + 11.35px, 17px)";

// The text style the order card is measured and rendered with.
export const orderTextStyle = {
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
const bodyStyle = {
  letterSpacing: "-0.005em",
  maxWidth: "30em",
};

// The order card's content — every child that gives the card its size.
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
        className="m-0 mx-auto mb-[2em] text-pretty leading-[1.7] sm:leading-[1.8]"
        style={bodyStyle}
      >
        Corner Bagel brings East Coast bagel craftsmanship to a laid-back
        way of life. Our bagels are naturally fermented, kettle-boiled
        bagels baked for a crisp crust and chewy interior. We source fresh
        produce from local farmers markets and pair it with thoughtfully
        selected ingredients, house-made spreads, and seasonal flavors.
        Simple, intentional, and made fresh, right around the corner.
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
