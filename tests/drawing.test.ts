// What a stranger is allowed to draw on the wall.
//
// ——— Why this is the file that gets a suite ———
//
// Corner Notes is the only thing in this app that takes what a stranger sent
// and puts it on a page every other visitor sees. Everything else the public
// posts is addressed to one reader: an order to a kitchen, an application to an
// inbox, a gift message to the person it was for.
//
// The thing that makes publishing it safe is not a filter on words — that is a
// game nobody wins — it is that a note has no field that can hold anything but
// text and numbers. The text is escaped where it renders. The drawing is this:
// integers, bounded here, turned into an SVG path by code we wrote. There is no
// image, no data URL and no markup anywhere in the shape.
//
// So cleanDrawing() is the boundary, it runs on a request body, and the input
// is whatever somebody felt like sending. Every assertion below is about it
// staying total — never throwing, never trusting, and never letting a payload
// through that the wall cannot afford to store or render.

import {
  CANVAS,
  DEFAULT_INK,
  DEFAULT_WIDTH,
  INKS,
  MAX_POINTS,
  MAX_STROKES,
  WIDTHS,
  cleanDrawing,
  hasInk,
  inkOf,
  strokePath,
  widthOf,
  type Stroke,
} from "../app/drawing";
import { readFileSync } from "node:fs";
import { en } from "../app/i18n/en";
import { es } from "../app/i18n/es";
import { ko } from "../app/i18n/ko";
import { zh } from "../app/i18n/zh";
import { ja } from "../app/i18n/ja";
import { ur } from "../app/i18n/ur";
import { my } from "../app/i18n/my";
import { fr } from "../app/i18n/fr";
import { it as itIT } from "../app/i18n/it";
import { fa } from "../app/i18n/fa";

// ⚠️ `it` is renamed on import. Left as `it` it is a name a test runner would
// shadow, and the failure is a "not callable" error a hundred lines away.
const TABLES: Record<string, Record<string, string>> = {
  en, es, ko, zh, ja, ur, my, fr, it: itIT, fa,
};

/** An empty stroke, for the assertions that need one to hand. */
const blank = (): Stroke => ({ ink: DEFAULT_INK, width: DEFAULT_WIDTH, points: [] });

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

// ——— An ordinary drawing survives ———
//
// ⚠️ Compared on the points rather than on the whole object. A cleaned stroke
// now carries a pencil as well as coordinates, so "comes back as itself" is a
// claim about what was drawn, not about the shape it is stored in.
const scribble = [[10, 10, 20, 20, 30, 15], [500, 500, 505, 505]];
ok("a drawing comes back as itself",
   JSON.stringify(cleanDrawing(scribble).map((s) => s.points)) === JSON.stringify(scribble),
   JSON.stringify(cleanDrawing(scribble)));
ok("and it has ink in it", hasInk(cleanDrawing(scribble)));

// ——— Anything at all ———
//
// ⚠️ Total, never throwing. This runs on a parsed request body, so the argument
// is genuinely `unknown` — and a 500 from a malformed drawing is a stranger
// finding a way to make the endpoint fall over.
for (const junk of [null, undefined, 0, "", "a string", { strokes: [] }, true, NaN]) {
  ok(`${JSON.stringify(junk) ?? "undefined"} is an empty drawing, not an error`,
     JSON.stringify(cleanDrawing(junk)) === "[]");
}
ok("and nested junk is dropped stroke by stroke",
   JSON.stringify(cleanDrawing([null, "x", {}, [1, 2]])[0]?.points) === "[1,2]",
   JSON.stringify(cleanDrawing([null, "x", {}, [1, 2]])));

// ⚠️ The one that matters most: nothing that is not a number survives, so
// there is no route from a request body to a string inside an SVG attribute.
const smuggled = [["<script>", "M0 0 L1 1", 5, 5, { toString: () => "evil" }, 6, 6]];
const cleaned = cleanDrawing(smuggled);
ok("⚠️ strings and objects never reach a path",
   JSON.stringify(cleaned[0]?.points) === "[5,5,6,6]", JSON.stringify(cleaned));
ok("and what is rendered is only digits, spaces, M and L",
   /^[ML0-9 .]*$/.test(strokePath(cleaned[0] ?? blank())), strokePath(cleaned[0] ?? blank()));

// ——— Coordinates are inside the square ———
//
// A pointer captured outside the pad reports coordinates outside it, and a
// stroke running to -4000 is a line across every card it is scaled into.
const wild = cleanDrawing([[-500, 99999, 1.4, 2.6, Infinity, -Infinity, NaN, 5]]);
ok("out-of-range coordinates are pulled back into the square",
   wild[0]?.points.every((value) => value >= 0 && value <= CANVAS) === true,
   JSON.stringify(wild));
