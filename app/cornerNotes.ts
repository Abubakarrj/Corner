import "server-only";

import { SCHEMA, db, explainDbError, isDatabaseConfigured, ready } from "./db";
import { cleanDrawing, hasInk, type Drawing } from "./drawing";
import { isPhotoState, photoOnWall, type PhotoState } from "./notePhoto";
import { deviceMatches } from "./noteDevice";
import { hashUnpinToken, mintUnpinToken, tokenMatches } from "./noteOwner";
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
    -- ⚠️ A photograph, and the exception to everything said above about images.
    -- The bytes are one JPEG, re-encoded by the browser and checked here; see
    -- app/notePhoto.ts, which is where the weaker guarantee a photo gets is
    -- written down. Null for the notes that are words and a drawing, which is
    -- most of them.
    --
    -- In the row rather than in a bucket somewhere: a note is a small object
    -- that is taken down as one thing, and a photo living in object storage is
    -- a second place to remember to hide it from. Bounded at PHOTO_MAX_BYTES
    -- on the way in, so a row is under a megabyte in the worst case.
    photo         BYTEA,
    -- pending / clear / refused, and null when there is no photograph. ⚠️ Only
    -- 'clear' is ever served. See photoIsPublic().
    photo_state   TEXT,
    at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Taken down, without being lost. See the note at the top.
    hidden        BOOLEAN NOT NULL DEFAULT false,
    -- ⚠️ A SHA-256 of the secret handed to the browser that wrote this note,
    -- which is the only thing on the wall that can prove who left it — there
    -- are no accounts. The secret itself is never here and never comes back out
    -- of this table. See app/noteOwner.ts.
    unpin_hash    TEXT
  );
  -- ⚠️ Here rather than in a script somebody runs: ready() executes this whole
  -- string on every process, and CREATE TABLE IF NOT EXISTS does nothing to a
  -- table that already exists. A column added later has to arrive this way or
  -- the first deployment to get it keeps the old shape.
  ALTER TABLE ${SCHEMA}.corner_notes ADD COLUMN IF NOT EXISTS neighborhood TEXT;
  ALTER TABLE ${SCHEMA}.corner_notes ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE ${SCHEMA}.corner_notes ADD COLUMN IF NOT EXISTS photo BYTEA;
  ALTER TABLE ${SCHEMA}.corner_notes ADD COLUMN IF NOT EXISTS photo_state TEXT;
  ALTER TABLE ${SCHEMA}.corner_notes ADD COLUMN IF NOT EXISTS unpin_hash TEXT;
  -- ⚠️ The second proof of authorship, and the one that survives Safari
  -- throwing localStorage away after a week. See app/noteDevice.ts. Nullable
  -- because every note written before it existed has none, and those are still
  -- unpinnable by their token.
  ALTER TABLE ${SCHEMA}.corner_notes ADD COLUMN IF NOT EXISTS device_hash TEXT;
  -- "which of these did this browser write" is asked once per render of
  -- /notes/all, against a table that only grows.
  CREATE INDEX IF NOT EXISTS corner_notes_device
    ON ${SCHEMA}.corner_notes (device_hash) WHERE device_hash IS NOT NULL;
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
 *  a note too — and so does a line of text with no picture, and so does a
 *  photograph with neither. Nothing at all is not.
 *
 *  ⚠️ The photograph counts before anybody has looked at it. It has to: this
 *  runs at the moment of the write and the review has not happened yet, so
 *  requiring a cleared photo would mean a picture on its own could never be
 *  saved and there would be nothing left to review. A note that turns out to be
 *  a refused photo and no words is a card with an empty frame, which is a shape
 *  the wall already has. */
export function isWorthKeeping(
  note: string,
  drawing: Drawing,
  photo: Uint8Array | null = null,
): boolean {
  return note.length > 0 || hasInk(drawing) || photo !== null;
}

/** Write a note to the wall.
 *
 *  Returns the id and the secret that takes it down again, or null when there
 *  is no database — the caller turns that into an honest "we couldn't save
 *  that" rather than a confirmation for a note nobody kept.
 *
 *  ⚠️ The token is returned here and nowhere else, ever. It is not on the note
 *  shape, it is not in listNotes, and it is not in any response but the 201 for
 *  the request that created the note. A wall that handed out unpin tokens with
 *  its cards would be a wall anybody could clear. */
