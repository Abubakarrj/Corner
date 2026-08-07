// The loader that runs while Riley is writing.
//
// Two dots that slide together, fuse into one shape, and pull apart again —
// the merging loader from the reference. It replaces three dots bouncing in
// sequence and, with them, the elapsed-time counter that used to sit alongside:
// a stopwatch on somebody else's reply is a number that only ever gets worse to
// look at, and now that the reply streams in as it's written there is a better
// answer to "is this stuck?" than counting.
//
// The fusing is a gooey filter, not a trick of spacing. Blurring the two
// circles together and then throwing away everything under an alpha threshold
// turns two overlapping soft blobs into one hard-edged shape, and turns the
// moment they touch into a neck that stretches between them. Nothing else
// draws it; it falls out of the filter.
//
// `contrast` on the alpha channel is what does the thresholding: 19 amplifies
// the blurred alpha ramp and -8 re-centres it, so a pixel is either in the
// shape or not. Lower and the edges stay soft; higher and the two never appear
// to touch at all.

const FILTER_ID = "cb-merge-goo";

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
      {/* Zero-sized: this is a filter definition, not a picture. aria-hidden
          and focusable=false keep it out of the tree entirely — an <svg> with
          no content still lands in the tab order in some browsers. */}
      <svg width="0" height="0" aria-hidden focusable="false" className="absolute">
        <defs>
          <filter id={FILTER_ID}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.6" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -8"
            />
          </filter>
        </defs>
      </svg>

      <span
        aria-hidden
        className="cb-merge relative block h-[20px] w-[38px]"
        style={{ filter: `url(#${FILTER_ID})` }}
      >
        <span className="cb-merge-a absolute left-1/2 top-1/2 block h-[10px] w-[10px] rounded-full bg-current" />
        <span className="cb-merge-b absolute left-1/2 top-1/2 block h-[10px] w-[10px] rounded-full bg-current" />
      </span>
    </span>
  );
}
