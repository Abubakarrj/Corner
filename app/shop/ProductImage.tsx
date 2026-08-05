import { SHOP_FONT } from "./shopControls";

// Stands in for product photography we don't have yet. Restyled to match
// the reference catalogs the shop is modeled on: a warm beige tile with a
// large initial, instead of the old flat colour block. The product's swatch
// colour is the letter, so items stay tellable apart at a glance without
// breaking the cream palette.
//
// The letters used to be a 0.35-opacity tint, and the pale swatches
// disappeared into the tile — "PC" on Plain Cream Cheese was a near-white
// letter on a beige square. Now the swatches are saturated and the letters
// are near-solid: every one of the 27 clears 3:1 against the tile in both
// themes (see .cb-initials in globals.css for the dark half).
//
// The initial is SVG text rather than a sized span so it scales with the
// tile — the same component renders 64px basket thumbnails and the 320px
// product-page hero.
//
// Swap for a real <Image> once there are photos; every call site
// (ProductCard, the product page, the drawers) takes the same shape, so
// that swap is contained to this one file.

// Two letters, not one. "Tomato, Please" is TP; "Baby Got BEC" is BG. A
// single initial collided constantly — four items began with C, three with
// P — so the tiles stopped telling anything apart, which is the only job
// they have until there are photographs.
//
// Two words give one letter each; one word gives its first two.
export function initialsFor(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default function ProductImage({
  swatch,
  name,
  className = "",
}: {
  swatch: string;
  name: string;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={name}
      className={`overflow-hidden bg-tile ${className}`}
    >
      <svg viewBox="0 0 100 100" className="cb-initials h-full w-full" aria-hidden>
        <text
          x="50"
          y="52"
          textAnchor="middle"
          dominantBaseline="central"
          // Down from 44 now that it's two letters — a pair at the old size
          // ran past the tile's edges on the 64px basket thumbnails.
          fontSize="34"
          // SVG text doesn't inherit the layout's font the way the rest of
          // the page does, so the stack is named here too. This initial was
          // a Georgia serif, from back when the headings were serif; with
          // the shop on Helvetica a serif letter on every tile is the only
          // thing left contradicting it.
          fontFamily={SHOP_FONT}
          fontWeight="500"
          fill={swatch}
          // Not fully solid — a hair of the tile through the letter keeps it
          // reading as a placeholder rather than as a logo.
          opacity="0.9"
        >
          {initialsFor(name)}
        </text>
      </svg>
    </div>
  );
}
