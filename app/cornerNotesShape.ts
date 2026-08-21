import type { Drawing } from "./drawing";

// What a note is, for the screens that render one.
//
// ——— Why this is not in cornerNotes.ts ———
//
// That file has `import "server-only"` at the top, which is what stops a
// database pool and a connection string from being pulled into a browser
// bundle by an accidental import. The wall is a client component: it holds the
// composer's state and appends to its own list, so it needs the shape of a note
// and the three limits, and it must not be able to reach the module that talks
// to Postgres.
//
// So the shape lives here, with no side effects and nothing to import, and both
// halves read the same one. The alternative — a second copy of the caps in the
// component — is how an input that allows 60 characters meets a server that
// stores 40, and somebody watches the end of their sentence disappear.

/** What a note may say. Long enough to be warm, short enough that one person
 *  cannot take over the wall. */
export const MAX_NAME = 40;
export const MAX_NEIGHBORHOOD = 40;
export const MAX_NOTE = 240;

export type CornerNote = {
  id: string;
  name: string;
  neighborhood: string | null;
  note: string;
  drawing: Drawing | null;
  /** ISO 8601. A string rather than a Date because this crosses the server to
   *  the client, where a Date does not survive serialisation. */
  at: string;
};
