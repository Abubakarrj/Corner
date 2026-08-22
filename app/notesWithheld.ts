// ⚠️ TEMPORARY. Notes kept off the wall by configuration rather than by the
// database, for when the shop cannot reach the database.
//
// ——— Why this exists ———
//
// The shop needed two of its own test notes off Corner Notes before a meeting
// and had no way to hide them: no computer to hand, and the takedown control
// (app/shopKeeper.ts) written but not yet deployed. A Render environment
// variable was reachable from a phone; a psql session was not.
//
// ——— ⚠️ Why an environment variable and not a list in this file ———
//
// The first version hardcoded the two names here, and it broke two unrelated
// test suites within a minute: tests/notesAdmin.test.ts and
// tests/noteUnpin.test.ts both use "Abu · Ktown" as a fixture, precisely
// because it mirrors the real note, and both went blind when listNotes stopped
// returning it.
//
// That is the whole argument in miniature. A suppression compiled into the code
// is a suppression that applies to every environment that runs the code —
// tests, previews, somebody's laptop — and it can only be undone by editing and
// deploying again. Read from the environment, it is off everywhere by default,
// on exactly where it is set, and **removed by deleting the variable**. No
// second deploy to put the wall back.
//
// ⚠️ Which is the one thing to remember about it: this comes off by clearing
// NOTES_WITHHELD in Render, not by a code change.
//
// ——— What it does not do ———
//
// The rows are untouched: still there, still `hidden = false`. So they are on
// the wall as far as the rest of the app is concerned — countNotes() counts
// them, listNeighborhoods() counts their neighbourhoods, and whoever wrote one
// still sees an unpin control for a card nobody else can see. That is fine for
// a few days and is not a way to moderate a wall. The real takedowns are
// /notes/keeper and scripts/notes.mjs.
//
// ⚠️ And it matches on a name and a place rather than an id, because an id
// lives in the database, which is the thing that could not be reached. That is
// broader than an id: a visitor who signs a note "Abu" in Ktown disappears too.
// Two people in a city of four million can share a name and a neighbourhood.

/** ⚠️ Between the two halves of a key, and it must be the character the SQL in
 *  listNotes() uses — that clause builds the key a second time, in Postgres,
 *  and the two have to agree exactly.
 *
 *  They did not, briefly, which is why this is a named constant: the first
 *  draft joined with a stray NUL on this side and a space on the SQL side, so
 *  no key ever matched, nothing was withheld, and every test comparing one call
 *  to another still passed. */
export const SEPARATOR = "|";

/** The variable, read on every call rather than at import.
 *
 *  ⚠️ On purpose: clearing it in Render should take the notes back the moment
 *  the next request is served, not on the next deploy. It is also what lets a
 *  test set it and unset it. */
export const WITHHELD_ENV = "NOTES_WITHHELD";

export type Withheld = { name: string; neighborhood: string };

/** What is configured, as pairs.
 *
 *  Format: `Name|Neighbourhood`, comma-separated —
 *
 *      NOTES_WITHHELD="Abu|Ktown,Heeyoung|Boston"
 *
 *  ⚠️ Total. An unset variable, an empty one, stray commas, an entry with no
 *  separator, an entry that is only a separator: all of them yield nothing
 *  withheld rather than an error. This runs while rendering the public wall, so
 *  the failure mode for a typo has to be "the note stays up" — never a page
 *  that 500s, and never an empty wall. */
export function withheld(): Withheld[] {
  const raw = process.env[WITHHELD_ENV]?.trim();
  if (!raw) return [];
  const out: Withheld[] = [];
  for (const entry of raw.split(",")) {
    const at = entry.indexOf(SEPARATOR);
    if (at < 0) continue;
    const name = entry.slice(0, at).trim();
    // ⚠️ A blank name is skipped rather than treated as a wildcard. An entry
    // like "|Ktown" is a typo, and the reading of it that hides every
    // anonymous note in a neighbourhood is not one anybody intended.
    if (!name) continue;
    out.push({ name, neighborhood: entry.slice(at + 1).trim() });
  }
  return out;
}

/** The match key for a note, built the way the SQL builds it. */
export function withheldKey(name: string, neighborhood: string | null): string {
  return `${name.trim().toLowerCase()}${SEPARATOR}${(neighborhood ?? "").trim().toLowerCase()}`;
}

/** The keys, for the query.
 *
 *  ⚠️ Empty when nothing is configured, and the SQL is written as `<> ALL` so
 *  an empty array withholds nothing. A hand-rolled `NOT IN ()` would withhold
 *  everything, on the deploy where somebody cleared the variable. */
export function withheldKeys(): string[] {
  return withheld().map((one) => withheldKey(one.name, one.neighborhood));
}

/** Whether a note would be kept off the wall — the same answer the query
 *  gives, for anything holding a note rather than running a query. */
export function isWithheld(name: string, neighborhood: string | null): boolean {
  return withheldKeys().includes(withheldKey(name, neighborhood));
}
