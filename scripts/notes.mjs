// Take a note off the Corner Notes wall from the command line.
//
// ——— ⚠️ Why this exists ———
//
// The wall has exactly one takedown control and it belongs to the browser that
// wrote the note: press unpin, and app/noteOwner.ts checks the secret that
// browser was handed. That is the right rule for visitors and it has a gap the
// shop falls into — nobody at Corner can take down a note from a phone they no
// longer have, and there is no admin screen, on purpose, because a wall with a
// login page is a wall with a login page to attack.
//
// What was happening instead was SQL, written out by hand each time, against a
// live table. A DELETE with a WHERE clause typed from memory is the kind of
// mistake nobody notices: `name = 'Abu'` also matches the other Abu. So the
// statement lives here, once, written carefully, and the thing typed by hand is
// an id that was copied off the previous command's output.
//
// ——— How to run it ———
//
//   node scripts/notes.mjs list                    everything on the wall
//   node scripts/notes.mjs list heeyoung           and only what matches
//   node scripts/notes.mjs remove n_abc… --yes     gone, for good
//   node scripts/notes.mjs hide n_abc…             off the wall, still a row
//   node scripts/notes.mjs show n_abc…             back up again
//
// It reads CORNER_DATABASE_URL, or DATABASE_URL, exactly as the app does — so
// run it wherever that variable points at the shop's database. On Render that
// is a shell on the service; from a laptop it is the external connection
// string. ⚠️ It prints notes, never bytes and never a token.

import { readFileSync } from "node:fs";
import pg from "pg";

// .env.local, if there is one, without pulling in a dependency to parse it.
// Same five lines as scripts/check-maps.mjs, and the same reason: this script
// is most useful run where the environment already carries the variable, and
// merely convenient run from a checkout.
try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // No .env.local. Fine.
}

const SCHEMA = "corner_bagel";
const TABLE = `${SCHEMA}.corner_notes`;

const url = process.env.CORNER_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();

/** A database on this machine, which will not be speaking TLS. Copied from
 *  app/db.ts, which explains why the check is on the host and not on the
 *  substring "localhost". */
function isLocal(value) {
  try {
    const host = new URL(value).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "";
  } catch {
    return false;
  }
}

// ⚠️ The shape ids are minted in — `n_` and a UUID, see addNote. Anything else
// was not issued by this app, and the difference between "no such note" and "a
// typo" is worth saying out loud here, where the person reading is the shop
// rather than a stranger. The wall itself refuses to make that distinction, and
// for the wall that is correct: app/cornerNotes.ts explains why.
const looksLikeId = (value) => /^n_[0-9a-f-]{36}$/.test(value);

const [, , verb, ...rest] = process.argv;
const yes = rest.includes("--yes");
const args = rest.filter((word) => word !== "--yes");

function usage(problem) {
  if (problem) console.error(`\n${problem}`);
  console.error(`
  node scripts/notes.mjs list [text]        every note, newest first
  node scripts/notes.mjs remove <id>…       delete it, for good   (add --yes)
  node scripts/notes.mjs hide <id>…         take it off the wall
  node scripts/notes.mjs show <id>…         put it back up
`);
  process.exit(problem ? 1 : 0);
}

/** One row, on one line, in the shape a person picks an id out of. */
function print(row) {
  const marks = [
    row.hidden ? "hidden" : null,
    row.has_drawing ? "drawing" : null,
    row.photo_state ? `photo:${row.photo_state}` : null,
  ].filter(Boolean);
  const when = row.at.toISOString().slice(0, 16).replace("T", " ");
  const who = row.neighborhood ? `${row.name} · ${row.neighborhood}` : row.name;
  console.log(`  ${row.id}`);
  console.log(`    ${when}  ${who}${marks.length ? `  [${marks.join(", ")}]` : ""}`);
  // ⚠️ Trimmed to a line. This is the field that decides whether the id above
  // is the right one, so it has to be readable, and it is also the field a
  // stranger typed — a note with four hundred characters in it should not push
  // the next id off the top of a terminal.
  if (row.note) console.log(`    ${row.note.length > 96 ? `${row.note.slice(0, 96)}…` : row.note}`);
}

