// Two notes kept off the wall by the code.
//
// ⚠️ Needs a scratch database and drops its own table.
//
// ——— ⚠️ A test for something that should not exist for long ———
//
// app/notesWithheld.ts is a stopgap: the shop needed two of its own test notes
// off Corner Notes before a meeting and could not reach the database to hide
// them. It is driven by NOTES_WITHHELD and it comes off by clearing that
// variable, so this suite defends two things in opposite directions:
//
//   · with the variable set, those notes are off every view of the wall and
//     everybody else's are untouched;
//   · with it unset — which is everywhere else, including every other suite in
//     this directory — nothing is withheld at all.
//
// The second matters more. The first draft of this feature hardcoded the two
// names in the source and broke tests/notesAdmin.test.ts and
// tests/noteUnpin.test.ts inside a minute, because both use "Abu · Ktown" as a
// fixture. A suppression compiled into the code applies to every environment
// that runs the code. That is what moved it into the environment, and the
// "unset" block below is what keeps it there.

import { addNote, listNotes } from "../app/cornerNotes";
import {
  SEPARATOR,
  WITHHELD_ENV,
  isWithheld,
  withheld,
  withheldKey,
  withheldKeys,
} from "../app/notesWithheld";
import { SCHEMA, db, isDatabaseConfigured } from "../app/db";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else {
    failures += 1;
    console.log("FAIL ", what, detail);
  }
};

/** Run something with a particular NOTES_WITHHELD set.
 *
 *  ⚠️ Synchronous bodies only. The `finally` fires when the body returns, so an
 *  async body gets its variable restored the instant it yields — long before
 *  anything it awaited has run. Unset by hand around an await instead. */
function withEnv<T>(value: string | undefined, body: () => T): T {
  const before = process.env[WITHHELD_ENV];
  if (value === undefined) delete process.env[WITHHELD_ENV];
  else process.env[WITHHELD_ENV] = value;
  try {
    return body();
  } finally {
    if (before === undefined) delete process.env[WITHHELD_ENV];
    else process.env[WITHHELD_ENV] = before;
  }
}

const SET = "Abu|Ktown,Heeyoung|Boston";

// ——— ⚠️ Unset, which is every environment but one ———
//
// The block that keeps this feature from leaking. Nothing may be withheld when
// the variable is absent, and the wall must work exactly as it did before this
// file existed.
console.log("\n— with NOTES_WITHHELD unset —");
withEnv(undefined, () => {
  ok("⚠️ nothing is configured", withheld().length === 0);
  ok("⚠️ and no keys go to the query", withheldKeys().length === 0);
  ok("⚠️ so nothing is withheld", isWithheld("Abu", "Ktown") === false);
});

// ——— ⚠️ And every way of setting it wrong ———
//
// This is read while rendering a public page, so a typo has to leave the note
// up. Never a page that throws, never an empty wall.
console.log("\n— set to nonsense —");
for (const [what, value] of [
  ["empty", ""],
  ["whitespace", "   "],
  ["a comma", ","],
  ["commas", ",,,"],
  ["no separator", "Abu"],
  ["a separator alone", "|"],
  ["⚠️ no name, which is not a wildcard", "|Ktown"],
  ["trailing comma", "Abu|Ktown,"],
] as const) {
  const got = withEnv(value, () => withheld().length);
  const wildcards = withEnv(value, () => isWithheld("anybody", "Ktown"));
  ok(`${what} withholds nothing it should not`, got <= 1 && wildcards === false,
     `${got} entries, wildcard ${wildcards}`);
}
ok("⚠️ a blank name never hides a whole neighbourhood",
   withEnv("|Ktown", () => withheld().length) === 0);
ok("spaces round an entry are trimmed",
   withEnv(" Abu | Ktown ", () => isWithheld("Abu", "Ktown")) === true);

console.log(`\n— set to "${SET}" —`);

process.env[WITHHELD_ENV] = SET;

// ——— The key, which the SQL builds character for character ———
// ⚠️ The exact string, not a comparison of two calls to the same function.
// The first draft asserted only self-consistency and passed while the key was
// built with a NUL byte on this side and a space in the SQL — which withheld
// nothing and looked like working code. A literal here is what pins this half
// to the clause in listNotes(); the wall tests below are what pin the other.
ok("a key is the name and the place, lower-cased, joined by the separator",
   withheldKey("Abu", "Ktown") === `abu${SEPARATOR}ktown`,
   JSON.stringify(withheldKey("Abu", "Ktown")));
ok("⚠️ and the separator is one plain character the SQL can also write",
   SEPARATOR.length === 1 && /^[!-~]$/.test(SEPARATOR), JSON.stringify(SEPARATOR));
ok("⚠️ and matched however it was cased or spaced",
   withheldKey("  ABU ", " ktown  ") === withheldKey("Abu", "Ktown"));
ok("a missing neighbourhood is the empty half rather than a crash",
   withheldKey("Abu", null) === `abu${SEPARATOR}`,
   JSON.stringify(withheldKey("Abu", null)));
ok("⚠️ which is not the same key as one with a neighbourhood",
   withheldKey("Abu", null) !== withheldKey("Abu", "Ktown"));

