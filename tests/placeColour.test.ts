// The colour on a job row's shop tag.
//
// ——— ⚠️ What is worth asserting about a colour, and what is not ———
//
// Not that Larchmont is green. That is a decision somebody made in an afternoon
// and may unmake, and a test that pins it would be a test that fails every time
// the design moves without anything being wrong.
//
// What is worth pinning is the two things a reader depends on. Every shop gets
// a colour *of its own*, or two rows on the board look like the same place. And
// the same shop gets the same colour every time, or the board reshuffles itself
// between renders and the colour stops meaning anything at all.
//
// The third is the one that is not about colour: the tag says the shop's name
// in words, so nothing here is only-a-colour. That is asserted where it is
// rendered, by the name being the tag's own text.

import { LOCATIONS } from "../app/(marketing)/locations/locations";
import { OPENINGS } from "../app/(marketing)/careers/openings";
import {
  PLACE_UNKNOWN,
  placeColour,
  placeWheel,
} from "../app/(marketing)/careers/placeColour";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else {
    failures += 1;
    console.log("FAIL ", what, detail);
  }
};

const wheel = placeWheel();
const key = (c: { hue: number; saturation: number }) => `${c.hue}/${c.saturation}`;

// ——— ⚠️ The colour maths, and the four numbers it borrows ———
//
// 88% behind 28% ink in light, 24% behind 84% in dark. ⚠️ Duplicated from
// .cb-place in globals.css, which is the one thing here that can go stale in
// silence: change them there and this keeps answering about the old ones.
//
// Worth duplicating anyway. Only the shops with a job posted put a tag on
// screen, so a browser can check those and none of the rest — and a colour that
// turns out to be unreadable the week a shop starts hiring is a colour nobody
// tested.
const LIGHT = { bg: 88, ink: 28 };
const DARK = { bg: 24, ink: 84, satScale: 0.7 };

type Rgb = [number, number, number];

/** HSL to sRGB, the way a browser does it. */
function paint(
  colour: { hue: number; saturation: number },
  lightness: number,
  saturation = colour.saturation,
): Rgb {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((colour.hue / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor(colour.hue / 60) % 6;
  const table: Rgb[] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]];
  return table[sector].map((v) => (v + m) * 255) as Rgb;
}

const linear = (v: number) => {
  const u = v / 255;
  return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
};

