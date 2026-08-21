import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Proving you are the person who left a note, on a wall with no accounts.
//
// ——— ⚠️ The problem, stated honestly ———
//
// app/cornerNotes.ts says it plainly: nobody signs in to leave a note, and
// "emeka" is whatever somebody typed. Two notes signed the same name are not
// the same person, and there is nothing in a note that identifies anybody.
//
// That is a deliberate property of the wall and it is worth keeping. It is also
// exactly what makes "let the person who posted it take it down" hard: the name
// is not a claim anybody can check, so a control keyed on it would let anyone
// who can read a card delete the note under it.
//
// ——— What is actually possible ———
//
// One thing is known at the moment a note is written and known to nobody else:
// that the request came from *this browser*. So the endpoint mints a secret
// when the note is saved, hands it back once in the response, and the browser
// keeps it. Presenting it later is the proof.
//
// This is a bearer token, and the honest description of what it authorises is
// narrow: taking down one note. Not reading anything, not editing, not seeing
// anything about the person who wrote it — there is nothing about them to see.
//
// ⚠️ And it is a *device* claim rather than a person claim, which is a real
// limitation and not a detail to gloss:
//
//   somebody who clears their site data can no longer take their note down,
//   and the note stays up. The privacy policy's answer — write to the shop —
//   is still the fallback and still has to be true;
//
//   somebody who posts from a phone cannot take it down from a laptop;
//
//   and anybody who gets the secret can take the note down. That is what a
//   bearer token is. The blast radius is one note on a bagel shop's wall, which
//   is why a bearer token is the right weight of thing here and would not be
//   for anything that spends money.
//
// ——— ⚠️ The hash, and why the column is not the token ———
//
// What the row holds is a SHA-256 of the secret, never the secret. A database
// dump is then a list of hashes that unpin nothing, and there is no copy of the
// live credential anywhere but the browser that made the note. It costs one
// line and it is the same reasoning the gift-card code applies to a card
// number: a thing that authorises an action does not get stored in a form that
// can be used.
//
// No salt, deliberately. Salting defends against a precomputed table over a
// small input space, and the input here is 32 bytes of CSPRNG output — there is
// no table and there is nothing to guess. A per-row salt would buy nothing and
// cost a column.

/** A fresh secret, for one note.
 *
 *  ⚠️ 32 bytes from the system CSPRNG, not randomUUID. A UUIDv4 carries 122
 *  bits and spells them in a shape people copy around and log; this is 256 bits
 *  in a form that is obviously opaque. The cost of both is the same and the
 *  thing being protected is somebody's ability to take their own words off a
 *  public page, so it may as well be unguessable by a wide margin. */
export function mintUnpinToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What goes in the row. */
export function hashUnpinToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Whether this is even the shape of a token, before anything is hashed or
 *  looked up.
 *
 *  Total, because it reads a request body. Bounded on both ends: too short is
 *  not one of ours, and unbounded is somebody posting a megabyte to be hashed. */
export function isUnpinToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= 32 && value.length <= 200;
}

/** Whether the presented secret is the one this row was written with.
 *
 *  ⚠️ Compared in constant time. The usual argument for that is a remote
 *  attacker measuring string-comparison timing to recover a secret byte by
 *  byte, which over the internet against a hash is close to theoretical — but
 *  the function is one line either way, and reaching for `===` on a credential
 *  is the habit that matters rather than this instance of it.
 *
 *  Both sides are hashed first, so both are 64 hex characters and the lengths
 *  always match. timingSafeEqual throws on a length mismatch, which is why that
 *  is checked rather than assumed. */
export function tokenMatches(presented: string, stored: string | null): boolean {
  if (!stored) return false;
  const a = Buffer.from(hashUnpinToken(presented), "utf8");
  const b = Buffer.from(stored, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
