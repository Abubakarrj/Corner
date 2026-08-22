// The polaroids on the notes wall, in both themes.
//
// ——— ⚠️ Why a surface gets its own suite ———
//
// Every other ground in this app follows the palette: --cb-surface is light in
// light and dark in dark, and a component written against it is correct in both
// without knowing which one it is in. Paper does not, and cannot.
//
// It cannot because of app/drawing.ts. The pencils are a fixed table of hex
// strings and INKS[0] is a near-black, chosen once and never reordered, and
// every drawing on the wall is stored as an *index* into it. There is no theme
// in that table and no way to put one there without changing what every note
// already saved means. So the ground those strokes land on has to stay light in
// both themes, or the default pencil vanishes at night.
//
// Which leaves paper as the one surface in the app that has to be checked by
// hand, in two themes, against a palette it does not belong to. That is what
// this is. It reads the tokens out of globals.css rather than repeating them,
// so a value edited there is a value tested here.
//
// ——— What went wrong, and what this would have caught ———
//
// Paper was white. Not as an oversight: Polaroid.tsx carried a comment saying a
// polaroid is white in both themes on purpose, which is the right instinct
// about photographs and the wrong answer about screens. White on the dark
// theme's #171614 measures 18:1 — every card a hole cut in the page.
//
// Dimming it fixed the glare and broke two things quietly, both caught here and
// neither visible in a screenshot of a wall that happens to have no photo
// developing and nobody's own note on it:
//
//   · #be1923, the unpin control, went from 6.26:1 on white to 2.98 on dim
//     paper. A red chosen against one ground is not a red on another.
//   · the caption inks, which had been nailed to the light theme's values by
//     the same comment, were suddenly grey-on-grey.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else {
    failures += 1;
    console.log("FAIL ", what, detail);
  }
};

// ——— The tokens, read from the stylesheet ———
//
// ⚠️ Parsed rather than copied. A test holding its own copy of these numbers
// passes forever while the page changes underneath it, which is the failure
// mode this file exists to prevent — the old one had four of them pasted into a
// comment in tests/placeColour.test.ts and marked as the thing that could go
// stale in silence.
const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "app", "globals.css"),
  "utf8",
);

/** Every --cb-paper* declaration in the stylesheet, grouped by the selector
 *  whose block it sits in.
 *
 *  ⚠️ Brace-aware rather than a string search. The first attempt took the text
 *  between ":root {" and the next "\n}", which found an empty block: globals.css
 *  has several :root blocks and comments with braces in them, and slicing on the
 *  first match landed in the wrong one. It reported ten missing tokens for a
 *  stylesheet that had all ten, which is the kind of failure that gets a working
 *  file "fixed". */
