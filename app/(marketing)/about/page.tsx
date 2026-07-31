import Link from "next/link";
import { closeStyle, orderTextStyle } from "../../OrderCardBody";

// The same card as /order — one centred block on a white full-viewport page, in
// the order card's typeface, weight and colour — but sized on its own terms.
//
// The order card's font size is derived from its longest *unwrapped* line, so it
// keeps shrinking as the viewport narrows. This page is running copy: it wraps,
// so it must not shrink past the point where it is comfortable to read. Hence
// its own scale below, and its own spacing, both measured in em so the whole
// card still grows and shrinks as one.

// 13px on a phone, growing to 17px by desktop width. The floor is the smallest
// size body copy still reads at, and it keeps the card compact enough on a
// narrow screen that it never needs to scroll; the ceiling stops the lines
// getting heavier than the rest of the site on a wide monitor. It hits 13px at
// ~375px wide and reaches the cap at ~1290px, sliding between the two rather
// than jumping at a breakpoint.
const FONT_SIZE = "clamp(13px, 0.44vw + 11.35px, 17px)";

const cardStyle = {
  ...orderTextStyle,
  fontSize: FONT_SIZE,
};

// Running copy wants more air than the order card's one-liners: that card's
// tight 100% leading and -0.03em tracking are display settings that make a
// paragraph hard to follow. Leading relaxes on the wider screen, where lines are
// longest and the eye has furthest to travel back.
//
// The 30em cap is the measure — roughly 55 characters a line — which is short
// enough that centred text still reads comfortably. On a phone the viewport
// takes over well before that cap is reached.
const bodyStyle = {
  letterSpacing: "-0.005em",
  maxWidth: "30em",
};

export default function AboutPage() {
  return (
    // min-h-dvh, not h-screen: dvh follows a mobile browser's toolbars as they
    // come and go, and min- lets the card scroll rather than be clipped when it
    // cannot fit — a phone held sideways is the case that overflows.
    <div className="flex min-h-dvh w-full items-center justify-center bg-white px-6 py-12 sm:py-16">
      <div
        className="relative flex w-full max-w-xl flex-col text-center"
        style={cardStyle}
      >
        {/* text-pretty stops the browser leaving a one-word last line, which is
            what makes a centred paragraph look ragged. */}
        <p
          className="m-0 mx-auto mb-[2em] text-pretty leading-[1.7] sm:leading-[1.8]"
          style={bodyStyle}
        >
          Corner Bagel brings East Coast bagel craftsmanship to a laid-back
          way of life. We make naturally fermented, kettle-boiled bagels baked
          for a crisp crust and chewy interior. We source fresh produce from
          local farmers markets and pair it with thoughtfully selected
          ingredients, house-made spreads, and seasonal flavors. Simple,
          intentional, and made fresh, right around the corner.
        </p>

        {/* The link is small, so it gets a tap target of its own: inline-block
            plus vertical padding, and mx-auto to stay centred at that width. */}
        <Link
          href="/"
          className="mx-auto inline-block cursor-pointer whitespace-nowrap py-2 leading-none"
          style={{ ...closeStyle, fontSize: `calc(${FONT_SIZE} * 0.875)` }}
        >
          Close
        </Link>
      </div>
    </div>
  );
}
