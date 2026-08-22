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

/** One stroke: a colour, a thickness, and x, y, x, y, … in a 0–1000 square.
 *
 *  ⚠️ `ink` and `width` are *indexes*, not values. That is the whole of how
 *  colour was added without opening the hole the top of this file is about.
 *  A stroke colour submitted as "#be1923" is a string from a stranger that ends
 *  up inside an SVG attribute; a stroke colour submitted as `1` is a number
 *  this file bounds and then looks up in a table it owns. There is no input
 *  that makes the second one render anything the shop did not choose.
 *
 *  Points stay flat rather than paired: it halves the JSON and the reader never
 *  wants one axis alone. */
export type Stroke = { ink: number; width: number; points: number[] };

export type Drawing = Stroke[];

/** The pencils.
 *
 *  ⚠️ The only colours a note can be drawn in, and the only strings that reach
 *  a `stroke` attribute. Read by index — see inkOf — so nothing a request body
 *  contains can widen this list.
 *
 *  Chosen against the two backgrounds a drawing is seen on and nothing else:
 *  the white pad and the polaroid's #efefe9 window. Every one of them carries
 *  on a photograph too, which is the third surface and the one with no fixed
 *  colour at all.
 *
 *  ⚠️ White is deliberately absent. It is the obvious pencil for drawing on a
 *  dark photo and it is invisible on both of the other two surfaces, so half
 *  the time it would be a pencil that does nothing and looks broken. A pad that
 *  offers a tool which silently fails is worse than a pad with one fewer tool.
 *
 *  ⚠️ Append only. The index is stored in the database, so reordering this list
 *  repaints every drawing anybody has ever left. */
export const INKS = [
  "#1d1c19", // ink, and the default — the same near-black the app writes in
  "#be1923", // the shop's red
  "#d98c1f", // amber
  "#17795e", // green
  "#1b5fa8", // blue
  "#7a3ea3", // violet
  "#d1477a", // pink
] as const;

/** How thick a pencil draws, in the drawing's own 0–1000 units.
 *
 *  ⚠️ Also read by index, for the same reason as the colours — a width is a
 *  number in an attribute, and a number from a request body is a number
 *  somebody chose. 22 is what every stroke drawn before this existed used, and
 *  it is the middle one so that nothing shifts.
 *
 *  ⚠️ Append only, and for the same reason. */
export const WIDTHS = [12, 22, 40] as const;

/** The default pencil: the index a stroke gets when it does not say. */
export const DEFAULT_INK = 0;
export const DEFAULT_WIDTH = 1;

/** The colour to paint a stroke in. Always one of INKS, whatever it was given.
 *
 *  ⚠️ Every renderer goes through this rather than reading `stroke.ink` into an
 *  attribute. A drawing that came out of the database before it was ever
 *  cleaned — a row written by an older version, a hand-edited value — still
 *  paints in a colour from the list above. */
export function inkOf(stroke: Stroke): string {
  const raw = Array.isArray(stroke) ? DEFAULT_INK : stroke?.ink;
  const index = Number.isInteger(raw) ? (raw as number) : DEFAULT_INK;
  return INKS[index] ?? INKS[DEFAULT_INK];
}

/** The thickness to paint a stroke at. Always one of WIDTHS. */
export function widthOf(stroke: Stroke): number {
  const raw = Array.isArray(stroke) ? DEFAULT_WIDTH : stroke?.width;
  const index = Number.isInteger(raw) ? (raw as number) : DEFAULT_WIDTH;
  return WIDTHS[index] ?? WIDTHS[DEFAULT_WIDTH];
}

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

    // ——— ⚠️ Two shapes, because the old one is in the database ———
    //
    // Every drawing left before pencils had colours is a bare array of
    // coordinates, and those rows are read back through this function — see
    // listNotes. So a plain array is still a stroke: the default pencil, the
    // width every stroke used to be drawn at, and the numbers as they were.
    // Nothing has to be migrated and no old note changes appearance.
    const raw2 = candidate as { ink?: unknown; width?: unknown; points?: unknown };
    const coordinates = Array.isArray(candidate) ? candidate : raw2?.points;
    if (!Array.isArray(coordinates)) continue;
    const ink = Array.isArray(candidate) ? DEFAULT_INK : index(raw2.ink, INKS.length, DEFAULT_INK);
    const width = Array.isArray(candidate)
      ? DEFAULT_WIDTH
      : index(raw2.width, WIDTHS.length, DEFAULT_WIDTH);

    const flat: number[] = [];
    for (const value of coordinates) {
      if (typeof value !== "number") continue;
      flat.push(clamp(value));
    }
    // An odd length means half a point at the end.
    if (flat.length % 2 === 1) flat.pop();
    if (flat.length < MIN_STROKE_LENGTH) continue;

    // ⚠️ The budget is across the whole drawing, not per stroke. Otherwise 120
    // strokes of 4000 points each is a legal drawing.
    const room = MAX_POINTS * 2 - points;
    if (room < MIN_STROKE_LENGTH) break;
    const kept = flat.length > room ? flat.slice(0, room - (room % 2)) : flat;
    points += kept.length;
    out.push({ ink, width, points: kept });
  }

  return out;
}

/** One index into a fixed table, from anything at all.
 *
 *  ⚠️ Everything that is not an integer inside the table becomes the default:
 *  a float, a negative, a string, NaN, a number past the end. Not clamped to
 *  the nearest — a submitted 999 is not somebody asking for the last colour,
 *  it is somebody finding out what happens, and the answer should be "the
 *  ordinary pencil". */
function index(value: unknown, length: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  if (value < 0 || value >= length) return fallback;
  return value;
}

/** Whether there is anything to look at. A drawing of one dot is a drawing; an
 *  empty array is somebody who did not draw. */
export function hasInk(drawing: Drawing): boolean {
  return drawing.some((stroke) => pointsOf(stroke).length >= MIN_STROKE_LENGTH);
}

/** A stroke's coordinates, whichever shape the stroke is in.
 *
 *  ⚠️ Total, like cleanDrawing, and for a reason a test found rather than one
 *  anybody predicted. Everything in the app hands these functions a *cleaned*
 *  drawing, so in principle they only ever see the new shape. But the old shape
 *  — a bare array of coordinates — was valid last week, it is what every row in
 *  the database still holds, and a helper that throws a TypeError when handed
 *  one is a landmine sitting under the next person who reads a drawing straight
 *  out of JSONB and skips the clean.
 *
 *  So the readers accept both, exactly as cleanDrawing does. Nothing here is a
 *  second definition of what a drawing is: it is the same tolerance in the same
 *  two shapes, and the file's own rule is that unrecognisable input becomes
 *  nothing rather than an exception. */
function pointsOf(stroke: Stroke | number[] | null | undefined): number[] {
  if (Array.isArray(stroke)) return stroke;
  const p = stroke?.points;
  return Array.isArray(p) ? p : [];
}

/** One stroke as an SVG path.
 *
 *  A single point becomes a line to itself, which with a round linecap is a
 *  dot. Without that, tapping the pad once draws nothing and the pad looks
 *  broken to somebody testing it with one poke. */
export function strokePath(stroke: Stroke): string {
  const p = pointsOf(stroke);
  if (p.length < MIN_STROKE_LENGTH) return "";
  const parts: string[] = [`M ${p[0]} ${p[1]}`];
  for (let at = 2; at + 1 < p.length; at += 2) {
    parts.push(`L ${p[at]} ${p[at + 1]}`);
  }
  if (parts.length === 1) parts.push(`L ${p[0]} ${p[1]}`);
  return parts.join(" ");
}
