import type { CardBrand } from "./card";

// The card networks' acceptance marks, drawn.
//
// ——— Why these replaced three words in boxes ———
//
// The row under the payment step used to be "Visa" "Mastercard" "Amex" as
// bordered text pills, which is a list of words and reads as one. A card mark
// is recognised before it is read: people scan a checkout for the shape of
// their own card, and two overlapping circles or a blue tile answers that in a
// glance where a word has to be parsed. The processor's own card field does
// exactly this a few pixels above, and a payment sheet that says "Mastercard"
// in one place and shows the circles in another looks like two sheets.
//
// ——— ⚠️ Drawn here, not fetched, and not traced ———
//
// These are registered trademarks of the networks. What they are used for here
// is the thing trademarks exist for: telling a customer which cards this shop
// takes, which is the acceptance use the networks publish artwork for and ask
// merchants to make. Every one below is drawn from primitives in this file — a
// circle, a rectangle, a letterform set in a system face — in each network's
// published colours. None of it is traced from, converted from, or copied out
// of anybody's asset pack, including the processor's.
//
// That is deliberate rather than lazy. Approximated marks are honest about
// being ours; a pixel-exact copy of licensed artwork on a page that never
// agreed to the licence is not. If this shop ever wants the exact marks, each
// network runs a brand centre that issues them under terms somebody signs, and
// this file is the one place to swap.
//
// They are also not <img> tags to a CDN. Three requests on the payment step is
// three more things that can fail at the worst possible moment, and a checkout
// that renders a broken-image icon where a card logo goes is a checkout people
// close.
//
// ——— The Visa and Amex letterforms ———
//
// Both marks are wordmarks in custom typefaces this app does not have and
// could not embed. They are set in the platform's own bold sans, tightened,
// which reads as the brand at 20px without pretending to be the licensed
// drawing of it. Mastercard's circles need no typeface and are the mark
// itself, so that one is exact.

/** 32×20, the proportions of a card. Small enough for a row of them under a
 *  form, large enough that the Mastercard circles do not merge. */
const W = 32;
const H = 20;

/** A system face, named the way Square's own fields name theirs: one family,
 *  no stack. An SVG <text> falls back on its own if the family is missing. */
const FACE = "Helvetica, Arial, sans-serif";

function Tile({ fill, children }: { fill: string; children: React.ReactNode }) {
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      // Decorative. Every caller states the brand in text of its own — see the
      // sr-only span in SecureNote — because a row of marks is the only place
      // some screens say which cards are taken, and a picture is not a
      // sentence.
      aria-hidden
      className="shrink-0"
    >
      <rect x="0" y="0" width={W} height={H} rx="3" fill={fill} />
      {children}
    </svg>
  );
}

// #1434CB is Visa's published blue.
function Visa() {
  return (
    <Tile fill="#1434CB">
      <text
        x={W / 2}
        y={H / 2 + 4}
        textAnchor="middle"
        fontFamily={FACE}
        fontSize="10"
        fontWeight="700"
        fontStyle="italic"
        letterSpacing="0.4"
        fill="#FFFFFF"
      >
        VISA
      </text>
    </Tile>
  );
}

// The two circles, in Mastercard's published red and yellow, with the overlap
// in the orange the two make. This is the mark rather than an impression of
// it: it is two circles and their intersection, and there is nothing in it to
// approximate.
function Mastercard() {
  return (
    <Tile fill="#FFFFFF">
      <circle cx="12.5" cy="10" r="6.2" fill="#EB001B" />
      <circle cx="19.5" cy="10" r="6.2" fill="#F79E1B" />
      {/* The intersection, and the two crossing points are computed rather
          than eyeballed: the circles sit 7 apart at radius 6.2, so they meet
          at x = 16, y = 10 ± √(6.2² − 3.5²) = 10 ± 5.12. Guessing puts the
          blend a pixel off the overlap, which at this size shows as a seam. */}
      <path d="M16 4.88A6.2 6.2 0 0 1 16 15.12 6.2 6.2 0 0 1 16 4.88Z" fill="#FF5F00" />
    </Tile>
  );
}

// #006FCF is American Express's published blue. "AMEX" rather than the full
// name: the mark is a blue box with white type in it, and "AMERICAN EXPRESS"
// set across 32px is a grey smear.
function Amex() {
  return (
    <Tile fill="#006FCF">
      <text
        x={W / 2}
        y={H / 2 + 3.5}
        textAnchor="middle"
        fontFamily={FACE}
        fontSize="8.5"
        fontWeight="700"
        letterSpacing="0.2"
        fill="#FFFFFF"
      >
        AMEX
      </text>
    </Tile>
  );
}

// Discover's mark is its name beside an orange sphere. At this size the name
// alone is unreadable, so it is the sphere plus a shortened word — the same
// compromise every card row on the web makes.
function Discover() {
  return (
    <Tile fill="#FFFFFF">
      <text
        x="3"
        y={H / 2 + 3}
        fontFamily={FACE}
        fontSize="7"
        fontWeight="700"
        letterSpacing="-0.2"
        fill="#1D1C19"
      >
        DISC
      </text>
      <circle cx="26" cy="10" r="4.6" fill="#F76B1C" />
    </Tile>
  );
}

/** The mark for a brand, or nothing at all.
 *
 *  ⚠️ Nothing, deliberately, for a brand with no mark here. The alternative is
 *  a grey rectangle standing in for a card, which on a payment step reads as an
 *  image that failed to load — and the caller showing this has already decided
 *  a picture is worth space, not that a placeholder is. */
export default function CardBrandMark({ brand }: { brand: CardBrand }) {
  switch (brand) {
    case "visa":
      return <Visa />;
    case "mastercard":
      return <Mastercard />;
    case "amex":
      return <Amex />;
    case "discover":
      return <Discover />;
    default:
      return null;
  }
}
