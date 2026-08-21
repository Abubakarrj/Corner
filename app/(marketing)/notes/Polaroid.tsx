import { CANVAS, strokePath, type Drawing } from "../../drawing";

// A note, as a polaroid.
//
// ——— ⚠️ The drawing is drawn here, from numbers ———
//
// Nothing on this card is markup somebody else wrote. The name, the
// neighbourhood and the note are text, which React escapes; the picture is an
// SVG this file builds out of integers that app/drawing.ts has already bounded
// to a 0–1000 square. There is no <img>, no data URL, no dangerouslySet
// anything, and no path for a stranger's string to become an element.
//
// That is the whole reason the pad stores strokes instead of an image. See the
// note at the top of app/drawing.ts.
//
// ——— Why a picture frame with no picture is still a polaroid ———
//
// A note can be words with no drawing, and it still gets the window: an empty
// frame reads as a photo that has not developed, which is the right feeling for
// a wall of them, and cards that change shape depending on what is in them make
// a grid that jumps.

export default function Polaroid({
  name,
  neighborhood,
  note,
  drawing,
  className = "",
}: {
  name: string;
  neighborhood?: string | null;
  note: string;
  drawing: Drawing | null;
  className?: string;
}) {
  return (
    <figure
      // ——— ⚠️ Two shadows, because the card is white on white ———
      //
      // --cb-page is #ffffff in light mode and this card is #ffffff too, on
      // purpose, because that is what a polaroid is. So the only thing holding
      // its edge was a 1px border and one soft blur, and a wall of them read as
      // captions floating on the page rather than as objects lying on it.
      //
      // The first shadow is contact: 1px down, 2px blur, no travel. It is what
      // makes the edge look like it is touching something. The second is the
      // lift, wide and faint, and it is what makes the card look like it is
      // above the page rather than printed on it. One shadow has to choose
      // between those two jobs and does neither well, which is what the single
      // 0_2px_10px was doing.
      //
      // Dark mode gets the same values and needs none of it: a white card on
      // #171614 separates by itself, and black at these alphas is invisible
      // there. Nothing is gained by branching, so it does not.
      className={`m-0 flex h-full flex-col rounded-[3px] border border-[#e5e0d4] bg-white p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.20),0_7px_18px_rgba(0,0,0,0.16)] ${className}`}
    >
      {/* The window. Square, like a real one, and the same grey whether or not
          anybody drew — see the note above. */}
      <div className="relative aspect-square w-full overflow-hidden bg-[#efefe9]">
        {drawing && drawing.length > 0 ? (
          <svg
            viewBox={`0 0 ${CANVAS} ${CANVAS}`}
            className="absolute inset-0 h-full w-full"
            // Decorative in the strict sense: the caption underneath is the
            // note, and nobody can write alt text for a stranger's scribble.
            // Announcing "drawing" before every card would be noise on a wall
            // of ninety.
            aria-hidden
          >
            {drawing.map((stroke, index) => (
              <path
                key={index}
                d={strokePath(stroke)}
                fill="none"
                stroke="#111"
                strokeWidth={22}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        ) : null}
      </div>

      <figcaption className="pt-2">
        {/* ——— ⚠️ Fixed colours, not the theme's ———

            These were text-quiet, text-faint and text-ink, which are the right
            tokens on any surface that follows the theme. This one does not: a
            polaroid is white in both themes, deliberately, because that is what
            a polaroid is. So in dark mode the tokens resolved to the dark
            theme's cream ink and printed cream on white — a card whose caption
            could not be read at all.

            A fixed surface takes fixed colours. #1d1c19 is the light theme's
            ink, which is what this card would have used if the theme could see
            that it is always light. */}
        <p
          className="m-0 flex flex-wrap items-baseline gap-x-1.5 text-[12px] leading-tight"
          style={{ color: "#6b675e" }}
        >
          <span className="font-medium">{name}</span>
          {/* The neighbourhood is what makes this a wall rather than a list.
              Quieter than the name, because it is context. */}
          {neighborhood ? <span style={{ color: "#8a8578" }}>· {neighborhood}</span> : null}
        </p>
        {note ? (
          // break-words, because a name or a note can be one unbroken string of
          // forty characters and a card that overflows takes the grid with it.
          <p
            className="m-0 mt-0.5 break-words text-[13px] leading-[1.35]"
            style={{ color: "#1d1c19" }}
          >
            {note}
          </p>
        ) : null}
      </figcaption>
    </figure>
  );
}
