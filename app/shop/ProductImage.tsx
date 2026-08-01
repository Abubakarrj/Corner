// Stands in for product photography we don't have yet. Restyled to match
// the reference catalogs the shop is modeled on: a warm beige tile with a
// large, faint serif initial, instead of the old flat colour block. The
// product's swatch colour survives as the tint of the initial, so items
// stay tellable apart at a glance without breaking the cream palette.
//
// The initial is SVG text rather than a sized span so it scales with the
// tile — the same component renders 64px basket thumbnails and the 320px
// product-page hero.
//
// Swap for a real <Image> once there are photos; every call site
// (ProductCard, the product page, the drawers) takes the same shape, so
// that swap is contained to this one file.

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
      className={`overflow-hidden bg-[#ECE6D8] ${className}`}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
        <text
          x="50"
          y="52"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="44"
          fontFamily="Georgia, 'Times New Roman', serif"
          fill={swatch}
          opacity="0.35"
        >
          {name.charAt(0)}
        </text>
      </svg>
    </div>
  );
}
