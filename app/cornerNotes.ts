import "server-only";

import { SCHEMA, db, explainDbError, isDatabaseConfigured, ready } from "./db";
import { cleanDrawing, hasInk, type Drawing } from "./drawing";
import {
  MAX_NAME,
  MAX_NEIGHBORHOOD,
  MAX_NOTE,
  type CornerNote,
} from "./cornerNotesShape";

// The visitor's log: notes and drawings people leave for the shop.
//
// ——— ⚠️ This is the only place in the app that publishes what a stranger typed ———
//
// Everything else the public sends here goes to one reader: an order goes to
// the kitchen, a job application goes to an inbox, a gift message goes to the
// person it was written for. A note goes on a wall that every future visitor
// sees, which makes it a different kind of thing to store.
//
// So three rules, all enforced below rather than hoped for:
//
//   · Nothing rendered from this table is ever markup. Text is text — React
//     escapes it — and the drawing is numbers this app turns into an SVG path
//     itself. See app/drawing.ts for why that shape was chosen over an image.
//   · Every row can be taken down, and taking one down does not delete it.
//     `hidden` is a column rather than a DELETE so a mistake is reversible and
//     so a pattern of abuse from one place stays visible to whoever is dealing
//     with it.
//   · What is collected is what appears. A name, a neighbourhood and a note,
//     all of them volunteered and all of them public. No address, no email, no
//     IP kept against the row — the rate limiter holds addresses in memory for
//     an hour and this table never sees one.
//
// ——— Names are not identities ———
//
// Nobody signs in to leave a note. "emeka" is whatever somebody typed, and two
// notes signed the same name are not the same person. That is fine for a wall
// in a bagel shop and it is the reason nothing here is joined to an account.

const DDL = `
  CREATE TABLE IF NOT EXISTS ${SCHEMA}.corner_notes (
    id            TEXT PRIMARY KEY,
    -- All three are what somebody typed, trimmed and capped. Neighbourhood is
    -- optional and often the best part: a wall of notes from Koreatown, Echo
    -- Park and one from Osaka says something a list of names does not.
    name          TEXT NOT NULL,
    neighborhood  TEXT,
    note          TEXT NOT NULL,
    -- ⚠️ The drawing, as JSON: an array of strokes, each a flat array of
    -- integers. Never an image. jsonb rather than text so a malformed value
    -- cannot be written at all, and so this is queryable if it ever needs to
    -- be. Null for a note left without one, which is allowed.
    drawing       JSONB,
    at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Taken down, without being lost. See the note at the top.
    hidden        BOOLEAN NOT NULL DEFAULT false
  );
  -- ⚠️ Here rather than in a script somebody runs: ready() executes this whole
  -- string on every process, and CREATE TABLE IF NOT EXISTS does nothing to a
  -- table that already exists. A column added later has to arrive this way or
  -- the first deployment to get it keeps the old shape.
  ALTER TABLE ${SCHEMA}.corner_notes ADD COLUMN IF NOT EXISTS neighborhood TEXT;
  ALTER TABLE ${SCHEMA}.corner_notes ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
  -- The wall reads newest first and skips the hidden ones, so that is the index.
  CREATE INDEX IF NOT EXISTS corner_notes_wall
    ON ${SCHEMA}.corner_notes (at DESC) WHERE hidden = false;
`;

const prepared = () => ready("corner_notes", DDL);

// The caps and the note's shape live in cornerNotesShape.ts, which the wall
// can import and this file cannot be imported by. Re-exported so a server-side
// caller has one place to reach for.
export { MAX_NAME, MAX_NEIGHBORHOOD, MAX_NOTE } from "./cornerNotesShape";
export type { CornerNote } from "./cornerNotesShape";

/** One field off a request body: a string, trimmed, capped, and "" for
 *  anything that is not one.
 *
 *  ⚠️ Control characters go, including the newlines somebody uses to push a
 *  note down the wall past everybody else's. A note is a sentence, not a
 *  layout. */
