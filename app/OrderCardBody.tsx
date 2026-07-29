// Every lin  e in the card is set with `whitespace-nowrap`, so the font size —
// not word wrapping — is what has to give way on a narrow screen.
//
// The card is `max-w-md` inside a `p-6` page, so the widest a line may ever be
// is `100vw - 48px` (capped at 448px by max-w-md). The longest line here,
// "To speak with a member of our team, please email:", measures about 22.1em in
// Geist at this tracking; dividing the available width by 23.5 leaves a small
// safety margin on top of that and still reaches the 16px ceiling by the time
// the viewport is ~425px wide.
//
// Change PAGE_PADDING here if the page's `p-6` changes, and raise the divisor
// if a longer line is ever added.
const PAGE_PADDING = 48; // p-6 on both sides of the page wrapper
const LONGEST_LINE_EM = 23.5;
const cardFontSize = `min(calc((100vw - ${PAGE_PADDING}px) / ${LONGEST_LINE_EM}), 16px)`;

// The text style the order card is measured and rendered with. Exported so the
// corner-icon overlay can render an invisible copy of this body at the exact
// same size, pinning the icon to the same spot on every page.
//
// The sizes scale continuously with the viewport instead of using breakpoint
// classes, so the card and the overlay can never drift apart.
export const orderTextStyle = {
  fontFamily: "var(--font-geist-sans), sans-serif",
  fontWeight: 400,
  fontSize: cardFontSize,
  lineHeight: "100%",
  letterSpacing: "-0.03em",
  color: "#000000",
} as const;

// The style of the card's close link. The order card itself no longer carries
// one — it is /about that closes — but the link is defined here so it stays in
// the order card's scale: 7/8 of the body text, the ratio it had at desktop
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

// The order card's content — every child that gives the card its size — but
// NOT the corner icon. Both the real order page and the icon overlay render
// this, so they always share identical dimensions.
export default function OrderCardBody() {
  return (
    <>
      {/* <p className="m-0 mb-[1.25em] whitespace-nowrap" style={{ fontWeight: 700 }}>Right Around The Corner.</p> */}
      <p className="m-0 mb-[0.3em] whitespace-nowrap" style={{ fontWeight: 700 }}>No Online Ordering</p>
      <p className="m-0 mb-[1.25em] whitespace-nowrap">Available currently at our partner locations</p>
      {/* Each item centers on its own — the list spans the full card width and
          every row is a centered flex line, so the shorter item is not pinned to
          the longer one's left edge. The markers are drawn by hand (list-none +
          a flex row) because the browser's own list marker leaves a gap that
          can't be tightened. */}
      <ul className="m-0 list-none mb-[1.25em]">
        <li className="flex justify-center items-baseline gap-[0.375em] mb-[0.3em] whitespace-nowrap">
          <span aria-hidden>•</span>TWSS Coffee Shop
        </li>
        <li className="flex justify-center items-baseline gap-[0.375em] whitespace-nowrap">
          <span aria-hidden>•</span>Horang Tea House
        </li>
      </ul>
      {/* At 22.1em (Geist, 400, this tracking) this is the widest line in the
          card, so it is what LONGEST_LINE_EM above is measured from: keep the
          two in step if the wording changes. Paired with the address below by
          the same tight 0.3em gap the heading above uses. */}
      <p className="m-0 mb-[0.3em] whitespace-nowrap">To speak with a member of our team:</p>
      <a
        href="mailto:cornerbagel@publicentity.co"
        className="underline whitespace-nowrap"
      >
        cornerbagel@publicentity.co
      </a>
    </>
  );
}
