// Stands in for product photography we don't have yet: a warm beige tile
// with a line icon on it, in the product's own swatch colour.
//
// ——— Icons, not initials ———
//
// The tile used to carry two large letters — "TP" for Tomato, Please. The
// icon says the same thing a menu photo would say first: this is a plate of
// food, this is a drink. A pair of letters says nothing until you have
// already read the name underneath, which is where the name is anyway.
//
// There are three of them rather than one per item, which is the trade the
// letters were making: every sandwich now wears the same fork and knife, so
// the tiles tell kinds apart rather than items. The swatch colour is what
// still separates two sandwiches from each other, and it is doing more work
// than it was — see the note on colour below.
//
// Drawn in the same 100x100 viewBox the letters used, so a stroke scales
// with the tile: the one component renders 44px chat thumbnails and the
// 320px product-page hero, and the line weight stays in proportion at both.
//
// Swap for a real <Image> once there are photos; every call site takes the
// same shape, so that swap is contained to this one file.

// Which glyph a category gets. Anything unlisted — a category added later,
// or a line item whose product has since left the menu — gets the fork and
// knife, since this is a food shop and that is the safe guess.
type Glyph = "food" | "drink" | "gift";

function glyphFor(category: string | undefined): Glyph {
  if (category === "Drinks") return "drink";
  if (category === "Gift Cards") return "gift";
  return "food";
}

// Stroke geometry, all of it centred on (50, 50) in the 100-unit box so the
// three icons sit at the same optical size and weight next to each other in
// a basket list.
const GLYPHS: Record<Glyph, React.ReactNode> = {
  // Fork and knife. The fork's outer tines are the arms of the U that
  // becomes its neck, so the whole head is one stroke; the middle tine and
  // the handle are a single line through it. The knife is a straight spine
  // with the cutting edge curving back to meet it at the bolster.
  food: (
    <>
      <path d="M32 26 L32 41 C32 45.6 34.6 48.4 38 48.4 C41.4 48.4 44 45.6 44 41 L44 26" />
      <path d="M38 26 L38 74" />
      <path d="M62 26 L62 74" />
      <path d="M62 26 C68.6 32.6 68.6 42 62 48.4" />
    </>
  ),
  // A cup with a lid. Symmetric, so it needs no counterweight the way a
  // handled mug does, and it is what a cold brew actually comes in.
  drink: (
    <>
      <rect x="29" y="28" width="42" height="9" rx="4.5" />
      <path d="M33 41 L37.6 68.5 C38 71.6 40.2 73.5 43.2 73.5 L56.8 73.5 C59.8 73.5 62 71.6 62.4 68.5 L67 41 Z" />
      <path d="M35.4 54 L64.6 54" />
    </>
  ),
  // A card with a ribbon and a bow. The bow sits on the top edge rather than
  // above it, so the icon keeps the same height as the other two.
  gift: (
    <>
      <rect x="24" y="35" width="52" height="36" rx="5" />
      <path d="M50 35 L50 71" />
      <path d="M50 35 C47 30.5 42.5 30 42.5 33.2 C42.5 35 45.5 35.6 50 35 C54.5 35.6 57.5 35 57.5 33.2 C57.5 30 53 30.5 50 35 Z" />
    </>
  ),
};

export default function ProductImage({
  swatch,
  name,
  category,
  className = "",
}: {
  swatch: string;
  name: string;
  /** Picks the glyph. Undefined where the product is no longer on the menu —
   *  an old order still renders, with the food icon. */
  category?: string;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={name}
      className={`overflow-hidden bg-tile ${className}`}
    >
      <svg viewBox="0 0 100 100" className="cb-initials h-full w-full" aria-hidden>
        <g
          fill="none"
          // The swatch, same as the letters wore. It matters more now that
          // the glyph is shared: colour is the only thing left telling two
          // sandwiches apart on a tile, and the swatches were saturated for
          // exactly this in the pass that made the letters legible — all 27
          // clear 3:1 against the tile in both themes (see .cb-initials in
          // globals.css for the dark half).
          stroke={swatch}
          // Reads as a drawn mark at 320px and still holds together at the
          // 44px chat thumbnail, which is the smallest this renders.
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          // Not fully solid — a hair of the tile through the line keeps it
          // reading as a placeholder rather than as a logo.
          opacity="0.9"
        >
          {GLYPHS[glyphFor(category)]}
        </g>
      </svg>
    </div>
  );
}
