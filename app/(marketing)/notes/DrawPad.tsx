"use client";

import { useCallback, useRef, useState } from "react";
import { useT, type StringKey } from "../../i18n";
import {
  CANVAS,
  DEFAULT_INK,
  DEFAULT_WIDTH,
  INKS,
  MAX_POINTS,
  MAX_STROKES,
  WIDTHS,
  inkOf,
  strokePath,
  widthOf,
  type Drawing,
  type Stroke,
} from "../../drawing";

// Somewhere to draw with a fingertip.
//
// ——— ⚠️ SVG, not canvas, and the reason is what gets submitted ———
//
// A <canvas> would be the reflex, and it would mean the only thing this
// component has at the end is pixels — so submitting means `toDataURL()` and a
// base64 image, which is the shape app/drawing.ts exists to avoid. Keeping the
// strokes as state and rendering them as paths means the thing on screen and
// the thing that gets sent are the same object, and that object is a list of
// numbers.
//
// It also makes undo a `slice(0, -1)` rather than a repaint, and makes the
// picture resolution-independent: the same strokes are a 300px card on the wall
// and a full-width pad here.
//
// ——— Pointer events, not touch or mouse ———
//
// One set of handlers for a finger, a stylus and a mouse. `setPointerCapture`
// is what keeps a stroke going when the finger leaves the pad mid-line: without
// it the line stops at the edge, and drawing near the border becomes a fight.
// `touch-action: none` stops the browser deciding a slow drag was a scroll and
// stealing the second half of a stroke.
//
// ——— ⚠️ The pencils, and where their colours are not ———
//
// A colour is chosen here as an *index* and stored as one. No hex string
// crosses the wire, so the palette cannot be widened by anything a request body
// contains. The strings themselves live in app/drawing.ts, which is the only
// file that turns one into an attribute. Read the note above INKS before adding
// a colour, and never reorder them.

/** The name a screen reader reads for each pencil, in the order INKS declares
 *  them. ⚠️ Positional, like INKS itself: a colour added there needs a name
 *  here and the two lists are checked against each other in
 *  tests/drawing.test.ts, because the failure otherwise is a swatch that
 *  announces the wrong colour to the only people who cannot see it. */
const INK_NAMES: StringKey[] = [
  "notes.inkBlack",
  "notes.inkRed",
  "notes.inkAmber",
  "notes.inkGreen",
  "notes.inkBlue",
  "notes.inkViolet",
  "notes.inkPink",
];

const WIDTH_NAMES: StringKey[] = ["notes.penThin", "notes.penMedium", "notes.penThick"];

