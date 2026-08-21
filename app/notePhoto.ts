// A photograph on the wall, and the shape that makes one safe to accept.
//
// ——— ⚠️ This is the exception to app/drawing.ts, and it is deliberate ———
//
// drawing.ts says, at length, that nothing in a note is ever an image: a
// drawing is bounded integers this app turns into a path itself, so no field a
// stranger fills can carry markup, a URL, or a byte of their choosing. That is
// the whole reason the wall is safe to publish, and a photograph is exactly the
// thing it refused.
//
// So a photo does not get the drawing's guarantee. It gets a different and
// weaker one, spelled out here so nobody has to infer it:
//
//   the bytes are re-encoded by the browser before they are sent, which is what
//   removes EXIF — including the GPS tag that would otherwise publish where
//   somebody lives on a public wall;
//
//   the server accepts one format, checked by its magic bytes rather than by
//   what the request claims, so a document that is not a JPEG cannot be stored
//   as one;
//
//   the bytes are served back with a fixed Content-Type and nosniff, so even a
//   file that lied its way in cannot be interpreted as anything but an image;
//
//   and nothing photographic reaches the wall until it has been looked at. See
//   app/photoReview.ts.
//
// ⚠️ None of that makes a photo as safe as a drawing. A drawing cannot be a
// picture of a person who did not consent to being on a bagel shop's website;
// a photo can. That is a moderation problem and it is why the review step
// exists rather than being a nicety.
//
// ——— Where the halves live ———
//
// The camera runs in a browser, so the size and the quality it re-encodes at
// are in cornerNotesShape.ts with the other numbers both sides need. Everything
// below this line reads bytes, which is a thing only a server does — hence the
// server-only import, and hence Buffer being fair game here and nowhere the
// composer can reach.

import "server-only";

import { PHOTO_TYPE } from "./cornerNotesShape";
import type { NotePhoto } from "./cornerNotesShape";

// Re-exported so a server-side caller has one place to reach for, the same way
// cornerNotes.ts re-exports the three text caps.
export { PHOTO_MAX_EDGE, PHOTO_QUALITY, PHOTO_TYPE } from "./cornerNotesShape";

/** ⚠️ The hard cap on what the endpoint will store, after decoding.
 *
 *  A browser that followed the rules sends something around 80KB. This is
 *  generous by an order of magnitude, because the cap is not there to enforce
 *  the resize — it is there so a client that ignores every instruction above
 *  cannot post four megabytes six times an hour. */
export const PHOTO_MAX_BYTES = 900_000;

/** Whether these bytes actually start like a JPEG.
 *
 *  ——— ⚠️ Magic bytes, not the request's word for it ———
 *
 *  The client says what it is sending and the client can be anybody. A file
 *  named .jpg containing HTML is the oldest trick there is, and the damage is
 *  done at serving time rather than at upload: bytes stored as an image and
 *  handed back on our own origin, where a browser that sniffs them as markup
 *  runs them as our site.
 *
 *  Two defences, and this is the cheaper one. The other is the serving route's
 *  fixed Content-Type and X-Content-Type-Options: nosniff, which holds even if
 *  something gets past here. Neither is sufficient alone and both are three
 *  lines.
 *
 *  FF D8 FF opens every JPEG — SOI followed by the first marker. It does not
 *  prove the rest decodes, and it is not meant to: what it rules out is a file
 *  that is honestly some other thing. */
export function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Bytes from what arrived in the request body, or null.
 *
 *  Total, like cleanDrawing: the input is a request body, so it is `unknown`
 *  and anything at all can be in it. Null means "no photo on this note", which
 *  is the common case and not an error — a note is words, a drawing, a photo,
 *  or any two of them.
 *
 *  ⚠️ Length is checked on the base64 *before* decoding as well as after. A
 *  megabyte of base64 is a megabyte of string this process would otherwise
 *  allocate to find out it was too big. */
export function readPhoto(raw: unknown): Uint8Array | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  // 4 base64 characters per 3 bytes, plus room for a data-URL prefix somebody
  // forgot to strip.
  if (raw.length > Math.ceil((PHOTO_MAX_BYTES * 4) / 3) + 64) return null;

  // A browser's toDataURL gives "data:image/jpeg;base64,…". Accepted with or
  // without the prefix, and only for the one type — a data URL announcing
  // image/svg+xml is a script in an image's clothing and is refused here
  // rather than left to the magic-byte check to notice.
  const body = raw.startsWith("data:")
    ? raw.startsWith(`data:${PHOTO_TYPE};base64,`)
      ? raw.slice(`data:${PHOTO_TYPE};base64,`.length)
      : null
    : raw;
  if (body === null) return null;

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(body, "base64"));
  } catch {
    return null;
  }
  // ⚠️ Buffer.from ignores what it cannot parse rather than throwing, so an
  // empty result is the signal that the input was not base64 at all.
  if (bytes.length === 0 || bytes.length > PHOTO_MAX_BYTES) return null;
  if (!looksLikeJpeg(bytes)) return null;
  return bytes;
}

/** Where a photo is in its life on the wall.
 *
 *  `pending` is the state a photo is born in and the reason the card on the
 *  wall shows a polaroid developing rather than a picture: it is saved, it is
 *  not published, and nobody has seen it yet but the person who took it.
 *
 *  ⚠️ `pending` is also the state a photo *stays* in when anything goes wrong —
 *  no API key, a refused call, a timeout. The failure direction is not an
 *  accident: a review that could not happen must never resolve to "fine". */
export type PhotoState = "pending" | "clear" | "refused";

export function isPhotoState(value: unknown): value is PhotoState {
  return value === "pending" || value === "clear" || value === "refused";
}

/** Whether these bytes may be handed to somebody who is not the person who
 *  took the picture.
 *
 *  ⚠️ Written as `=== "clear"` and not as `!== "refused"`, which is the same
 *  answer today and stops being the same answer the moment a fourth state
 *  exists. A default of "show it" is how a state added for some unrelated
 *  reason quietly publishes everything in it. */
export function photoIsPublic(state: PhotoState | null | undefined): boolean {
  return state === "clear";
}

/** What a browser is allowed to know: a photo developing, a photo to fetch, or
 *  nothing at all.
 *
 *  ⚠️ The one place `refused` is turned into `null`. A card that said "there is
 *  a picture here and you may not see it" would be an invitation and an
 *  accusation at once, and neither belongs on a wall in a bagel shop. */
export function photoOnWall(state: PhotoState | null | undefined): NotePhoto {
  if (photoIsPublic(state)) return "ready";
  return state === "pending" ? "developing" : null;
}
