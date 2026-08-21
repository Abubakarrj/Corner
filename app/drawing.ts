// What a drawing is, for the pad that makes one and the endpoint that stores it.
//
// ——— ⚠️ Strokes of numbers, never an image ———
//
// The obvious way to build a draw pad is a <canvas>, `toDataURL()`, and a
// base64 PNG in the request body. It is also the way that hands a stranger a
// pipe into this shop's database and onto every visitor's screen, because a
// data URL is an opaque blob the server cannot meaningfully inspect: an SVG
// with a script in it, a malformed PNG aimed at an image decoder, or simply
// four megabytes of nothing, submitted a thousand times.
//
// So nothing here is an image. A drawing is a list of strokes, a stroke is a
// flat list of integer coordinates, and the server rebuilds the picture itself
// from numbers it has bounded. There is no field in this shape that can hold
// markup, a URL, or a byte of anybody else's choosing — the worst a determined
// person can submit is a rude drawing, which is a moderation question rather
// than a security one.
//
// It is also just smaller. A scribble is a few hundred integers; the same
// scribble as a PNG is tens of kilobytes, and it does not scale to a retina
// screen afterwards.
//
// ——— One definition, both sides ———
//
// The pad clamps as it draws and the endpoint clamps again on the way in, and
// they call the same function to do it. Two copies of "what counts as a
// drawing" is how a pad that allows 90 strokes meets a server that allows 80,
// and somebody's picture is silently truncated at the moment they submit it.

/** One stroke: x, y, x, y, … in a 0–1000 square. Flat rather than pairs
 *  because it halves the JSON and the reader never wants one axis alone. */
export type Stroke = number[];

export type Drawing = Stroke[];

/** The coordinate space. Not pixels: the pad is whatever width the phone is,
 *  and the polaroid it ends up in is a different size again, so the drawing is
 *  stored in its own square and scaled at both ends. */
export const CANVAS = 1000;

// ⚠️ Bounds, not suggestions. Every one of these is what stops a single POST
// from being a denial-of-service against the notes wall — a row nobody can
// render, or a payload nobody can afford to store.
//
// They are generous for a person and mean for a script: 120 strokes is far more
// than anybody draws with a fingertip, and 4000 points is a dense scribble
// across the whole square.
export const MAX_STROKES = 120;
export const MAX_POINTS = 4000;
/** A stroke has at least one point, and a point is two numbers. */
const MIN_STROKE_LENGTH = 2;

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(CANVAS, Math.max(0, Math.round(value)));
}

/** A drawing, from anything at all.
 *
 *  ⚠️ Total rather than throwing, and that is deliberate: this runs on a
 *  request body, where the input is whatever somebody sent. Everything
 *  unrecognisable is dropped and what is left is a valid drawing — possibly an
 *  empty one, which the caller decides what to do about. Refusing the whole
 *  submission over one stray value would lose a note somebody wrote.
 *
 *  Odd trailing coordinates are dropped rather than paired with a zero, which
 *  would draw a line to the corner of the picture. */
export function cleanDrawing(raw: unknown): Drawing {
  if (!Array.isArray(raw)) return [];
  const out: Drawing = [];
  let points = 0;

  for (const candidate of raw) {
    if (out.length >= MAX_STROKES) break;
    if (!Array.isArray(candidate)) continue;

    const stroke: Stroke = [];
    for (const value of candidate) {
      if (typeof value !== "number") continue;
      stroke.push(clamp(value));
    }
    // An odd length means half a point at the end.
    if (stroke.length % 2 === 1) stroke.pop();
    if (stroke.length < MIN_STROKE_LENGTH) continue;

    // ⚠️ The budget is across the whole drawing, not per stroke. Otherwise 120
    // strokes of 4000 points each is a legal drawing.
    const room = MAX_POINTS * 2 - points;
    if (room < MIN_STROKE_LENGTH) break;
    const kept = stroke.length > room ? stroke.slice(0, room - (room % 2)) : stroke;
    points += kept.length;
    out.push(kept);
  }

  return out;
}

/** Whether there is anything to look at. A drawing of one dot is a drawing; an
 *  empty array is somebody who did not draw. */
export function hasInk(drawing: Drawing): boolean {
  return drawing.some((stroke) => stroke.length >= MIN_STROKE_LENGTH);
}

/** One stroke as an SVG path.
 *
 *  A single point becomes a line to itself, which with a round linecap is a
 *  dot. Without that, tapping the pad once draws nothing and the pad looks
 *  broken to somebody testing it with one poke. */
export function strokePath(stroke: Stroke): string {
  if (stroke.length < MIN_STROKE_LENGTH) return "";
  const parts: string[] = [`M ${stroke[0]} ${stroke[1]}`];
  for (let index = 2; index + 1 < stroke.length; index += 2) {
    parts.push(`L ${stroke[index]} ${stroke[index + 1]}`);
  }
  if (parts.length === 1) parts.push(`L ${stroke[0]} ${stroke[1]}`);
  return parts.join(" ");
}
