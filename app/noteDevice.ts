import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// The browser that wrote a note, remembered somewhere Safari will not throw
// away.
//
// ——— ⚠️ Why this exists, in the words of the bug ———
//
// "I don't see unpin."
//
// The control that takes your own note down appears when this browser holds
// the token the endpoint handed back — and that token lived in localStorage,
// which on Safari is script-writable storage. Intelligent Tracking Prevention
// caps script-writable storage at seven days without an interaction with the
// site, so a note written on a Tuesday can become unremovable by the person who
// wrote it the following week. Nothing is broken and nothing says so; the
// control is simply not there any more.
//
// A cookie set by the *server* is not script-writable storage and is not capped
// the same way. So authorship now has two proofs and either one is enough:
//
//   the per-note token, in localStorage, which is what every note written
//   before this existed has and all it has;
//
//   and this device cookie, which the server sets, the browser keeps for a
//   year, and no script on the page can read.
//
// ——— ⚠️ What a device claim is worth, which is not much ———
//
// The same warning as app/noteOwner.ts, because it is the same kind of claim.
// This says "the browser that sends this cookie is the browser that wrote that
// note". It does not say who that is. There are no accounts on the wall, so
// this is the strongest thing available, and its reach is deliberately one
// verb: hiding a note. It authorises nothing else.
//
// Clearing site data still loses it, and it still does not follow anybody to a
// second device. The privacy policy's "write to us" remains the answer for
// somebody in either position. What changes is that the ordinary case — same
// phone, three weeks later — now works.

/** The cookie's name. Prefixed like the session cookie, and deliberately dull:
 *  a name that says what it is for is a name that invites somebody to go
 *  looking for what it unlocks. */
export const NOTE_DEVICE_COOKIE = "cb_notes";

/** A year. Long enough that "I wrote that months ago" still works, short enough
 *  that a browser nobody has used since is not carrying a credential forever. */
export const NOTE_DEVICE_MAX_AGE = 60 * 60 * 24 * 365;

/** ⚠️ The same shape as an unpin token, and for the same reasons — see
 *  app/noteOwner.ts. Thirty-two random bytes is far past guessing, and
 *  base64url survives a Set-Cookie header without quoting. */
export function mintDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What goes in the database. The cookie is the secret; this is not.
 *
 *  ⚠️ Plain SHA-256 with no salt and no stretching, which would be wrong for a
 *  password and is right here: the input is thirty-two random bytes, so there
 *  is no dictionary to run and nothing for a work factor to slow down. Same
 *  reasoning as hashUnpinToken. */
export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Whether a cookie value is shaped like one we issued.
 *
 *  Checked before it reaches a query, so a cookie somebody has hand-edited into
 *  a megabyte of text is refused here rather than hashed and looked up. */
export function isDeviceToken(value: string | undefined | null): value is string {
  return typeof value === "string" && value.length >= 32 && value.length <= 200;
}

/** Constant-time comparison of a presented hash against a stored one.
 *
 *  ⚠️ Both sides are hex of the same length, so the length check below is about
 *  malformed input rather than about secrecy — timingSafeEqual throws on a
 *  length mismatch, and a throw on the unpin path is a 500 where a `false`
 *  belongs. */
export function deviceMatches(hash: string | null, stored: string | null): boolean {
  if (!hash || !stored || hash.length !== stored.length) return false;
  try {
    return timingSafeEqual(Buffer.from(hash), Buffer.from(stored));
  } catch {
    return false;
  }
}
