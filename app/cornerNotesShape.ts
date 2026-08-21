import type { Drawing } from "./drawing";

// What a note is, for the screens that render one.
//
// ——— Why this is not in cornerNotes.ts ———
//
// That file has `import "server-only"` at the top, which is what stops a
// database pool and a connection string from being pulled into a browser
// bundle by an accidental import. The wall and the composer are both client
// components — one renders notes, the other enforces the three caps as you
// type — so both need this and neither may reach the module that talks to
// Postgres.
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

/** Where a browser keeps the notes it wrote, and the secrets that take them
 *  down again. See app/(marketing)/notes/mine.ts.
 *
 *  Versioned in the name, like the locale key, so a change to the stored shape
 *  is a new key rather than a parse of somebody's old one. */
export const NOTES_STORAGE_KEY = "cb-notes-v1";

/** How many of them to keep. Fifty is far past the six-an-hour the endpoint
 *  allows anybody, and the oldest are the ones somebody is least likely to
 *  come back and take down. */
export const MAX_NOTES_REMEMBERED = 50;

/** The longest edge, in pixels, the browser reduces a photo to before sending.
 *
 *  A thousand is more than a polaroid on a phone screen ever shows and small
 *  enough that the whole thing is tens of kilobytes. The reduction is not only
 *  about size: re-drawing through a canvas is what drops EXIF, so a picture
 *  arrives without the camera, the timestamp or the coordinates it was taken
 *  at. See app/notePhoto.ts. */
export const PHOTO_MAX_EDGE = 1000;

/** JPEG quality for that re-encode. High enough that a photo of a person looks
 *  like them, low enough that the file is small. */
export const PHOTO_QUALITY = 0.72;

/** The one format accepted, in and out. */
export const PHOTO_TYPE = "image/jpeg";

/** What the wall is told about a note's photograph.
 *
 *  ——— ⚠️ Three states on the server, two of them here ———
 *
 *  A stored photo is `pending`, `clear` or `refused` (app/notePhoto.ts). Only
 *  the first two have a spelling on the wire, and that is the point: a refused
 *  photo and a note that never had one are the same answer, `null`, so nothing
 *  a browser receives says that a picture exists and is being withheld.
 *
 *  `developing` is a real state and not a placeholder for a slow request. The
 *  note is up, the photo is saved, and nobody has looked at it yet — so the
 *  card shows an empty frame coming up, which is what a polaroid does for its
 *  first minute anyway. */
export type NotePhoto = "developing" | "ready" | null;

export type CornerNote = {
  id: string;
  name: string;
  neighborhood: string | null;
  note: string;
  drawing: Drawing | null;
  /** Whether there is a photograph on this card, and whether it may be shown.
   *  The bytes are not here — they come from /api/note-photo/[id], which is
   *  the one place allowed to hand them out. */
  photo: NotePhoto;
  /** ISO 8601. A string rather than a Date because this crosses the server to
   *  the client, where a Date does not survive serialisation. */
  at: string;
};
