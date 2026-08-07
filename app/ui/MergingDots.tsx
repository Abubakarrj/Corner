// The loader that runs while Riley is writing.
//
// Binary metaball mitosis, which is a grand name for something everyone
// recognises: a blob that buds a smaller blob, lets it swing away, and pulls
// it back in. It reads as one thing thinking rather than three dots taking
// turns, and it is the reference's own loader.
//
// The first version of this was two equal dots sliding left and right past
// each other, which is a different animation wearing the same word. What makes
// the reference work is that the two are *not* equal and the small one goes
// somewhere: it leaves at an angle that changes every cycle, so the shape
// never repeats itself the way a metronome does.
//
// Three moving parts, and the goo filter does the rest:
//
//   core    the nucleus. Barely moves; breathes a little as the bud leaves,
//           the way something does when part of it has gone.
//   orbit   an invisible arm that rotates continuously. It carries the bud,
//           and because its period doesn't divide the bud's, each split
//           happens at a new angle.
//   bud     travels out along the arm and shrinks back to nothing at the
//           middle of the core, which is where it disappears into it.
//
// The fusing is the filter, not the spacing. Blurring the two together and
// then throwing away everything under an alpha threshold turns two soft
// overlapping circles into one hard-edged shape, and turns the moment they
// part into a neck that stretches and snaps. Nothing draws that; it falls out
// of the maths.
//
// `contrast` on the alpha channel is the threshold: 20 amplifies the blurred
// alpha ramp and -9 re-centres it, so a pixel is either in the shape or not.
// Lower and the edges stay soft; higher and the neck never forms.

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
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.8" result="soft" />
            <feColorMatrix
              in="soft"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"
            />
          </filter>
        </defs>
      </svg>

      <span
        aria-hidden
        className="relative block h-[22px] w-[34px]"
        style={{ filter: `url(#${FILTER_ID})` }}
      >
        <span className="cb-mitosis-core absolute left-1/2 top-1/2 block h-[12px] w-[12px] rounded-full bg-current" />
        <span className="cb-mitosis-orbit absolute left-1/2 top-1/2 block h-0 w-0">
          <span className="cb-mitosis-bud absolute left-0 top-0 block h-[9px] w-[9px] rounded-full bg-current" />
        </span>
      </span>
    </span>
  );
}