ok("and everything is an integer, so the path has no float noise in it",
   wild[0]?.points.every((value) => Number.isInteger(value)) === true, JSON.stringify(wild));
ok("rounding is to the nearest, not toward zero",
   JSON.stringify(cleanDrawing([[1.4, 2.6]])[0]?.points) === "[1,3]",
   JSON.stringify(cleanDrawing([[1.4, 2.6]])));

// ——— Half a point ———
//
// ⚠️ Dropped rather than paired with a zero. A trailing lone coordinate padded
// out to (x, 0) draws a line to the top of the picture that nobody drew.
ok("an odd trailing coordinate is dropped",
   JSON.stringify(cleanDrawing([[10, 10, 20, 20, 30]])[0]?.points) === "[10,10,20,20]",
   JSON.stringify(cleanDrawing([[10, 10, 20, 20, 30]])));
ok("and a stroke of one lone number is not a stroke",
   JSON.stringify(cleanDrawing([[10]])) === "[]");
ok("nor is an empty one", JSON.stringify(cleanDrawing([[], []])) === "[]");

// ——— The budget ———
//
// ⚠️ Every cap here is what stops one POST from being a row nobody can render
// and a payload nobody can afford to store.
const manyStrokes = cleanDrawing(Array.from({ length: MAX_STROKES + 50 }, () => [1, 1, 2, 2]));
ok("more strokes than allowed are cut off at the limit",
   manyStrokes.length === MAX_STROKES, String(manyStrokes.length));

// ⚠️ The budget is across the whole drawing, not per stroke — otherwise 120
// strokes of 4000 points each is a legal drawing and the cap means nothing.
const fat = cleanDrawing(
  Array.from({ length: 10 }, () => Array.from({ length: 2000 }, (_, i) => i % CANVAS)),
);
const total = fat.reduce((sum, stroke) => sum + stroke.points.length, 0) / 2;
ok("⚠️ the point budget is across the drawing, not per stroke",
   total <= MAX_POINTS, String(total));
ok("and what is kept is still whole points",
   fat.every((stroke) => stroke.points.length % 2 === 0),
   JSON.stringify(fat.map((s) => s.points.length)));

// ——— Ink ———
ok("an empty drawing has no ink", !hasInk([]));
ok("and neither does a drawing of empty strokes", !hasInk([blank(), blank()]));
// ⚠️ The shape every note on the wall is still stored in. A reader that throws
// on it is a landmine under whoever next reads a drawing straight out of JSONB.
ok("⚠️ and the old bare-array shape is read rather than thrown at",
   !hasInk([[], []] as unknown as Stroke[]) &&
     hasInk([[7, 7]] as unknown as Stroke[]));
ok("but a single dot does", hasInk(cleanDrawing([[7, 7]])));

// ——— The path ———
//
// A tap is one point. Without the line-to-itself a single tap draws nothing,
// and the pad reads as broken to whoever tests it with one poke.
const dot: Stroke = { ...blank(), points: [7, 7] };
const line: Stroke = { ...blank(), points: [0, 0, 10, 10] };
ok("a single point becomes a dot rather than nothing",
   strokePath(dot) === "M 7 7 L 7 7", strokePath(dot));
ok("a line is a move and a line",
   strokePath(line) === "M 0 0 L 10 10", strokePath(line));
ok("and an old bare-array stroke still draws",
   strokePath([0, 0, 10, 10] as unknown as Stroke) === "M 0 0 L 10 10");
ok("and half a point renders nothing at all",
   strokePath({ ...blank(), points: [5] }) === "");



// ——— ⚠️ The pencils, which are the reason colour did not open a hole ———
//
// A colour on a stroke is an *index*, and the strings live in a table this
// module owns. That is the whole property: there is no value a request body can
// carry that ends up inside a `stroke` attribute, so adding colour did not undo
// the thing the top of app/drawing.ts is about.
console.log("\n— the pencils —");

const HEX = /^#[0-9a-f]{6}$/;
ok("every ink is a plain six-digit hex colour and nothing else",
   INKS.every((colour) => HEX.test(colour)), INKS.join(", "));
ok("and every width is a positive number inside the square",
   WIDTHS.every((w) => Number.isFinite(w) && w > 0 && w < CANVAS), WIDTHS.join(", "));
ok("the default ink and width point at real entries",
   INKS[DEFAULT_INK] !== undefined && WIDTHS[DEFAULT_WIDTH] !== undefined);