/** CIE L*a*b*, which is the space distances mean something in. */
function lab([r, g, b]: Rgb): Rgb {
  const [R, G, B] = [linear(r), linear(g), linear(b)];
  const bend = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = bend((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const Y = bend(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const Z = bend((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

/** How different two colours look. Roughly: under 2.3 is the smallest
 *  difference an eye can detect at all. */
function deltaE(a: Rgb, b: Rgb): number {
  const [x, y] = [lab(a), lab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};

console.log(`\n— ${LOCATIONS.length} shops, ${wheel.length} colours —`);

// ——— ⚠️ Enough colours to go round ———
//
// placeColour wraps with a modulo, so running out is not a crash — it is two
// shops quietly sharing a colour, which is exactly the confusion the tag exists
// to prevent. The wheel has to be at least as long as the shop list, and the
// shop list is the thing that grows.
ok("there are at least as many colours as shops",
   wheel.length >= LOCATIONS.length,
   `${wheel.length} colours for ${LOCATIONS.length} shops`);

const seen = new Set(wheel.map(key));
ok("and no two of them are the same colour", seen.size === wheel.length,
   `${seen.size} distinct of ${wheel.length}`);

// ——— ⚠️ Told apart by an eye, not by an angle ———
//
// This counted degrees on the colour wheel and required twenty between any two.
// It passed, and the board still carried three purples nobody could tell apart:
// measured off the rendered page, the closest pair was 2.8 in Lab, which is
// about the smallest difference an eye can detect at all.
//
// Hue degrees are not a perceptual measure. Twenty-seven degrees around the
// blues is a far smaller step than twenty-seven around the greens, and a rule
// counting degrees is blind to that. So the distance is measured between the
// colours as they will actually be painted.
//
// The thresholds are set where the wheel comfortably clears them rather than at
// the edge: the closest background pair is around 7 and the closest pair of
// inks is over 17.
const MIN_BG_DELTA = 5;
const MIN_INK_DELTA = 12;
const bgClose: string[] = [];
const inkClose: string[] = [];
for (let i = 0; i < wheel.length; i += 1) {
  for (let j = i + 1; j < wheel.length; j += 1) {
    const bg = deltaE(paint(wheel[i], LIGHT.bg), paint(wheel[j], LIGHT.bg));
    const ink = deltaE(paint(wheel[i], LIGHT.ink), paint(wheel[j], LIGHT.ink));
    if (bg < MIN_BG_DELTA) bgClose.push(`${key(wheel[i])}/${key(wheel[j])} ΔE ${bg.toFixed(1)}`);
    if (ink < MIN_INK_DELTA) inkClose.push(`${key(wheel[i])}/${key(wheel[j])} ΔE ${ink.toFixed(1)}`);
  }
}
ok("⚠️ no two tags are close enough to read as the same colour",
   bgClose.length === 0, bgClose.join(", "));
ok("and neither are any two of the inks on them",
   inkClose.length === 0, inkClose.join(", "));

// ——— Every shop the board can name gets its own ———
const shops = LOCATIONS.map((store) => store.name);
const assigned = new Map<string, string>();
for (const name of shops) {
  const colour = placeColour(name);
  ok(`${name} has a colour of its own`,
     colour !== PLACE_UNKNOWN && !assigned.has(key(colour)),
     assigned.get(key(colour)) ? `shares with ${assigned.get(key(colour))}` : "unknown");
  assigned.set(key(colour), name);
}

// ⚠️ Stable. The colour is looked up by position in LOCATIONS, so this is
// really asserting that the lookup is a function of the name and not of
// anything that varies between two calls.
ok("the same shop is the same colour twice running",
   shops.every((name) => key(placeColour(name)) === key(placeColour(name))));
ok("and the name is matched however it is cased or spaced",
   key(placeColour(" studio CITY ")) === key(placeColour("Studio City")),
   `${key(placeColour(" studio CITY "))} vs ${key(placeColour("Studio City"))}`);

// ——— ⚠️ A job at a place that is not on the shop list ———
//
// openings.ts holds the shop as a plain string, deliberately, so a job can be
// advertised before the shop is on the site. That has to be a colourless tag
// rather than somebody else's colour.
for (const name of ["", "  ", "Nowhere", "Koreatown Annex"]) {
  const colour = placeColour(name);
  ok(`"${name}" gets the colourless tag rather than a wrong one`,
     colour.saturation === PLACE_UNKNOWN.saturation && colour.hue === PLACE_UNKNOWN.hue,
     key(colour));
}

// ——— And the board itself ———
//
// ⚠️ Every shop the careers board actually advertises should be on the shop
// list, or its rows come out grey while the others are coloured. This is the
// drift the openings.ts header warns about, caught here rather than by looking
// at the page.
const advertised = [...new Set(OPENINGS.map((o) => o.location))];
const unknown = advertised.filter((name) => placeColour(name) === PLACE_UNKNOWN);
ok("⚠️ every shop with a job posted is a shop the site knows about",
   unknown.length === 0, unknown.join(", "));

// ——— Legible, in both themes ———
console.log("\n— every colour on the wheel —");
const dim: string[] = [];
let closestBg = Infinity;
for (const colour of wheel) {
  const light = contrast(paint(colour, LIGHT.bg), paint(colour, LIGHT.ink));
  const dark = contrast(
    paint(colour, DARK.bg, colour.saturation * DARK.satScale),
    paint(colour, DARK.ink),
  );
  // 4.5:1 is AA for text this size. The tag is 10px, which is not "large text"
  // by the guideline's definition, so the small-text bar applies.
  if (light < 4.5 || dark < 4.5) {
    dim.push(`${key(colour)} light ${light.toFixed(1)} dark ${dark.toFixed(1)}`);
  }
  const nearest = Math.min(
    ...wheel.filter((o) => o !== colour).map((o) => deltaE(paint(colour, LIGHT.bg), paint(o, LIGHT.bg))),
  );
  closestBg = Math.min(closestBg, nearest);
  console.log(
    `  ${key(colour).padEnd(8)} contrast ${light.toFixed(1)}:1 light, ${dark.toFixed(1)}:1 dark` +
      `  |  nearest other tag ΔE ${nearest.toFixed(1)}`,
  );
}
ok("⚠️ every colour clears AA against its own background, in both themes",
   dim.length === 0, dim.join("; "));
console.log(`\n  closest pair of tags anywhere on the wheel: ΔE ${closestBg.toFixed(1)}`);

console.log(
  `\n  advertised at ${advertised.length} of ${LOCATIONS.length} shops` +
    (advertised.length < LOCATIONS.length
      ? `  ⚠️ no jobs posted for: ${shops.filter((s) => !advertised.includes(s)).join(", ")}`
      : ""),
);

console.log(failures === 0 ? "\nAll good." : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
