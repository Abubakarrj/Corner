// Taking a note off the wall from the command line.
//
// ⚠️ Needs a scratch database and drops its own table.
//
// ——— What this is for, and why it is worth a suite ———
//
// scripts/notes.mjs is the shop's takedown. It exists because the wall's own
// unpin belongs to the browser that wrote the note, so there is nothing anybody
// at Corner can press to remove a test post, a real name somebody wants off the
// internet, or a photograph nobody consented to. Before this script that was a
// hand-written DELETE against the live table, which is how a WHERE clause on a
// name ends up also matching a real customer with the same name.
//
// So the property under test is not "the script runs". It is:
//
//   · a `remove` takes the row named and no other row, ever;
//   · without --yes it takes nothing at all, and says so;
//   · a `hide` is reversible and a `remove` is not, and the two are not
//     confusable;
//   · nothing it prints is bytes, a token, or a hash.
//
// ⚠️ The script is spawned rather than imported. It is the thing being tested —
// its argument parsing, its id check, its transaction — and a test that
// imported a function out of it would be testing everything except the part
// that gets typed wrong at two in the morning.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { addNote, listNotes } from "../app/cornerNotes";
import { SCHEMA, db, isDatabaseConfigured } from "../app/db";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else {
    failures += 1;
    console.log("FAIL ", what, detail);
  }
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "scripts", "notes.mjs");

