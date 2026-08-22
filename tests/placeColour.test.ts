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

// ⚠️ Distinct as *numbers* is not distinct to an eye. Two hues fifteen degrees
// apart at the size of a tag are one colour with a rounding error, so the wheel
// is held to a real gap — measured the short way round, because 355 and 5 are
// ten degrees apart and not three hundred and fifty.
const MIN_HUE_GAP = 20;
const tooClose: string[] = [];
for (let i = 0; i < wheel.length; i += 1) {
  for (let j = i + 1; j < wheel.length; j += 1) {
    const raw = Math.abs(wheel[i].hue - wheel[j].hue);
    const gap = Math.min(raw, 360 - raw);
    // Two hues may sit close if their saturations pull them apart — brown is
    // orange with the saturation taken out, and it reads as its own colour.
    const satGap = Math.abs(wheel[i].saturation - wheel[j].saturation);
    if (gap < MIN_HUE_GAP && satGap < 20) {
      tooClose.push(`${key(wheel[i])} vs ${key(wheel[j])} (${gap}°)`);
    }
  }
}
ok("⚠️ and no two are close enough to read as the same colour",
   tooClose.length === 0, tooClose.join(", "));

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

// ——— ⚠️ Legible, including the colours nothing is wearing yet ———
//
// Only the shops with a job posted put a tag on screen, so a browser can only
// check five of the twelve. The other seven are one opening away from being
// rendered, and a colour that turns out to be unreadable the week a shop starts
// hiring is a colour nobody tested.
//
// So the contrast is computed here from the same lightnesses .cb-place uses —
// 92% behind 28% in light, 24% behind 84% in dark. ⚠️ Those four numbers are
// duplicated from globals.css, which is the one thing in this file that can go
// stale silently: change them there and this keeps passing about the old ones.
// They are worth duplicating anyway, because the alternative is seven colours
// nobody checks at all.
const LIGHT = { bg: 92, ink: 28 };
const DARK = { bg: 24, ink: 84, satScale: 0.7 };

/** sRGB relative luminance of an HSL colour, the WCAG way. */
function luminance(h: number, s: number, l: number): number {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  const sector = Math.floor(h / 60) % 6;
  const rgb = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][sector].map((v) => v + m);
  const [r, g, b] = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

console.log("\n— every colour on the wheel, in both themes —");
const dim: string[] = [];
for (const colour of wheel) {
  const light = contrast(
    luminance(colour.hue, colour.saturation, LIGHT.bg),
    luminance(colour.hue, colour.saturation, LIGHT.ink),
  );
  const dark = contrast(
    luminance(colour.hue, colour.saturation * DARK.satScale, DARK.bg),
    luminance(colour.hue, colour.saturation, DARK.ink),
  );
  // 4.5:1 is AA for text this size. The tag is 10px and bold-ish, which is not
  // "large text" by the guideline's definition, so the small-text bar applies.
  if (light < 4.5 || dark < 4.5) {
    dim.push(`${key(colour)} light ${light.toFixed(1)} dark ${dark.toFixed(1)}`);
  }
  console.log(`  ${key(colour).padEnd(8)} light ${light.toFixed(1)}:1  dark ${dark.toFixed(1)}:1`);
}
ok("⚠️ every colour clears AA against its own background, in both themes",
   dim.length === 0, dim.join("; "));

console.log(
  `\n  advertised at ${advertised.length} of ${LOCATIONS.length} shops` +
    (advertised.length < LOCATIONS.length
      ? `  ⚠️ no jobs posted for: ${shops.filter((s) => !advertised.includes(s)).join(", ")}`
      : ""),
);

console.log(failures === 0 ? "\nAll good." : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