export default function DrawPad({
  value,
  onChange,
  photo = null,
  className = "",
}: {
  value: Drawing;
  onChange: (next: Drawing) => void;
  /** A photograph to draw on top of, as a data URL this browser just made
   *  itself. See the note where it is rendered. */
  photo?: string | null;
  className?: string;
}) {
  const t = useT();
  const boxRef = useRef<HTMLDivElement>(null);
  // The in-progress stroke, kept apart from `value` so a drag is one state
  // update per move rather than a rewrite of the whole drawing.
  const [live, setLive] = useState<Stroke | null>(null);
  const [ink, setInk] = useState(DEFAULT_INK);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  // ——— ⚠️ One pointer at a time ———
  //
  // This was a boolean, and a boolean cannot tell a second finger from the
  // first. Resting a palm on the pad while drawing fired a second pointerdown,
  // which replaced the live stroke with a one-point one — so the line somebody
  // was in the middle of vanished. Holding the id means every later event is
  // checked against the pointer that started the stroke, and a palm is ignored.
  const drawingWith = useRef<number | null>(null);

  // ——— Undo, and the way back from it ———
  //
  // Undone strokes are kept until the next mark, so undo is recoverable rather
  // than one-way. Cleared on a new stroke: a redo that reaches back past
  // something drawn since would put a line into a picture that has moved on.
  const [undone, setUndone] = useState<Drawing>([]);

  const points = value.reduce((sum, stroke) => sum + stroke.points.length, 0) / 2;
  const full = value.length >= MAX_STROKES || points >= MAX_POINTS;
  // ⚠️ What is left for the stroke being drawn, in coordinates rather than
  // points. Without this a single unbroken drag could pass MAX_POINTS: the cap
  // was only checked when a stroke *started*, so cleanDrawing truncated it on
  // the way to the server and the card came back missing the end of a line
  // somebody watched themselves draw.
  const roomLeft = Math.max(0, (MAX_POINTS - points) * 2);

  /** Where the pointer is, in the drawing's own square. */
  const at = useCallback((event: React.PointerEvent): [number, number] | null => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return null;
    const x = ((event.clientX - box.left) / box.width) * CANVAS;
    const y = ((event.clientY - box.top) / box.height) * CANVAS;
    // Clamped here as well as on the server: a pointer captured outside the box
    // reports coordinates outside it, and a stroke that runs off to -400 is a
    // line across the card once it is scaled.
    return [
      Math.min(CANVAS, Math.max(0, Math.round(x))),
      Math.min(CANVAS, Math.max(0, Math.round(y))),
    ];
  }, []);

  const down = (event: React.PointerEvent<HTMLDivElement>) => {
    if (full) return;
    // A second finger, or a palm. The stroke in progress is the one that counts.
    if (drawingWith.current !== null) return;
    const point = at(event);
    if (!point) return;
    // ⚠️ Capture on the element, so a finger sliding off the pad keeps drawing
    // the same stroke rather than ending it at the edge.
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingWith.current = event.pointerId;
    setLive({ ink, width, points: point });
  };

  const move = (event: React.PointerEvent) => {
    if (drawingWith.current !== event.pointerId) return;
    const point = at(event);
    if (!point) return;
    setLive((stroke) => {
      if (!stroke) return stroke;
      // The whole drawing's budget, spent by the stroke in progress.
      if (stroke.points.length >= roomLeft) return stroke;
      // Skip a point that has not moved. A finger held still fires a stream of
      // identical positions, and each one is two more numbers in the payload
      // for no visible difference.
      const p = stroke.points;
      if (p[p.length - 2] === point[0] && p[p.length - 1] === point[1]) return stroke;
      return { ...stroke, points: [...p, ...point] };
    });
  };

  const up = (event: React.PointerEvent) => {
    if (drawingWith.current !== event.pointerId) return;
    drawingWith.current = null;
    setLive((stroke) => {
      if (stroke && stroke.points.length >= 2) {
        onChange([...value, stroke]);
        // Anything undone is now unreachable — see the note on `undone`.
        setUndone([]);
      }
      return null;
    });
  };

  const undo = () => {
    const last = value[value.length - 1];
    if (!last) return;
    setUndone((stack) => [...stack, last]);
    onChange(value.slice(0, -1));
  };

  const redo = () => {
    const last = undone[undone.length - 1];
    if (!last || full) return;
    setUndone((stack) => stack.slice(0, -1));
    onChange([...value, last]);
  };

  const clear = () => {
    // ⚠️ Clearing is undoable too, which is the whole reason it is safe to put
    // next to a drawing somebody spent five minutes on. The strokes go onto the
    // stack in order, so pressing redo repeatedly rebuilds the picture.
    setUndone(value.slice());
    onChange([]);
  };

  const shown = live ? [...value, live] : value;

  return (
    <div className={className}>
      <div
        ref={boxRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        // touchAction: without it the browser claims a slow drag as a scroll
        // and the second half of the stroke never arrives.
        //
        // ⚠️ And paper, rather than --cb-surface, for a harder reason than the
        // polaroid's. The pencils are a fixed table in app/drawing.ts and
        // INKS[0] is a near-black: on a ground that inverts with the theme, the
        // default pencil draws in the dark with nothing to show for it. The pad
        // is the same sheet the card is, so what you draw on is what you get.
        style={{
          touchAction: "none",
          background: "var(--cb-paper)",
          borderColor: "var(--cb-paper-edge)",
        }}
        // A pad is a canvas, not a control: there is nothing here to tab to and
        // nothing a keyboard could usefully do with it. Named as an image with
        // the instruction as its label, so a screen reader says what it is and
        // then moves on to the buttons, which are the parts that work without a
        // pointer. Leaving a note without drawing is always allowed.
        role="img"
        aria-label={t("notes.padLabel")}
        className="relative aspect-square w-full cursor-crosshair touch-none select-none overflow-hidden rounded-xl border"
      >
        {/* ——— ⚠️ The photograph, underneath the ink ———

            The one <img> the notes wall has, and it is worth being clear about
            what is in it: a data URL this browser produced a moment ago from a
            file this person chose, on their own machine, and never anybody
            else's bytes. Nothing here renders a stranger's image — that
            happens on the wall, from an endpoint, and Polaroid.tsx says so
            where it does it.

            Under the svg on purpose, so the strokes go on top and a photo can
            be drawn on. The pad and the polaroid window are both squares of
            the same aspect, which is what makes what you see here the thing
            that ends up on the card. object-cover, because a phone photo is
            4:3 or 3:4 and a square frame has to crop something. */}
        {photo ? (
          // A local data URL: there is nothing for next/image to fetch, size
          // or optimise, and nothing that leaves this browser.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
        ) : null}

        <svg viewBox={`0 0 ${CANVAS} ${CANVAS}`} className="absolute inset-0 h-full w-full">
          {shown.map((stroke, index) => (
            <path
              key={index}
              d={strokePath(stroke)}
              fill="none"
              // ⚠️ Through inkOf and widthOf, never `stroke.ink` — see the note
              // at the top of app/drawing.ts. These are the two attributes a
              // colour could have become a string in.
              stroke={inkOf(stroke)}
              strokeWidth={widthOf(stroke)}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>

        {/* The prompt, until there is a mark on the pad. Underneath the
            strokes and non-interactive, so it never eats the first touch. */}
        {/* ⚠️ Not over a photograph. "draw here" printed across somebody's
            picture reads as a caption on it rather than as an instruction to
            an empty pad, and the pad is no longer empty. */}
        {shown.length === 0 && !photo ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] text-faint"
          >
            {t("notes.padHint")}
          </span>
        ) : null}
      </div>

      {/* ——— The pencils ———

          A radio group rather than a row of buttons: exactly one is chosen, and
          that is what a radio group means to anything reading the page out. The
          swatch is the button, so the colour is the label — with the name
          carried in aria-label, because "a red circle" is not something a
          screen reader can work out from a background colour.

          ⚠️ Every swatch keeps a border in both states. A dark swatch on a
          light page shows its own edge; a light one does not, and without the
          border the amber and the pink read as floating blobs of different
          sizes. The chosen one is marked by a ring outside that border rather
          than by changing it, so nothing moves when the choice does.

          ⚠️ And every swatch sits on paper, not on the panel. INKS[0] is a
          near-black chosen to be a pencil on a light pad, and on the dark
          theme's panel it was a black dot on charcoal — the default pencil,
          the one most people never change, invisible in the picker that offers
          it. A swatch is a preview of a mark, so it belongs on the surface
          those marks are made on. */}
      <div
        role="radiogroup"
        aria-label={t("notes.inkLabel")}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        {INKS.map((colour, index) => (
          <button
            key={colour}
            type="button"
            role="radio"
            aria-checked={ink === index}
            aria-label={t(INK_NAMES[index])}
            onClick={() => setInk(index)}
            // 32px, which is the tappable floor the rest of the app uses. The
            // swatch inside is smaller; the target is not.
            className={`cb-tap flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-shadow ${
              ink === index ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""
            }`}
            style={{ background: "var(--cb-paper)" }}
          >
            <span
              aria-hidden
              className="block h-5 w-5 rounded-full border border-black/15"
              style={{ backgroundColor: colour }}
            />
          </button>
        ))}
      </div>

      {/* ——— The nibs ———

          Shown as three dots at the sizes they draw, which is the one label
          that needs no translating. The names are still there for a screen
          reader. */}
      <div
        role="radiogroup"
        aria-label={t("notes.penLabel")}
        className="mt-2 flex items-center gap-2"
      >
        {WIDTHS.map((nib, index) => (
          <button
            key={nib}
            type="button"
            role="radio"
            aria-checked={width === index}
            aria-label={t(WIDTH_NAMES[index])}
            onClick={() => setWidth(index)}
            // ⚠️ The same ring the swatches use, rather than a border colour.
            // The first cut marked the chosen nib by darkening its 1px border,
            // which at this size is not a difference anybody can see — three
            // buttons that look identical are three buttons nobody presses.
            // ⚠️ On paper, like the pencils above and for the same reason: the
            // dot is drawn in the chosen ink, and the chosen ink is a
            // near-black by default. On the panel it disappeared at night.
            className={`cb-tap flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border transition-shadow ${
              width === index ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""
            }`}
            style={{ background: "var(--cb-paper)", borderColor: "var(--cb-paper-edge)" }}
          >
            <span
              aria-hidden
              className="block rounded-full"
              style={{
                // ⚠️ Scaled against the widest nib, not against the drawing's
                // square. Against the square, all three came out under a pixel
                // and hit the same 4px floor — three dots the same size, for
                // three pens that are not.
                width: `${(nib / WIDTHS[WIDTHS.length - 1]) * 18}px`,
                height: `${(nib / WIDTHS[WIDTHS.length - 1]) * 18}px`,
                backgroundColor: INKS[ink],
              }}
            />
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        {/* Undo, not just clear. Losing a whole drawing to one bad line is how
            somebody gives up rather than starting again. */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={value.length === 0}
            className="cb-press cb-tap cursor-pointer rounded-full border border-line-soft px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-ink disabled:cursor-default disabled:opacity-40"
          >
            {t("notes.undoStroke")}
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={undone.length === 0 || full}
            className="cb-press cb-tap cursor-pointer rounded-full border border-line-soft px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-ink disabled:cursor-default disabled:opacity-40"
          >
            {t("notes.redoStroke")}
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={value.length === 0}
            className="cb-press cb-tap cursor-pointer rounded-full border border-line-soft px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-ink disabled:cursor-default disabled:opacity-40"
          >
            {t("notes.clearPad")}
          </button>
        </div>

        {/* ⚠️ Said out loud when it happens, rather than the pad quietly
            stopping. A pad that ignores a finger with no explanation reads as
            broken, and the limit is high enough that anybody who reaches it has
            been drawing for a while and deserves a sentence. */}
        {full ? (
          <p role="status" className="m-0 text-[11px] text-muted">
            {t("notes.padFull")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