export async function addNote(input: {
  name: string;
  neighborhood: string;
  note: string;
  drawing: unknown;
  /** ⚠️ Already decoded and already checked — readPhoto() in app/notePhoto.ts,
   *  not `unknown` like the drawing. The drawing can be cleaned into something
   *  safe out of any input at all; a photograph either is a JPEG under the cap
   *  or is not stored, and that decision does not belong in the middle of an
   *  INSERT. */
  photo?: Uint8Array | null;
  /** ⚠️ The hash of this browser's device cookie, not the cookie. The secret
   *  stays in the header it arrived in; what is stored is what it hashes to,
   *  so a copy of this table unpins nothing. Null when the browser has not been
   *  given one yet, which is every request before the cookie is set. */
  deviceHash?: string | null;
}): Promise<{ id: string; token: string } | null> {
  const client = db();
  if (!client) return null;

  const drawing = cleanDrawing(input.drawing);
  const name = readField(input.name, MAX_NAME);
  const note = readField(input.note, MAX_NOTE);
  const neighborhood = readField(input.neighborhood, MAX_NEIGHBORHOOD);
  const photo = input.photo ?? null;
  if (!isWorthKeeping(note, drawing, photo)) return null;

  // Not sequential, and not guessable. Nothing is authorised by knowing one,
  // but an id somebody can count through is an invitation to walk the table.
  const id = `n_${crypto.randomUUID()}`;
  // Minted here rather than in the route, so there is no path that writes a
  // note without one and no caller that has to remember to.
  const token = mintUnpinToken();

  try {
    await prepared();
    await client.query(
      `INSERT INTO ${SCHEMA}.corner_notes
         (id, name, neighborhood, note, drawing, photo, photo_state, unpin_hash, device_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        // A wall of "anonymous" is friendlier than a wall of blanks, and the
        // name field is optional on purpose: a drawing signed by nobody is
        // still worth putting up.
        name || "anonymous",
        neighborhood || null,
        note,
        drawing.length > 0 ? JSON.stringify(drawing) : null,
        // Buffer rather than the Uint8Array: node-postgres writes a Buffer as
        // bytea and does not know what to do with anything else.
        photo ? Buffer.from(photo) : null,
        // ⚠️ Born pending, in the same statement as the bytes. Not "written
        // now, marked pending in a moment": a photo that exists with a null
        // state is a photo no serving rule covers, and the window in which one
        // could exist is the window in which it could be served.
        photo ? ("pending" satisfies PhotoState) : null,
        hashUnpinToken(token),
        input.deviceHash ?? null,
      ],
    );
    return { id, token };
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
export async function listNotes(
  limit = 60,
  offset = 0,
  options: {
    /** Only this neighbourhood. Absent means all of them. */
    in?: string;
    /** ⚠️ Grouped by neighbourhood rather than by time. The wall reads newest
     *  first, which is the right order for a thing people come back to; the
     *  full list reads by place, which is the only order that makes a few
     *  hundred cards answerable — "who else is in Koreatown" is a question,
     *  "what came in on Tuesday" is not. */
    byPlace?: boolean;
  } = {},
): Promise<CornerNote[] | null> {
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
      has_photo: boolean;
      photo_state: string | null;
      at: Date;
    }>(
      // ⚠️ The two orderings are literals chosen here, never interpolated
      // from anything a caller passed. A sort column off a query string is one
      // string concatenation away from being the injection this file spends
      // the rest of its length avoiding.
      //
      // NULLS LAST so the notes from nobody-said-where sit at the end rather
      // than at the top, which is where an unqualified sort puts them.
      // ⚠️ `photo IS NOT NULL`, not `photo`. A hundred cards is a hundred
      // JPEGs, and selecting the bytes to answer "is there a picture" would
      // pull tens of megabytes across the connection to render a page that
      // then fetches every one of them again by URL. The bytes have exactly
      // one way out of this table and it is notePhotoBytes(), below.
      `SELECT id, name, neighborhood, note, drawing,
              photo IS NOT NULL AS has_photo, photo_state, at
         FROM ${SCHEMA}.corner_notes
        WHERE hidden = false
          AND ($3::text IS NULL OR lower(neighborhood) = lower($3))
        ORDER BY ${options.byPlace ? "neighborhood ASC NULLS LAST, at DESC" : "at DESC"}
        LIMIT $1 OFFSET $2`,
      [
        Math.min(Math.max(limit, 1), 120),
        Math.max(offset, 0),
        readField(options.in ?? "", MAX_NEIGHBORHOOD) || null,
      ],
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
      // ⚠️ Both halves, and in this order. `has_photo` is asked first because
      // a state without bytes is a lie the wall would tell forever: a row whose
      // photo failed to write but whose state says pending is a card that
      // develops until somebody notices. And the state is run through
      // isPhotoState because this column is TEXT — nothing in Postgres stops a
      // hand-written UPDATE putting a word in it that no code here knows.
      photo: row.has_photo && isPhotoState(row.photo_state)
        ? photoOnWall(row.photo_state)
        : null,
      at: row.at.toISOString(),
    }));
  } catch (error) {
    console.error(`[corner-notes] could not read the wall: ${explainDbError(error)}`);
    return null;
  }
}

/** The bytes of one photograph, for the route that serves them.
 *
 *  ——— ⚠️ The rule is in the query, not in the caller ———
 *
 *  Both conditions are in the WHERE clause rather than fetched-then-checked,
 *  and that is not a performance choice. A row that may not be shown is a row
 *  this function never holds: there is no branch anywhere that has the bytes in
 *  hand and is deciding what to do with them, so there is no branch anybody can
 *  get wrong later.
 *
 *  `hidden = false` as well as the state, because the two say different things.
 *  A cleared photo on a note that was taken down is still not for showing, and
 *  taking a note down has to take its picture down with it — otherwise the one
 *  moderation control this wall has works on the words and leaves the
 *  photograph up at a URL. */
export async function notePhotoBytes(id: string): Promise<Uint8Array | null> {
  const client = db();
  if (!client) return null;
  // Cheap and total: ids are minted here as `n_` plus a UUID, so anything else
  // is not an id we issued and there is no reason to ask the database about it.
  if (!/^n_[0-9a-f-]{36}$/.test(id)) return null;

  try {
    await prepared();
    const rows = await client.query<{ photo: Buffer }>(
      `SELECT photo FROM ${SCHEMA}.corner_notes
        WHERE id = $1 AND hidden = false AND photo_state = 'clear' AND photo IS NOT NULL`,
      [id],
    );
    const photo = rows.rows[0]?.photo;
    return photo ? Uint8Array.from(photo) : null;
  } catch (error) {
    console.error(`[corner-notes] could not read a photo: ${explainDbError(error)}`);
    return null;
  }
}

/** Take a note down, on the say-so of the browser that wrote it.
 *
 *  ——— ⚠️ Why the answer is the same either way ———
 *
 *  True when the note is now down, false when it is not, and deliberately no
 *  reason attached. A wrong token, an id nobody issued, a note somebody else
 *  wrote, a note already taken down: one answer for all of them. Distinguishing
 *  them turns this into an oracle — post a guess, learn whether the id exists,
 *  learn whether the token was close. There is nothing a caller can do
 *  differently with the distinction and something an attacker can.
 *
 *  ⚠️ Idempotent on purpose. Unpinning a note that is already hidden answers
 *  true, because the caller's question is "is my note off the wall" and it is.
 *  Answering false there would make a double tap look like a failure.
 *
 *  Hidden rather than deleted, like every other takedown on this wall — see the
 *  note at the top of this file. Somebody who changes their mind has lost the
 *  card, not the words, and the shop can put it back. */
export async function unpinNote(
  id: string,
  token: string,
  deviceHash: string | null = null,
): Promise<boolean> {
  const client = db();
  if (!client) return false;
  // Cheap and total: ids are minted here as `n_` plus a UUID, so anything else
  // is not an id we issued and there is no reason to ask the database about it.
  if (!/^n_[0-9a-f-]{36}$/.test(id)) return false;

  try {
    await prepared();
    const rows = await client.query<{
      unpin_hash: string | null;
      device_hash: string | null;
      hidden: boolean;
    }>(
      `SELECT unpin_hash, device_hash, hidden FROM ${SCHEMA}.corner_notes WHERE id = $1`,
      [id],
    );
    const row = rows.rows[0];
    // ⚠️ The comparison happens whether or not the row exists, against a null
    // that always fails — see tokenMatches. Returning early on a missing row
    // would make "no such note" measurably faster than "wrong token", which is
    // the distinction the paragraph above refuses to state out loud.
    // ⚠️ Either proof, and both are evaluated: the token this browser was
    // handed when it wrote the note, or the device cookie the server set. A
    // note written before device cookies existed has only the first; a browser
    // whose localStorage Safari has since cleared has only the second.
    //
    // Both comparisons run whether or not the row exists and whether or not the
    // first one succeeded — `||` would return early and make "right token"
    // measurably faster than "right cookie", which is a distinction worth not
    // publishing. See the paragraph above.
    const byToken = tokenMatches(token, row?.unpin_hash ?? null);
    const byDevice = deviceMatches(deviceHash, row?.device_hash ?? null);
    if (!byToken && !byDevice) return false;
    if (row?.hidden) return true;

    await client.query(
      `UPDATE ${SCHEMA}.corner_notes SET hidden = true WHERE id = $1`,
      [id],
    );
    return true;
  } catch (error) {
    console.error(`[corner-notes] could not unpin a note: ${explainDbError(error)}`);
    return false;
  }
}

/** The ids of the notes this browser wrote and that are still up.
 *
 *  ⚠️ Ids only, and only the ones still on the wall. It answers exactly the
 *  question /notes/all asks — "which of these cards should offer an unpin
 *  control" — and nothing beyond it. Handing back the notes themselves would
 *  put a second copy of what somebody wrote on a page that already has it, and
 *  handing back hidden ones would offer to take down something already down.
 *
 *  Empty for a browser with no cookie, an unknown cookie, or a database that
 *  cannot answer. All three mean the same thing to the caller: no control on
 *  any card, which is a wall that works and cannot take notes down — the same
 *  place the localStorage path fails to. */
export async function noteIdsForDevice(deviceHash: string | null): Promise<Set<string>> {
  const empty = new Set<string>();
  if (!deviceHash) return empty;
  const client = db();
  if (!client) return empty;
  try {
    await prepared();
    const rows = await client.query<{ id: string }>(
      `SELECT id FROM ${SCHEMA}.corner_notes
        WHERE device_hash = $1 AND hidden = false
        ORDER BY at DESC
        LIMIT 200`,
      [deviceHash],
    );
    return new Set(rows.rows.map((row) => row.id));
  } catch (error) {
    console.error(`[corner-notes] could not read a device's notes: ${explainDbError(error)}`);
    return empty;
  }
}

/** Record what the review decided.
 *
 *  ⚠️ The WHERE clause carries `photo_state = 'pending'`, which is the whole
 *  point: the only transition this function may make is out of pending. A
 *  review that
 *  arrives late — a retry, a duplicated background task, a queue that fired
 *  twice — must not be able to reopen a photo somebody already took down by
 *  hand, and must not overwrite a verdict already recorded. Writing it as a
 *  condition means that is true of every caller rather than of the careful
 *  ones. */
export async function setPhotoState(id: string, state: PhotoState): Promise<void> {
  const client = db();
  if (!client) return;
  try {
    await prepared();
    await client.query(
      `UPDATE ${SCHEMA}.corner_notes
          SET photo_state = $2
        WHERE id = $1 AND photo_state = 'pending'`,
      [id, state],
    );
  } catch (error) {
    console.error(`[corner-notes] could not record a photo verdict: ${explainDbError(error)}`);
  }
}

/** Every neighbourhood somebody has written from, and how many from each.
 *
 *  Case-folded, because "K-town" and "k-town" are one place and a filter row
 *  with both in it is a filter row that looks broken. The label shown is the
 *  first spelling anybody used for it.
 *
 *  ⚠️ Capped. This becomes a row of chips on a page, and a wall that has seen
 *  four hundred neighbourhoods should show the busiest of them rather than
 *  four hundred chips. */
export async function listNeighborhoods(
  limit = 24,
): Promise<{ name: string; count: number }[] | null> {
  const client = db();
  if (!client) return null;
  try {
    await prepared();
    const rows = await client.query<{ name: string; count: string }>(
      `SELECT min(neighborhood) AS name, count(*)::text AS count
         FROM ${SCHEMA}.corner_notes
        WHERE hidden = false AND neighborhood IS NOT NULL AND neighborhood <> ''
        GROUP BY lower(neighborhood)
        ORDER BY count(*) DESC, min(neighborhood) ASC
        LIMIT $1`,
      [Math.min(Math.max(limit, 1), 60)],
    );
    return rows.rows.map((row) => ({ name: row.name, count: Number(row.count) }));
  } catch (error) {
    console.error(`[corner-notes] could not read the neighbourhoods: ${explainDbError(error)}`);
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
