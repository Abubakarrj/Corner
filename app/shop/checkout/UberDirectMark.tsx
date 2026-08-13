// The Uber Direct lockup, set in type rather than shipped as their artwork.
//
// ——— Why not their SVG ———
//
// The Uber wordmark is a trademark drawn in a proprietary typeface. Embedding
// the file would mean redistributing both, and a merchant integration does not
// need to: what the customer has to learn from this line is *who is driving*,
// and the name does that. Set in the app's own font it also stays legible in
// dark mode, at 11px, and next to a dollar amount — none of which a logo file
// scaled down to badge size manages well.
//
// The weight contrast is the whole design. "Uber" heavy and "Direct" light is
// the shape of the real lockup, so it reads as the brand at a glance without
// pretending to be the asset.
export default function UberDirectMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-baseline gap-[0.28em] whitespace-nowrap leading-none ${className}`}
    >
      <span className="font-semibold tracking-[-0.02em]">Uber</span>
      <span className="font-normal tracking-[-0.01em]">Direct</span>
    </span>
  );
}
