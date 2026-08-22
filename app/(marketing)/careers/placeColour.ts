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
 *  ——— ⚠️ Chosen by how far apart they look, not by hue ———
 *
 *  The first draft spaced these by degrees on the colour wheel, on a rule that
 *  no two could sit within twenty of each other. That rule passed, and the
 *  board still had three purples on it that nobody could tell apart: measured
 *  off the rendered page, the closest pair came out at a colour difference of
 *  2.8, which is about the smallest difference an eye can detect at all.
 *
 *  Hue degrees are not a perceptual measure. Twenty-seven degrees around the
 *  blues and purples is a much smaller step than twenty-seven around the
 *  greens, and a rule counting degrees cannot see the difference. So the wheel
 *  is picked against the distance between the colours as they are actually
 *  painted, and tests/placeColour.test.ts measures that rather than the angle:
 *  the closest pair is 7.2 now, and every pair of *inks* is over 17.
 *
 *  ⚠️ Saturation is the second axis and it is doing real work. Brown is orange
 *  with the saturation taken out and slate is blue the same way — both sit a
 *  few degrees from a colour they are nothing like on screen. A wheel of twelve
 *  hues alone, at the lightness a pale tag needs, cannot separate twelve
 *  shops. */
const WHEEL: PlaceColour[] = [
  { hue: 286, saturation: 58 }, // violet
  { hue: 135, saturation: 52 }, // green
  { hue: 28, saturation: 72 }, // orange
  { hue: 215, saturation: 62 }, // blue
  { hue: 24, saturation: 26 }, // brown
  { hue: 338, saturation: 58 }, // pink
  { hue: 188, saturation: 55 }, // teal
  { hue: 48, saturation: 70 }, // gold
  { hue: 78, saturation: 45 }, // olive
  { hue: 242, saturation: 52 }, // indigo
  { hue: 208, saturation: 20 }, // slate
  { hue: 160, saturation: 48 }, // jade
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