ok("the two notes are withheld", isWithheld("Abu", "Ktown") && isWithheld("Heeyoung", "Boston"));
ok("⚠️ the same name somewhere else is not",
   isWithheld("Abu", "Larchmont") === false);
ok("⚠️ nor the same place under another name",
   isWithheld("Rae", "Ktown") === false);
ok("nor a longer name that starts the same",
   isWithheld("Abubakar", "Ktown") === false);
ok("nor a name with no neighbourhood", isWithheld("Abu", null) === false);
ok("and an ordinary note is not", isWithheld("Michael", "Dtla") === false);

if (!isDatabaseConfigured()) {
  console.log("\n⚠️ No CORNER_DATABASE_URL — skipping the wall itself.");
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

async function main() {
  const client = db();
  if (!client) return;
  await client.query(`DROP TABLE IF EXISTS ${SCHEMA}.corner_notes`);

  // The two, plus the ones that merely resemble them.
  const wrote = new Map<string, string>();
  for (const [key, name, place, note] of [
    ["target1", "Abu", "Ktown", "Happy to be here"],
    ["target2", "Heeyoung", "Boston", "Corner Bagel Rocks!"],
    ["sameName", "Abu", "Larchmont", "a different Abu"],
    ["samePlace", "Rae", "Ktown", "somebody else in Ktown"],
    ["longer", "Abubakar", "Ktown", "a longer name"],
    ["cased", "ABU", "KTOWN", "⚠️ the same two words shouting"],
    ["ordinary", "Michael", "Dtla", "open soon please"],
  ] as const) {
    const saved = await addNote({ name, neighborhood: place, note, drawing: [] });
    if (saved) wrote.set(key, saved.id);
  }
  ok("the wall was written", wrote.size === 7, String(wrote.size));

  const onWall = async (options = {}) => {
    const notes = await listNotes(120, 0, options);
    return new Set((notes ?? []).map((note) => note.id));
  };

  console.log("\n— the wall —");
  const wall = await onWall();
  ok("⚠️ the first note is off the wall", !wall.has(wrote.get("target1")!));
  ok("⚠️ and so is the second", !wall.has(wrote.get("target2")!));
  // ⚠️ The one that catches a `= ANY` written the other way round, and the one
  // that would have been missed by matching on the raw string: the same two
  // words in capitals is the same note to a person and a different row to a
  // comparison that does not fold case.
  ok("⚠️ including the same two words in capitals", !wall.has(wrote.get("cased")!));

  for (const key of ["sameName", "samePlace", "longer", "ordinary"]) {
    ok(`${key} is still up`, wall.has(wrote.get(key)!));
  }
  ok("four of the seven are on the wall", wall.size === 4, String(wall.size));

  // ——— ⚠️ Every view, not just the scattered one ———
  //
  // /notes/all reads the same function with byPlace and a neighbourhood
  // filter, and a note that is off one wall and on the other is worse than a
  // note that is on both — it is hidden where somebody is looking and visible
  // where they are not.
  console.log("\n— and the other views of it —");
  ok("⚠️ off the by-place listing too",
     !(await onWall({ byPlace: true })).has(wrote.get("target1")!));
  const ktown = await onWall({ in: "Ktown" });
  ok("⚠️ off the filter for its own neighbourhood", !ktown.has(wrote.get("target1")!));
  ok("while the rest of Ktown is there", ktown.size === 2, String(ktown.size));
  ok("off the Boston filter as well",
     !(await onWall({ in: "Boston" })).has(wrote.get("target2")!));

  // ——— ⚠️ LIMIT still counts what it returns ———
  //
  // The clause is in the WHERE rather than a filter over the results, so a page
  // that asks for four gets four. A post-filter would have served two here and
  // broken the paging on /notes/all in a way nobody notices until a page is
  // short.
  const four = await listNotes(4);
  ok("⚠️ a page of four is four, not four minus the withheld",
     (four ?? []).length === 4, String((four ?? []).length));

  // ——— ⚠️ And the day this file is deleted ———
  //
  // The whole point. Emptying the list has to withhold nothing — the failure a
  // `NOT IN (...)` on an empty list gives you is an empty wall, silently, on
  // the deploy where somebody did the tidying up.
  // ⚠️ The point. Clearing the variable has to put the wall back — and the
  // failure a `NOT IN ()` over an empty list gives is an empty wall, silently,
  // on the deploy where somebody did the tidying up.
  console.log("\n— and when the variable is cleared, which is the point —");
  // ⚠️ Unset by hand rather than through withEnv. That helper restores the
  // variable in a synchronous `finally`, which runs the moment an async body
  // returns its promise — so the query underneath ran with the setting already
  // back, and this reported 4 of 7 for code that was correct. A sync try/finally
  // around an await does not do what it looks like it does.
  delete process.env[WITHHELD_ENV];
  ok("there are no keys", withheldKeys().length === 0);
  ok("nothing is withheld", isWithheld("Abu", "Ktown") === false);
  const cleared = await onWall();
  process.env[WITHHELD_ENV] = SET;
  ok("⚠️ every note is back on the wall, rather than none of them",
     cleared.size === 7, `${cleared.size} of 7`);
  ok("and the setting is back for anything after this", withheldKeys().length === 2);

  await client.query(`DROP TABLE ${SCHEMA}.corner_notes`);
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