function paperTokens(): Record<string, Record<string, string>> {
  // Comments first, so a brace inside prose cannot open or close a block.
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found: Record<string, Record<string, string>> = {};
  const stack: string[] = [];
  let selector = "";
  for (const token of source.split(/([{};])/)) {
    if (token === "{") {
      stack.push(selector.trim().replace(/\s+/g, " "));
      selector = "";
    } else if (token === "}") {
      stack.pop();
      selector = "";
    } else if (token === ";") {
      const match = /(--cb-paper[\w-]*)\s*:\s*(#[0-9a-f]{6})/i.exec(selector);
      const where = stack[stack.length - 1];
      if (match && where) {
        (found[where] ??= {})[match[1]] = match[2].toLowerCase();
      }
      selector = "";
    } else {
      selector += token;
    }
  }
  return found;
}

const blocks = paperTokens();
const light = blocks[":root"] ?? {};
const dark = blocks[':root[data-theme="dark"]'] ?? {};
const PAGE = { light: "#ffffff", dark: "#171614" };

console.log(`\n— ${Object.keys(light).length} paper tokens —`);

const NEEDED = [
  "--cb-paper",
  "--cb-paper-edge",
  "--cb-paper-window",
  "--cb-paper-ink",
  "--cb-paper-quiet",
  "--cb-paper-faint",
  "--cb-paper-red",
  "--cb-paper-latent",
  "--cb-paper-fixed",
  "--cb-paper-latent-ink",
];
for (const name of NEEDED) {
  ok(`${name} is defined in both themes`,
     light[name] !== undefined && dark[name] !== undefined,
     `light ${light[name] ?? "—"} dark ${dark[name] ?? "—"}`);
}
// ⚠️ Both directions. A token added to the dark block and forgotten in the
// light one inherits light's value silently, which is the same bug as the one
// above wearing a different hat.
for (const name of Object.keys({ ...light, ...dark })) {
  ok(`${name} is one of the tokens this suite knows about`,
     NEEDED.includes(name), "add it to NEEDED, with whatever it has to clear");
}

if (failures > 0) {
  console.log(`\n${failures} FAILURES`);
  process.exit(1);
}

// ——— The colour maths ———
type Rgb = [number, number, number];
const rgb = (hex: string): Rgb =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const linear = (v: number) => {
  const u = v / 255;
  return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** How warm a colour is: red channel minus blue, in plain 0–255 terms.
 *  Positive is warm. */
const warmth = (hex: string) => rgb(hex)[0] - rgb(hex)[2];

for (const [theme, paper] of [["light", light], ["dark", dark]] as const) {
  const page = PAGE[theme];
  const card = paper["--cb-paper"];
  const window_ = paper["--cb-paper-window"];
  console.log(`\n— ${theme}: paper ${card} on a ${page} page —`);

  // ——— ⚠️ The thing that was actually reported ———
  //
  // Not "is it readable". White on black is extremely readable, and being
  // readable was the complaint: a card is an object lying on a page, and past
  // about 12:1 it stops looking like one and starts looking like a light behind
  // a hole. On a wall of twenty that is the whole screen.
  //
  // ⚠️ A ceiling, and only a ceiling. The first version of this had a floor
  // beside it — paper must clear 3:1 or the cards sink into the page — and it
  // failed on the light theme, correctly, for a design that is right. In light
  // the page is #ffffff and the card is #ffffff, deliberately, because that is
  // what a polaroid is; what holds its edge there is not contrast but the two
  // shadows Polaroid.tsx explains at length. A floor asserted in both themes
  // would have called that a bug and invited somebody to "fix" it by tinting a
  // white card grey.
  //
  // So the floor is asserted where it means something — below, on the sheet
  // that is not the same colour as its page — and the shadow is asserted in
  // light, where it is the thing doing the work.
  const onPage = contrast(card, page);
  ok(`⚠️ paper is not a hole cut in the page  (${onPage.toFixed(1)}:1)`,
     onPage <= 12, "too bright — this is the glare that was reported");

  if (card === page) {
    // Light. The edge comes from the shadows, so this checks they are there
    // rather than checking a contrast that is 1.0 on purpose.
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "app", "(marketing)", "notes", "Polaroid.tsx"),
      "utf8",
    );
    ok("a card the same colour as its page keeps its edge from the shadows",
       /shadow-\[0_1px_2px[^\]]+,0_7px_18px[^\]]+\]/.test(source),
       "the contact shadow and the lift — see the note in Polaroid.tsx");
  } else {
    // ⚠️ Dark. The floor matters more than the ceiling here: paper that sinks
    // towards the page is a wall of cards whose edges you cannot find. 3:1 is
    // the bar for a boundary that carries meaning, and this one does — it is
    // what separates one note from the next.
    ok(`and it is far enough off the page to have an edge  (${onPage.toFixed(1)}:1)`,
       onPage >= 3, "too dim — the cards sink");

    // ⚠️ Lighter than the page, which is what makes it paper rather than a
    // panel. Contrast alone cannot say this: 8:1 is 8:1 whether the card is the
    // light half or the dark one, and a dark card would clear both bounds above
    // while inverting the thing.
    ok("and it is the lighter of the two, which is what paper is",
       luminance(card) > luminance(page));

    // ⚠️ Warm. The first draft of this sheet was a neutral grey at the same
    // lightness and read as concrete: this far from white the cream is the
    // whole signal, and a grey sheet on a warm-charcoal page looks like a
    // different material rather than a dimmer one.
    ok(`the sheet keeps its warmth  (r−b ${warmth(card)})`, warmth(card) >= 12);
  }

  // ——— The window, and the ink that lands on it ———
  //
  // ⚠️ The constraint from app/drawing.ts: INKS[0] is #1d1c19 and every drawing
  // stored with the default pencil is an index pointing at it. 3:1 is the bar
  // for a graphic rather than text, which is what a scribble is.
  const pencil = "#1d1c19";
  ok(`⚠️ the default pencil is visible on the window  (${contrast(pencil, window_).toFixed(1)}:1)`,
     contrast(pencil, window_) >= 3,
     "INKS[0] in app/drawing.ts — a drawing already saved cannot be recoloured");
  ok("the window sits below the card, so an empty frame still reads as one",
     luminance(window_) < luminance(card));

  // ——— The caption ———
  //
  // 4.5:1: the name is 12px, the note 13px and the unpin control 11px. None of
  // that is "large text" by the guideline's definition, so the small-text bar
  // applies to all of it.
  const AA = 4.5;
  for (const [what, token] of [
    ["the note itself", "--cb-paper-ink"],
    ["the name", "--cb-paper-quiet"],
    ["the neighbourhood", "--cb-paper-faint"],
    ["⚠️ the unpin control", "--cb-paper-red"],
  ] as const) {
    const ratio = contrast(paper[token], card);
    // ⚠️ --cb-paper-faint is 3.68:1 on white and always has been — it predates
    // any of this and is left alone rather than quietly changed, because that
    // is a visible edit to a screen nobody asked about. Reported rather than
    // asserted in light, so it stays on the record instead of being pinned as
    // correct.
    if (theme === "light" && token === "--cb-paper-faint") {
      console.log(`  ⚠️ ${what} is ${ratio.toFixed(2)}:1 on white — under AA, and was before this`);
      continue;
    }
    ok(`${what} clears AA on the card  (${ratio.toFixed(2)}:1)`, ratio >= AA, paper[token]);
  }

  // ——— The frame that is still developing ———
  //
  // Its own ink, because it sits on the pulse rather than on the card and the
  // pulse is the darkest paper gets. ⚠️ Checked at the darker end: a label that
  // clears at the top of a 3.2s cycle and fails at the bottom is a label that
  // fails.
  const latent = paper["--cb-paper-latent"];
  const fixed = paper["--cb-paper-fixed"];
  const label = contrast(paper["--cb-paper-latent-ink"], latent);
  if (theme === "light") {
    console.log(`  ⚠️ the developing label is ${label.toFixed(2)}:1 — under AA, and was before this`);
  } else {
    ok(`⚠️ the developing label clears AA at the dark end of the pulse  (${label.toFixed(2)}:1)`,
       label >= AA, paper["--cb-paper-latent-ink"]);
  }
  ok("the pulse runs from darker to lighter, so the emulsion comes up",
     luminance(latent) < luminance(fixed));
  ok("and stays under the window, so a developing frame is not the brightest thing on the card",
     luminance(fixed) <= luminance(window_));

  // The card's own edge, which is what holds it apart from the one beside it
  // when two sit next to each other in the grid.
  ok("the edge is visible against the card it borders",
     contrast(paper["--cb-paper-edge"], card) >= 1.1,
     contrast(paper["--cb-paper-edge"], card).toFixed(2));
}

// ——— ⚠️ And the thing the tokens replaced ———
//
// The literals are gone from the components. This is the assertion that stops
// the next person adding one back: a hex string on a polaroid is a colour that
// will be wrong in one of the two themes, and it will be wrong in the theme
// whoever added it was not looking at.
const here = dirname(fileURLToPath(import.meta.url));
for (const file of ["Polaroid.tsx", "UnpinNote.tsx"]) {
  const source = readFileSync(join(here, "..", "app", "(marketing)", "notes", file), "utf8");
  // Comments explain the old values by name, which is worth keeping — so this
  // looks for a hex in a style prop rather than a hex anywhere in the file.
  const literals = [...source.matchAll(/color:\s*"(#[0-9a-f]{3,8})"/gi)].map((m) => m[1]);
  ok(`⚠️ ${file} has no colour of its own left in it`,
     literals.length === 0, literals.join(", "));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
