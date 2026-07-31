// Stands in for product photography we don't have yet — a flat color swatch
// with the product's initial. Swap for a real <Image> once there are photos;
// every call site (ProductCard, the product page) takes the same `product`
// shape, so that swap is contained to this one file.

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
      style={{ backgroundColor: swatch }}
      className={`flex items-center justify-center ${className}`}
    >
      <span
        className="text-[13px] font-bold uppercase tracking-[0.1em] text-white/70"
        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
      >
        {name.charAt(0)}
      </span>
    </div>
  );
}
