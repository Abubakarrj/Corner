import { LOCATIONS } from "../locations/locations";

// A colour per shop, for the tag beside a job's title.
//
// ——— ⚠️ Why a colour and not a badge ———
//
// The board is one row per job per shop, so a list of twenty is four role names
// repeated five times. Everything that distinguishes one row from the next —
// which shop, what it pays, what hours — was in one grey line under the title,
// and the only thing with any colour on it was a New badge, which says the one
// thing nobody is scanning for.
//
// So the shop's name moved up beside the title and took the colour. The row now
// reads "Counter & Register · Larchmont" at a glance, and a column of them is
// scannable by place rather than by reading five identical sentences.
//
// ⚠️ The colour is never the only signal. The tag carries the name as text, so
// it works with the colours off, in a screenshot, in greyscale and for anybody
// who does not distinguish two of these hues from each other. Nothing anywhere
// depends on knowing that Larchmont is the green one.
//
// ——— ⚠️ A number, not a colour ———
//
// What this returns is a hue and a saturation, and the stylesheet turns those
// into a background and an ink — see .cb-place in globals.css. That is what
// makes it follow the theme: the same pair of numbers is a pale tint on the
// light page and a deep one at night, with the lightness chosen per theme in
// one place rather than twenty hex values chosen twice.

export type PlaceColour = { hue: number; saturation: number };

/** The wheel, in the order shops open.
 *
 *  ⚠️ Positional against LOCATIONS: a shop's colour is decided by where it sits
 *  in that list, so opening one appends rather than reshuffling. Reordering
 *  LOCATIONS would repaint the board, which is cosmetic and would still be a
 *  surprise to whoever did it.
 *
 *  Chosen to be told apart at the size of a tag, which is why no two sit within
 *  twenty degrees of each other on the wheel. tests/placeColour.test.ts holds
 *  them to it, and it caught two pairs in the first draft that were seventeen
 *  and fourteen degrees apart — near enough to read as one colour with a
 *  rounding error.
 *
 *  ⚠️ Brown is the exception the rule allows for. It is orange with the
 *  saturation taken out, eight degrees from the orange above it, and it reads
 *  as its own colour because of the saturation rather than the hue — which is
 *  why the check lets a close pair through when their saturations are far
 *  apart, and why saturation is carried here at all instead of being one
 *  constant. */
const WHEEL: PlaceColour[] = [
  { hue: 272, saturation: 45 }, // violet
  { hue: 130, saturation: 45 }, // green
  { hue: 30, saturation: 68 }, // orange
  { hue: 212, saturation: 55 }, // blue
  { hue: 22, saturation: 26 }, // brown
  { hue: 330, saturation: 50 }, // pink
  { hue: 190, saturation: 45 }, // teal
  { hue: 52, saturation: 62 }, // gold
  { hue: 82, saturation: 40 }, // olive
  { hue: 245, saturation: 45 }, // indigo
  { hue: 302, saturation: 42 }, // magenta
  { hue: 163, saturation: 42 }, // jade
];

/** ⚠️ The fallback, for a job posted at a place that is not on the shop list.
 *
 *  openings.ts holds the shop as a plain string rather than an id, on purpose —
 *  a job can be advertised before the shop is on the site. So a name that
 *  matches nothing is an ordinary case rather than a bug, and it gets a
 *  colourless tag rather than a wrong one. */
export const PLACE_UNKNOWN: PlaceColour = { hue: 0, saturation: 0 };

/** The colour for a shop, by the name openings.ts uses for it.
 *
 *  Matched case-insensitively on the trimmed name, because the two files keep
 *  that string in sync by hand and "Studio city" should not be a different
 *  shop from "Studio City". */
export function placeColour(name: string): PlaceColour {
  const wanted = name.trim().toLowerCase();
  const at = LOCATIONS.findIndex((store) => store.name.trim().toLowerCase() === wanted);
  if (at < 0) return PLACE_UNKNOWN;
  return WHEEL[at % WHEEL.length];
}

/** Test seam: the wheel itself, so tests/placeColour.test.ts can hold it to
 *  being long enough for the shop list and free of repeats. */
export function placeWheel(): PlaceColour[] {
  return WHEEL.slice();
}