/** Run the script the way a person would, and hand back what they would see. */
function run(...args: string[]): { code: number; out: string } {
  const result = spawnSync("node", [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  return { code: result.status ?? -1, out: `${result.stdout}${result.stderr}` };
}

if (!isDatabaseConfigured()) {
  console.log("\n⚠️ No CORNER_DATABASE_URL — skipping. This suite needs a scratch database.");
  process.exit(0);
}

async function main() {
  const client = db();
  if (!client) return;
  await client.query(`DROP TABLE IF EXISTS ${SCHEMA}.corner_notes`);

  // ——— ⚠️ The wall this runs against ———
  //
  // The target and six that must survive it. The decoys are the point: same
  // name in another neighbourhood, same neighbourhood under another name, and a
  // longer name that starts with the target's. A WHERE clause on a name catches
  // all of them, which is the mistake this script exists to make impossible.
  const written = new Map<string, { id: string; token: string }>();
  const put = async (
    key: string,
    name: string,
    neighborhood: string,
    note: string,
    drawing: unknown = [],
  ) => {
    const saved = await addNote({ name, neighborhood, note, drawing });
    if (saved) written.set(key, saved);
    return saved;
  };

  const target = await put("target", "Abu", "Ktown", "just testing", [
    { ink: 1, width: 2, points: [10, 10, 200, 200] },
  ]);
  await put("sameName", "Abu", "Larchmont", "a different Abu, a real note");
  await put("noPlace", "Abu", "", "an Abu who left no neighbourhood");
  await put("longer", "Abubakar", "Ktown", "a longer name that starts the same");
  await put("samePlace", "Rae", "Ktown", "somebody else in Ktown");
  await put("caseOnly", "abu", "ktown", "the same words in lower case");
  const second = await put("second", "Heeyoung", "Boston", "Corner Bagel Rocks!");

  if (!target || !second) {
    console.log("FAIL  could not write the wall to test against");
    process.exit(1);
  }
  const survivors = [...written.entries()].filter(([key]) => key !== "target" && key !== "second");

  console.log(`\n— ${written.size} notes on the wall —`);

  // ——— Finding the id, which is the step before every other one ———
  const listed = run("list");
  ok("list runs and exits clean", listed.code === 0, listed.out);
  ok(
    "and shows every note on the wall",
    [...written.values()].every((note) => listed.out.includes(note.id)),
  );

  const searched = run("list", "heeyoung");
  ok("a search narrows it", searched.out.includes(second.id) && !searched.out.includes(target.id));
  ok("and matches whatever case it is typed in", run("list", "HEEYOUNG").out.includes(second.id));
  ok(
    "it searches the note as well as the name",
    run("list", "just testing").out.includes(target.id),
  );
  ok("a search that matches nothing says 0", run("list", "zzzznope").out.includes("0 notes"));

  // ⚠️ Nothing secret goes to a terminal, a scrollback buffer or a screen
  // recording. The tokens are in this test's hands and nowhere in the output.
  ok(
    "⚠️ no unpin token is ever printed",
    [...written.values()].every((note) => !listed.out.includes(note.token)),
  );
  const hashes = await client.query<{ unpin_hash: string }>(
    `SELECT unpin_hash FROM ${SCHEMA}.corner_notes WHERE unpin_hash IS NOT NULL`,
  );
  ok(
    "⚠️ and neither is a hash out of the table",
    hashes.rows.every((row) => !listed.out.includes(row.unpin_hash)),
  );
  ok(
    "⚠️ nor the drawing, which is a wall of numbers in a terminal",
    !listed.out.includes("200,200") && !listed.out.includes("[10,10"),
  );
  ok("but it does say there is one", listed.out.includes("drawing"));

  // ——— ⚠️ Nothing happens without --yes ———
  const dry = run("remove", target.id);
  ok("remove without --yes exits clean", dry.code === 0, dry.out);
  ok("says nothing was deleted", dry.out.toLowerCase().includes("nothing deleted"));
  ok("and hands over the line that would do it", dry.out.includes(`remove ${target.id} --yes`));
  ok(
    "⚠️ and the note is still there",
    (await listNotes(100))?.some((note) => note.id === target.id) === true,
  );

  // ⚠️ One real id and one that is not there. The line it hands back has to be
  // the one that works — repeating the typo back means a command that exits
  // without deleting anything, and a person who runs it twice before reading.
  const mixed = run("remove", target.id, "n_00000000-0000-4000-8000-000000000001");
  ok(
    "a dry run over a missing id offers the command for the ones it found",
    mixed.out.includes(`remove ${target.id} --yes`) && !mixed.out.includes("000000000001 --yes"),
    mixed.out,
  );
  ok("and still says which one was missing", mixed.out.includes("no such note"));

  // ——— A typo does not become a deletion ———
  // ⚠️ Asserted on the message, not only on the exit code. Both of these would
  // exit non-zero anyway — the SELECT finds nothing and the script stops — so a
  // test that checked the code alone would pass with the shape check deleted,
  // which is how it was written the first time. The two answers mean different
  // things to the person reading them: "that is not an id" is a typo in the
  // thing they pasted, "no such note" is an id for a note that is not there.
  const nonsense = run("remove", "n_not-a-uuid", "--yes");
  ok("an id that is not the right shape is refused", nonsense.code === 1);
  ok("and named in the refusal", nonsense.out.includes("n_not-a-uuid"));
  ok(
    "⚠️ told it is not an id, rather than that there is no such note",
    nonsense.out.includes("Not the shape of a note id") && !nonsense.out.includes("no such note"),
    nonsense.out,
  );
  const injection = run("remove", "n_' OR '1'='1", "--yes");
  ok("⚠️ so is an injection attempt, before any query runs", injection.code === 1);
  ok(
    "⚠️ and it is turned away by its shape, not by matching no row",
    injection.out.includes("Not the shape of a note id"),
    injection.out,
  );
  const stranger = "n_00000000-0000-4000-8000-000000000000";
  const absent = run("remove", stranger, "--yes");
  ok("a well-formed id for no note exits non-zero", absent.code === 1);
  ok("and says which one", absent.out.includes(stranger));
  ok("as no such note, which is the other answer", absent.out.includes("no such note"));
  ok("nothing was removed by any of that", (await listNotes(100))?.length === written.size);

  // ——— Hide, which is the reversible one ———
  const hidden = run("hide", second.id);
  ok("hide runs", hidden.code === 0, hidden.out);
  ok(
    "the note comes off the wall",
    (await listNotes(100))?.some((note) => note.id === second.id) === false,
  );
  ok("and it is still a row", (await rowsFor(second.id)) === 1);
  ok("which list still finds", run("list").out.includes(second.id));
  ok("marked as hidden", run("list", "heeyoung").out.includes("hidden"));
  ok("show puts it back", run("show", second.id).code === 0);
  ok(
    "⚠️ back on the wall, unchanged",
    (await listNotes(100))?.some((note) => note.id === second.id) === true,
  );

  // ——— ⚠️ And remove, which does not ———
  const removed = run("remove", target.id, second.id, "--yes");
  ok("remove --yes runs", removed.code === 0, removed.out);
  ok("and says how many went", removed.out.includes("2 deleted"));
  ok("⚠️ the two rows are gone from the table, not hidden", (await rowsFor(target.id)) === 0);
  ok("both of them", (await rowsFor(second.id)) === 0);

  // The assertion the whole script is for.
  const left = await client.query<{ id: string; name: string; neighborhood: string | null }>(
    `SELECT id, name, neighborhood FROM ${SCHEMA}.corner_notes ORDER BY at`,
  );
  ok(
    "⚠️ and every note that merely resembled them survived",
    left.rowCount === survivors.length,
    `${left.rowCount} left, expected ${survivors.length}`,
  );
  ok(
    "⚠️ including the other Abu, the lower-case one, and Abubakar",
    survivors.every(([, note]) => left.rows.some((row) => row.id === note.id)),
    left.rows.map((row) => `${row.name}/${row.neighborhood ?? "—"}`).join(", "),
  );

  // Removing something already removed is not a second deletion; it is a person
  // running the same line twice out of scrollback, and it should say so rather
  // than report success.
  const again = run("remove", target.id, "--yes");
  ok("running the same removal twice says there is no such note", again.code === 1);
  ok("and nothing else moved", (await listNotes(100))?.length === survivors.length);

  // ——— The shape of being run wrong ———
  ok("no arguments prints the usage", run().out.includes("scripts/notes.mjs"));
  ok("a verb nobody has exits non-zero", run("delete-everything").code === 1);
  ok("remove with no id exits non-zero", run("remove", "--yes").code === 1);
  ok(
    "⚠️ and removing nothing did not empty the wall",
    (await listNotes(100))?.length === survivors.length,
  );

  // ——— ⚠️ A database with no wall on it ———
  //
  // The table is created by the app, on the first process that serves a
  // request. So a database nobody has written a note to has no table, and the
  // raw answer to that is a Postgres relation error that reads like the script
  // is broken. It is not: on the wrong connection string it is the most useful
  // thing this can say, and it has to say it in words.
  await client.query(`DROP TABLE ${SCHEMA}.corner_notes`);
  const bare = run("list");
  ok("a database with no wall on it exits non-zero", bare.code === 1);
  ok(
    "⚠️ and says so, rather than printing a relation error",
    bare.out.includes("No notes on this database") && !bare.out.includes("does not exist\n"),
    bare.out,
  );
  ok(
    "and points at the likely cause, which is the connection string",
    bare.out.includes("not the shop's database"),
  );

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);

  async function rowsFor(id: string): Promise<number> {
    const rows = await client!.query(
      `SELECT 1 FROM ${SCHEMA}.corner_notes WHERE id = $1`,
      [id],
    );
    return rows.rowCount ?? 0;
  }
}

void main();