export function readField(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return (
    value
      // Control characters and every kind of line break become one space. A
      // note is a sentence on a card; forty newlines is a card the height of
      // the page, with everybody else's pushed off the bottom of it.
      .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max)
  );
}

/** Somebody has to have said something. A drawing on its own counts — that is
 *  a note too — and so does a line of text with no picture. Neither is not. */
export function isWorthKeeping(note: string, drawing: Drawing): boolean {
  return note.length > 0 || hasInk(drawing);
}

/** Write a note to the wall.
 *
 *  Returns the id, or null when there is no database — the caller turns that
 *  into an honest "we couldn't save that" rather than a confirmation for a
 *  note nobody kept. */
export async function addNote(input: {
  name: string;
  neighborhood: string;
  note: string;
  drawing: unknown;
}): Promise<string | null> {
  const client = db();
  if (!client) return null;

  const drawing = cleanDrawing(input.drawing);
  const name = readField(input.name, MAX_NAME);
  const note = readField(input.note, MAX_NOTE);
  const neighborhood = readField(input.neighborhood, MAX_NEIGHBORHOOD);
  if (!isWorthKeeping(note, drawing)) return null;

  // Not sequential, and not guessable. Nothing is authorised by knowing one,
  // but an id somebody can count through is an invitation to walk the table.
  const id = `n_${crypto.randomUUID()}`;

  try {
    await prepared();
    await client.query(
      `INSERT INTO ${SCHEMA}.corner_notes (id, name, neighborhood, note, drawing)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        // A wall of "anonymous" is friendlier than a wall of blanks, and the
        // name field is optional on purpose: a drawing signed by nobody is
        // still worth putting up.
        name || "anonymous",
        neighborhood || null,
        note,
        drawing.length > 0 ? JSON.stringify(drawing) : null,
      ],
    );
    return id;
  } catch (error) {
    console.error(`[corner-notes] could not save a note: ${explainDbError(error)}`);
    return null;
  }
}

/** The wall, newest first.
 *
 *  ⚠️ Returns null for "we cannot say" and [] for "nobody has written yet".
 *  The screens say different things about those two, and collapsing them would
 *  tell a visitor the wall is empty because a database is down. */
export async function listNotes(limit = 60, offset = 0): Promise<CornerNote[] | null> {
  const client = db();
  if (!client) return null;

  try {
    await prepared();
    const rows = await client.query<{
      id: string;
      name: string;
      neighborhood: string | null;
      note: string;
      drawing: unknown;
      at: Date;
    }>(
      `SELECT id, name, neighborhood, note, drawing, at
         FROM ${SCHEMA}.corner_notes
        WHERE hidden = false
        ORDER BY at DESC
        LIMIT $1 OFFSET $2`,
      [Math.min(Math.max(limit, 1), 120), Math.max(offset, 0)],
    );
    return rows.rows.map((row) => ({
      id: row.id,
      name: row.name,
      neighborhood: row.neighborhood,
      note: row.note,
      // ⚠️ Cleaned on the way out as well as on the way in. The row was
      // written by an older version of this code, or by hand, or by a version
      // of it with a bug — and this is the last place before it becomes an
      // SVG path on somebody's screen.
      drawing: row.drawing === null ? null : cleanDrawing(row.drawing),
      at: row.at.toISOString(),
    }));
  } catch (error) {
    console.error(`[corner-notes] could not read the wall: ${explainDbError(error)}`);
    return null;
  }
}

/** How many are up. Null when there is no database to ask. */
export async function countNotes(): Promise<number | null> {
  const client = db();
  if (!client) return null;
  try {
    await prepared();
    const rows = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${SCHEMA}.corner_notes WHERE hidden = false`,
    );
    return Number(rows.rows[0]?.count ?? 0);
  } catch (error) {
    console.error(`[corner-notes] could not count the wall: ${explainDbError(error)}`);
    return null;
  }
}

/** Whether the wall can work at all. The pill and the page read this so a
 *  deployment with no database says so rather than showing an empty wall. */
export function isNotesConfigured(): boolean {
  return isDatabaseConfigured();
}
