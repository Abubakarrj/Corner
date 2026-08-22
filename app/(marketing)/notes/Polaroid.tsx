import type { NotePhoto } from "../../cornerNotesShape";
import { CANVAS, inkOf, strokePath, widthOf, type Drawing } from "../../drawing";
import UnpinNote from "./UnpinNote";

// A note, as a polaroid.
//
// ——— ⚠️ The drawing is drawn here, from numbers ———
//
// The name, the neighbourhood and the note are text, which React escapes; the
// scribble is an SVG this file builds out of integers that app/drawing.ts has
// already bounded to a 0–1000 square. There is no data URL and no
// dangerouslySet anything, so no string a stranger typed can become an element.
//
// That is the whole reason the pad stores strokes instead of an image. See the
// note at the top of app/drawing.ts.
//
// ——— ⚠️ And then there is the photograph, which is somebody else's bytes ———
//
// This file used to say "there is no <img> here", and that sentence was the
// short version of the guarantee above. It is no longer true and the guarantee
// it stood for has moved: a photo is served by /api/note-photo/[id], which
// hands out only reviewed pictures on notes that are still up, with a fixed
// Content-Type and nosniff. The safety is in that endpoint now, not in the
// absence of this tag. Read it before changing either.
//
// ⚠️ A plain <img> rather than next/image, deliberately. next/image would route
// every photo through the image optimiser, which caches what it resizes — a
// second copy of a moderated picture, in a cache this app cannot clear, which
// would outlive taking the note down. The optimiser earns its keep on artwork a
// shop ships; it is the wrong thing to point at user content that might have to
// disappear.
//
// ——— Why a picture frame with no picture is still a polaroid ———
//
// A note can be words with no drawing, and it still gets the window: an empty
// frame reads as a photo that has not developed, which is the right feeling for
// a wall of them, and cards that change shape depending on what is in them make
// a grid that jumps.

export default function Polaroid({
  id,
  name,
  neighborhood,
  note,
  drawing,
  photo = null,
  mine = false,
  developingLabel = "developing",
  className = "",
}: {
  /** The note's id, which is where its photograph is fetched from. Only read
   *  when there is one to fetch. */
  id?: string;
  name: string;
  neighborhood?: string | null;
  note: string;
  drawing: Drawing | null;
  photo?: NotePhoto;
  /** ⚠️ Whether the server recognised this browser as the one that wrote it.
   *
   *  Decided from the device cookie, which is httpOnly and therefore unreadable
   *  from the page — so it has to arrive as a prop. False on the wall, which is
   *  a client component with no server to ask; there the card falls back to the
   *  token in localStorage. See UnpinNote. */
  mine?: boolean;
  /** ⚠️ Passed in rather than looked up, because this renders on both sides of
   *  the line: the wall is a client component with the translator in hand, and
   *  /notes/all is a server page that has no hook to call. A default in English
   *  keeps the server page honest about what it can do instead of leaving a
   *  blank frame with nothing in it. */
  developingLabel?: string;
  className?: string;
}) {
  const developing = photo === "developing";
  const src = photo === "ready" && id ? `/api/note-photo/${encodeURIComponent(id)}` : null;
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
      <div
        className={`relative aspect-square w-full overflow-hidden ${
          developing ? "cb-developing" : "bg-[#efefe9]"
        }`}
      >
        {/* ——— The photograph, under the ink ———

            Same order as the pad it was made on, so a photo somebody drew over
            arrives on the wall looking the way it looked when they made it.

            alt="" and aria-hidden, for the same reason the drawing is: the
            caption underneath is the note, and nobody can write alt text for a
            stranger's photograph. Announcing "image" before every card would be
            noise on a wall of ninety, and a made-up description would be worse
            than silence.

            Lazy, because this wall is a hundred cards and most of them are
            below the fold on every screen it renders on. */}
        {src ? (
          // See the note at the top: the optimiser must not hold a copy of a
          // picture that might have to come down.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}

        {/* ⚠️ The word, not only the colour. A frame quietly pulsing says
            nothing to somebody who has just left a photo and is wondering where
            it went, and says nothing at all to a screen reader. This is the
            only text on the card that the person who wrote the note did not
            write, which is why it is small and lowercase: it is the shop
            speaking, quietly, on somebody else's card. */}
        {developing ? (
          <span className="absolute inset-0 flex items-center justify-center text-[11px] tracking-wide text-[#6b675e]">
            {developingLabel}
          </span>
        ) : null}

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
                // ⚠️ Through inkOf and widthOf. This is a stranger's drawing
                // out of the database, and these are the two attributes that
                // would be a place to put a string if the colour were one. It
                // is an index; app/drawing.ts owns the table it indexes.
                stroke={inkOf(stroke)}
                strokeWidth={widthOf(stroke)}
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
        {/* ——— Yours to take down, if this is the browser that wrote it ———

            Renders nothing on anybody else's card and nothing at all on the
            server, so a wall of a hundred notes is a hundred of these and none
            of them shows. See UnpinNote.tsx for why it has to appear after
            mount rather than during render. */}
        {id ? <UnpinNote id={id} mine={mine} /> : null}
      </figcaption>
    </figure>
  );
}