// ⚠️ 22 is what every stroke drawn before widths existed was painted at. If the
// default moves, every one of those notes changes appearance on the wall.
ok("⚠️ the default width is the one older drawings were drawn at",
   WIDTHS[DEFAULT_WIDTH] === 22, String(WIDTHS[DEFAULT_WIDTH]));

// Anything that is not an integer inside the table becomes the default. Not
// clamped to the nearest: a submitted 999 is somebody finding out what happens,
// and the answer is the ordinary pencil.
const badIndexes: unknown[] = [
  "#fff", "1", 1.5, -1, INKS.length, 9999, NaN, Infinity, null, undefined, {}, [],
];
for (const bad of badIndexes) {
  const out = cleanDrawing([{ ink: bad, width: bad, points: [1, 1, 2, 2] }]);
  ok(`⚠️ ink and width of ${JSON.stringify(bad) ?? String(bad)} fall back to the default`,
     out[0]?.ink === DEFAULT_INK && out[0]?.width === DEFAULT_WIDTH,
     JSON.stringify(out));
}
ok("a real index is kept",
   cleanDrawing([{ ink: 3, width: 2, points: [1, 1, 2, 2] }])[0]?.ink === 3);

// ⚠️ The renderers go through these rather than reading the field, so a row
// written by an older version — or edited by hand in the database — still
// paints in a colour from the list.
ok("⚠️ inkOf never returns anything but a colour from the table",
   [-5, 0, 2, 99, 1.5, NaN].every((i) =>
     (INKS as readonly string[]).includes(inkOf({ ink: i, width: 0, points: [] }))));
ok("and widthOf never returns anything but a width from the table",
   [-5, 0, 2, 99, 1.5, NaN].every((i) =>
     (WIDTHS as readonly number[]).includes(widthOf({ ink: 0, width: i, points: [] }))));
// The cast is what a hand-edited row would look like coming out of JSONB.
ok("⚠️ even a hex string in the ink field paints an ordinary pencil",
   inkOf({ ink: "#ff0000" as unknown as number, width: 0, points: [] }) === INKS[DEFAULT_INK]);

// ——— ⚠️ The drawings that were left before any of this ———
//
// Every note on the wall today stores a stroke as a bare array of coordinates,
// and those rows are read back through cleanDrawing. A plain array has to stay
// a stroke, in the default pencil, at the width it was drawn at — otherwise
// shipping colour repaints or erases every drawing anybody has ever left.
console.log("\n— drawings from before the pencils —");
const legacy = cleanDrawing([[10, 10, 20, 20], [30, 30, 40, 40]]);
ok("an old bare-array stroke is still a stroke", legacy.length === 2);
ok("with its points intact", JSON.stringify(legacy[0]?.points) === "[10,10,20,20]");
ok("⚠️ in the default pencil, so nothing on the wall changes colour",
   legacy.every((s) => s.ink === DEFAULT_INK && s.width === DEFAULT_WIDTH));
ok("and it still counts as ink", hasInk(legacy));
ok("a mixed drawing — one old stroke, one new — reads as both",
   (() => {
     const mixed = cleanDrawing([[1, 1, 2, 2], { ink: 4, width: 2, points: [3, 3, 4, 4] }]);
     return mixed.length === 2 && mixed[0]?.ink === DEFAULT_INK && mixed[1]?.ink === 4;
   })());

// ⚠️ The names read out to somebody who cannot see the swatch. Positional
// against INKS, so a colour added without a name is a swatch that announces
// the wrong one — checked here because nothing else would catch it.
console.log("\n— every pencil has a name —");
const padSource = readFileSync(new URL("../app/(marketing)/notes/DrawPad.tsx", import.meta.url), "utf8");
const inkNames = padSource.match(/const INK_NAMES: StringKey\[\] = \[([^\]]*)\]/)?.[1] ?? "";
const widthNames = padSource.match(/const WIDTH_NAMES: StringKey\[\] = \[([^\]]*)\]/)?.[1] ?? "";
const countOf = (block: string) => (block.match(/"[^"]+"/g) ?? []).length;
ok("one name per ink", countOf(inkNames) === INKS.length,
   `${countOf(inkNames)} names for ${INKS.length} inks`);
ok("one name per width", countOf(widthNames) === WIDTHS.length,
   `${countOf(widthNames)} names for ${WIDTHS.length} widths`);
// And each of those keys has to exist in every language the shop speaks.
const keys = [...(inkNames.match(/"([^"]+)"/g) ?? []), ...(widthNames.match(/"([^"]+)"/g) ?? [])]
  .map((q) => q.slice(1, -1));
for (const [tag, table] of Object.entries(TABLES)) {
  const missing = keys.filter((k) => !(k in table));
  ok(`${tag} names every pencil`, missing.length === 0, missing.join(", "));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