async function main() {
  if (!verb || verb === "help" || verb === "--help") usage();
  if (!url) usage("No CORNER_DATABASE_URL or DATABASE_URL. Run this where the database is.");

  const db = new pg.Client({
    connectionString: url,
    // Render's managed Postgres presents a certificate signed by their own
    // authority; node-postgres refuses it outright without this. Off for a
    // local server, which usually has no TLS at all. See app/db.ts.
    ssl: isLocal(url) ? undefined : { rejectUnauthorized: false },
  });
  await db.connect();

  // ⚠️ Never `SELECT *`. The photo column is up to a megabyte of JPEG per row
  // and there is no reason to pull it across a connection to print a name.
  const COLUMNS = `id, name, neighborhood, note, hidden, photo_state,
                   drawing IS NOT NULL AS has_drawing, at`;

  if (verb === "list") {
    const search = args.join(" ").trim();
    // Hidden ones included, deliberately: the point of this list is to find a
    // row, and a row somebody already unpinned is still a row — which is the
    // whole reason `remove` exists alongside `hide`.
    const rows = await db.query(
      `SELECT ${COLUMNS} FROM ${TABLE}
        WHERE ($1::text IS NULL
               OR name ILIKE '%' || $1 || '%'
               OR coalesce(neighborhood, '') ILIKE '%' || $1 || '%'
               OR note ILIKE '%' || $1 || '%')
        ORDER BY at DESC
        LIMIT 200`,
      [search || null],
    );
    console.log(
      `\n${rows.rowCount} note${rows.rowCount === 1 ? "" : "s"}` +
        (search ? ` matching "${search}"` : "") +
        (rows.rowCount === 200 ? " (capped at 200 — narrow the search)" : ""),
    );
    console.log();
    for (const row of rows.rows) print(row);
    console.log();
    await db.end();
    return;
  }

  if (verb !== "remove" && verb !== "hide" && verb !== "show") usage(`No such command: ${verb}`);

  const ids = args;
  if (ids.length === 0) usage(`${verb} needs at least one id. Run \`list\` to find them.`);
  const wrong = ids.filter((id) => !looksLikeId(id));
  if (wrong.length > 0) usage(`Not the shape of a note id: ${wrong.join(", ")}`);

  // ——— ⚠️ Say what will happen before it happens ———
  //
  // Matched on the exact ids and nothing else. The reason this script takes ids
  // rather than a name is that a name is ambiguous and an id is not: there is
  // no clause here that could also catch a note nobody meant.
  const found = await db.query(
    `SELECT ${COLUMNS} FROM ${TABLE} WHERE id = ANY($1::text[]) ORDER BY at DESC`,
    [ids],
  );
  const missing = ids.filter((id) => !found.rows.some((row) => row.id === id));

  console.log(`\n${found.rowCount} of ${ids.length}:\n`);
  for (const row of found.rows) print(row);
  if (missing.length > 0) console.log(`\n  ⚠️ no such note: ${missing.join(", ")}`);
  if (found.rowCount === 0) {
    console.log();
    await db.end();
    process.exit(1);
  }

  if (verb === "hide" || verb === "show") {
    const gone = await db.query(
      `UPDATE ${TABLE} SET hidden = $2 WHERE id = ANY($1::text[])`,
      [ids, verb === "hide"],
    );
    console.log(`\n${gone.rowCount} ${verb === "hide" ? "taken off the wall" : "back up"}.`);
    console.log(
      verb === "hide"
        ? "Still a row — `show` puts it back, `remove --yes` ends it.\n"
        : "",
    );
    await db.end();
    return;
  }

  // ——— ⚠️ remove, which is the one that does not come back ———
  //
  // Hiding is the wall's own takedown and it is reversible on purpose — see the
  // header of app/cornerNotes.ts. This is the other thing, for a note that
  // should not exist rather than a note that should not be up: a test post, a
  // real name somebody wants off the internet, a photograph nobody consented
  // to. So it asks. Not because deleting two rows is dangerous, but because the
  // difference between this and `hide` is the entire point and the flag is
  // where a person notices which one they typed.
  if (!yes) {
    console.log(`\nNothing deleted. Add --yes to delete ${found.rowCount === 1 ? "it" : "them"}:`);
    // ⚠️ The ids that were found, not the ids that were typed. If one of them
    // was a typo the line above already said so, and handing back a command
    // that exits without deleting anything is a worse answer than handing back
    // the one that removes the notes just printed.
    console.log(
      `\n  node scripts/notes.mjs remove ${found.rows.map((row) => row.id).join(" ")} --yes\n`,
    );
    await db.end();
    return;
  }

  // In a transaction, so a connection dropped halfway through takes none of
  // them rather than some of them.
  await db.query("BEGIN");
  const gone = await db.query(`DELETE FROM ${TABLE} WHERE id = ANY($1::text[])`, [ids]);
  if (gone.rowCount !== found.rowCount) {
    // Somebody deleted a row between the SELECT and the DELETE, or the WHERE
    // clause is not saying what it looks like it says. Either way this is not
    // the moment to shrug and commit.
    await db.query("ROLLBACK");
    console.error(`\n⚠️ Expected to delete ${found.rowCount} and matched ${gone.rowCount}. Nothing changed.\n`);
    await db.end();
    process.exit(1);
  }
  await db.query("COMMIT");
  console.log(`\n${gone.rowCount} deleted. The photographs and drawings went with them.\n`);
  await db.end();
}

main().catch((error) => {
  // ⚠️ The table is created by the app, on the first process that serves a
  // request — see the DDL in app/cornerNotes.ts, and the comment there about
  // why it lives in the code rather than in a migration somebody runs. So a
  // database nobody has written a note to has no table at all, and Postgres
  // answers that with a relation error that reads like a broken script.
  //
  // It is not one. It is the answer "there are no notes here", and on the
  // wrong connection string it is the more useful answer of the two: this is
  // what a script pointed at the staging database says.
  if (error?.code === "42P01") {
    console.error(`\nNo notes on this database — ${TABLE} does not exist yet.`);
    console.error("Nobody has written to the wall here, or this is not the shop's database.\n");
    process.exit(1);
  }
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
