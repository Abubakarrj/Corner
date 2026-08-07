// The loader that runs while Riley is writing.
//
// Binary metaball mitosis, which is a grand name for something everyone
// recognises: a blob that buds a smaller blob, pushes it out, and pulls it
// back in. It reads as one thing thinking rather than three dots taking turns.
//
// Two moving parts, and the goo filter does the rest:
//
//   core   the nucleus. Stays put; breathes in a little as the bud leaves,
//          the way something does when part of it has gone.
//   bud    travels out sideways and shrinks back to nothing at the middle of
//          the core, which is where it disappears into it. Right, then left.
//
// Sized against the line of text it sits beside rather than against the bubble
// around it. A 22px-tall loader in a 13px conversation is a different object
// asking to be looked at; this one is the weight of a word.
//
// The box is 11px tall for a 9px core, which is tighter than it looks like it
// should be: the bud only ever travels sideways, so nothing needs vertical
// room, and the blur spills outside the box anyway — a filter region is not
// clipped by its element. Every pixel of height here becomes height in the
// bubble around it, and a typing indicator as tall as a reply is a reply that
// hasn't arrived.
//
// The fusing is the filter, not the spacing. Blurring the two together and
// then throwing away everything under an alpha threshold turns two soft
// overlapping circles into one hard-edged shape, and turns the moment they
// part into a neck that stretches and snaps. Nothing draws that; it falls out
// of the maths.
//
// The last row of the matrix is the threshold: 18 amplifies the blurred alpha
// ramp and -8 re-centres it, so a pixel is either in the shape or not. Lower
// and the edges stay soft; higher and the neck never forms. It is tuned to the
// blur, so the two move together — a smaller blob needs a smaller stdDeviation
// or it dissolves before it can bud.

const FILTER_ID = "cb-mitosis-goo";

export default function MergingDots({
  label,
  className = "",
}: {
  /** Read out instead of the animation, for anyone who isn't watching it. */
  label: string;
  className?: string;
}) {
  return (
    <span role="status" aria-label={label} className={`inline-flex items-center ${className}`}>
      {/* A filter definition, not a picture. Zero-sized and absolutely
          positioned rather than display:none — Safari won't apply a filter
          from an SVG it has decided not to render at all, and this is the one
          way of hiding it that every browser still honours. */}
      <svg width="0" height="0" aria-hidden focusable="false" className="absolute">
        <defs>
          <filter id={FILTER_ID}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.1" result="soft" />
            <feColorMatrix
              in="soft"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
            />
          </filter>
        </defs>
      </svg>

      <span
        aria-hidden
        className="relative block h-[11px] w-[30px]"
        style={{ filter: `url(#${FILTER_ID})` }}
      >
        <span className="cb-mitosis-core absolute left-1/2 top-1/2 block h-[9px] w-[9px] rounded-full bg-current" />
        <span className="cb-mitosis-bud absolute left-1/2 top-1/2 block h-[7px] w-[7px] rounded-full bg-current" />
      </span>
    </span>
  );
}
