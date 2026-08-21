"use client";

import { useCallback, useRef, useState } from "react";
import { useT } from "../../i18n";
import {
  CANVAS,
  MAX_POINTS,
  MAX_STROKES,
  strokePath,
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

export default function DrawPad({
  value,
  onChange,
  className = "",
}: {
  value: Drawing;
  onChange: (next: Drawing) => void;
  className?: string;
}) {
  const t = useT();
  const boxRef = useRef<HTMLDivElement>(null);
  // The in-progress stroke, kept apart from `value` so a drag is one state
  // update per move rather than a rewrite of the whole drawing.
  const [live, setLive] = useState<Stroke | null>(null);
  const drawing = useRef(false);

  const points = value.reduce((sum, stroke) => sum + stroke.length, 0) / 2;
  const full = value.length >= MAX_STROKES || points >= MAX_POINTS;

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
    const point = at(event);
    if (!point) return;
    // ⚠️ Capture on the element, so a finger sliding off the pad keeps drawing
    // the same stroke rather than ending it at the edge.
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    setLive(point);
  };

  const move = (event: React.PointerEvent) => {
    if (!drawing.current) return;
    const point = at(event);
    if (!point) return;
    setLive((stroke) => {
      if (!stroke) return stroke;
      // Skip a point that has not moved. A finger held still fires a stream of
      // identical positions, and each one is two more numbers in the payload
      // for no visible difference.
      const [lastX, lastY] = [stroke[stroke.length - 2], stroke[stroke.length - 1]];
      if (lastX === point[0] && lastY === point[1]) return stroke;
      return [...stroke, ...point];
    });
  };

  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setLive((stroke) => {
      if (stroke && stroke.length >= 2) onChange([...value, stroke]);
      return null;
    });
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
        // ⚠️ Without this the browser claims a slow drag as a scroll and the
        // second half of the stroke never arrives.
        style={{ touchAction: "none" }}
        // A pad is a canvas, not a control: there is nothing here to tab to and
        // nothing a keyboard could usefully do with it. Named as an image with
        // the instruction as its label, so a screen reader says what it is and
        // then moves on to the buttons, which are the parts that work without a
        // pointer. Leaving a note without drawing is always allowed.
        role="img"
        aria-label={t("notes.padLabel")}
        className="relative aspect-square w-full cursor-crosshair touch-none select-none overflow-hidden rounded-xl border border-line-soft bg-white"
      >
        <svg viewBox={`0 0 ${CANVAS} ${CANVAS}`} className="absolute inset-0 h-full w-full">
          {shown.map((stroke, index) => (
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

        {/* The prompt, until there is a mark on the pad. Underneath the
            strokes and non-interactive, so it never eats the first touch. */}
        {shown.length === 0 ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] text-faint"
          >
            {t("notes.padHint")}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        {/* Undo, not just clear. Losing a whole drawing to one bad line is how
            somebody gives up rather than starting again. */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange(value.slice(0, -1))}
            disabled={value.length === 0}
            className="cb-press cb-tap cursor-pointer rounded-full border border-line-soft px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-ink disabled:cursor-default disabled:opacity-40"
          >
            {t("notes.undoStroke")}
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
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
