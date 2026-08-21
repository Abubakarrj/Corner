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
  MAX_POINTS,
  MAX_STROKES,
  cleanDrawing,
  hasInk,
  strokePath,
} from "../app/drawing";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

// ——— An ordinary drawing survives ———
const scribble = [[10, 10, 20, 20, 30, 15], [500, 500, 505, 505]];
ok("a drawing comes back as itself",
   JSON.stringify(cleanDrawing(scribble)) === JSON.stringify(scribble),
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
   JSON.stringify(cleanDrawing([null, "x", {}, [1, 2]])) === "[[1,2]]",
   JSON.stringify(cleanDrawing([null, "x", {}, [1, 2]])));

// ⚠️ The one that matters most: nothing that is not a number survives, so
// there is no route from a request body to a string inside an SVG attribute.
const smuggled = [["<script>", "M0 0 L1 1", 5, 5, { toString: () => "evil" }, 6, 6]];
const cleaned = cleanDrawing(smuggled);
ok("⚠️ strings and objects never reach a path",
   JSON.stringify(cleaned) === "[[5,5,6,6]]", JSON.stringify(cleaned));
ok("and what is rendered is only digits, spaces, M and L",
   /^[ML0-9 .]*$/.test(strokePath(cleaned[0] ?? [])), strokePath(cleaned[0] ?? []));

// ——— Coordinates are inside the square ———
//
// A pointer captured outside the pad reports coordinates outside it, and a
// stroke running to -4000 is a line across every card it is scaled into.
const wild = cleanDrawing([[-500, 99999, 1.4, 2.6, Infinity, -Infinity, NaN, 5]]);
ok("out-of-range coordinates are pulled back into the square",
   wild[0]?.every((value) => value >= 0 && value <= CANVAS) === true,
   JSON.stringify(wild));
ok("and everything is an integer, so the path has no float noise in it",
   wild[0]?.every((value) => Number.isInteger(value)) === true, JSON.stringify(wild));
ok("rounding is to the nearest, not toward zero",
   JSON.stringify(cleanDrawing([[1.4, 2.6]])) === "[[1,3]]",
   JSON.stringify(cleanDrawing([[1.4, 2.6]])));

// ——— Half a point ———
//
// ⚠️ Dropped rather than paired with a zero. A trailing lone coordinate padded
// out to (x, 0) draws a line to the top of the picture that nobody drew.
ok("an odd trailing coordinate is dropped",
   JSON.stringify(cleanDrawing([[10, 10, 20, 20, 30]])) === "[[10,10,20,20]]",
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
const total = fat.reduce((sum, stroke) => sum + stroke.length, 0) / 2;
ok("⚠️ the point budget is across the drawing, not per stroke",
   total <= MAX_POINTS, String(total));
ok("and what is kept is still whole points",
   fat.every((stroke) => stroke.length % 2 === 0), JSON.stringify(fat.map((s) => s.length)));

// ——— Ink ———
ok("an empty drawing has no ink", !hasInk([]));
ok("and neither does a drawing of empty strokes", !hasInk([[], []]));
ok("but a single dot does", hasInk(cleanDrawing([[7, 7]])));

// ——— The path ———
//
// A tap is one point. Without the line-to-itself a single tap draws nothing,
// and the pad reads as broken to whoever tests it with one poke.
ok("a single point becomes a dot rather than nothing",
   strokePath([7, 7]) === "M 7 7 L 7 7", strokePath([7, 7]));
ok("a line is a move and a line",
   strokePath([0, 0, 10, 10]) === "M 0 0 L 10 10", strokePath([0, 0, 10, 10]));
ok("and half a point renders nothing at all", strokePath([5]) === "");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
