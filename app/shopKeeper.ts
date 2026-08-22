import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// The shop, signed in on its own wall.
//
// ——— ⚠️ What this is for, and what it deliberately is not ———
//
// Corner Notes has no accounts by design, and every takedown on it belongs to
// the browser that wrote the note: press unpin, and app/noteOwner.ts checks a
// secret that browser was handed. That is the right rule for visitors, and it
// leaves the shop with nothing. Somebody at Corner looking at a note that has
// to come down — a real name, a photograph of a stranger, a test post left by
// whoever set the wall up — has no control on the page at all. The unpin
// route's own header said so: "the shop's own takedown is still the `hidden`
// column reached by hand."
//
// This is that control. It is not a login and it is not an accounts system. It
// is one shared key, held by the shop, exchanged once for a short cookie.
//
// ⚠️ It is the *only* thing in this app that lets one browser take down another
// browser's note, so the failure that matters is not "the shop cannot sign in".
// It is a stranger clearing the wall. Everything below is written for that.
//
// ——— The key is KITCHEN_TOKEN, and the cookie is not ———
//
// KITCHEN_TOKEN already exists: it is the bearer the cron endpoints and
// /api/sold-out check, and it is the one secret this shop has. Adding a second
// one would mean a second thing to set, rotate and lose.
//
// ⚠️ But the cookie is an HMAC over an expiry, never the token. A cookie is a
// string that leaves the server, sits in a browser, and rides along on every
// request to this origin; the token also opens /api/digest and /api/gift-send.
// Putting it in a cookie would mean a stolen cookie is the whole shop. What
// this hands out is good for one thing and only until it expires.
//
// Rotating KITCHEN_TOKEN signs everybody out, which is the property you want
// from a shared key: it is the revocation.

/** ⚠️ Short, because it is a shared key on a device that might be the shop's
 *  iPad on a counter. Long enough to take a wall down in one sitting; short
 *  enough that a phone left somewhere is not a standing grant. */
export const KEEPER_MAX_AGE = 12 * 60 * 60;

export const KEEPER_COOKIE = "cb_keeper";

/** The shop's key, or null when there is not one.
 *
 *  ⚠️ Null is the fail-closed case and it is the ordinary one: on a deploy
 *  where KITCHEN_TOKEN has never been set, no key matches, no cookie verifies,
 *  and the control never appears for anybody. A missing secret must never mean
 *  "let everyone in", which is exactly what an `expected === offered` on two
 *  undefineds would have meant. */
function shopKey(): string | null {
  const key = process.env.KITCHEN_TOKEN?.trim();
  return key ? key : null;
}

/** Constant-time, on two digests rather than two strings.
 *
 *  Lifted from app/api/sold-out/route.ts, which explains it: `a === b` returns
 *  as soon as two characters differ, so how long it takes is a measurement of
 *  how much of the key was right. timingSafeEqual needs equal lengths, and two
 *  SHA-256 digests always are, whatever went in. */
function same(offered: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(offered), digest(expected));
}

/** Is this the shop's key? */
export function shopKeyMatches(offered: unknown): boolean {
  const key = shopKey();
  if (!key) return false;
  if (typeof offered !== "string" || offered.length === 0) return false;
  // ⚠️ A cap before hashing. Without it a megabyte of "a" is a megabyte this
  // process hashes on an unauthenticated request, which is a cheap way to make
  // a small dyno do work. The real key is 32 bytes of base64.
  if (offered.length > 512) return false;
  return same(offered, key);
}

/** The cookie value for a browser that has just proved it holds the key.
 *
 *  `<expires>.<hmac>` — the expiry in the open so this can be checked without
 *  storing anything, and signed so it cannot be edited. Null when there is no
 *  key to sign with. */
export function mintKeeper(now: number = Date.now()): string | null {
  const key = shopKey();
  if (!key) return null;
  const expires = Math.floor(now / 1000) + KEEPER_MAX_AGE;
  return `${expires}.${sign(String(expires), key)}`;
}

function sign(value: string, key: string): string {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

/** Does this cookie prove the shop is holding it, right now?
 *
 *  ⚠️ Total. Every way of being wrong — no cookie, no key on this deploy, a
 *  shape this does not recognise, an expiry that is not a number, a signature
 *  over a different expiry, an expiry in the past — returns false rather than
 *  throwing. This is called while rendering a public page, and a wall that
 *  500s because somebody sent a malformed cookie is a worse outcome than a
 *  wall with no takedown control on it. */
export function keeperIsValid(cookie: unknown, now: number = Date.now()): boolean {
  const key = shopKey();
  if (!key) return false;
  if (typeof cookie !== "string" || cookie.length === 0 || cookie.length > 256) return false;

  const dot = cookie.indexOf(".");
  if (dot <= 0) return false;
  const expires = cookie.slice(0, dot);
  const offered = cookie.slice(dot + 1);
  // ⚠️ Digits only. Number("1e999") is Infinity and Number(" 1 ") is 1, so a
  // loose parse here would accept an expiry that never passes and one with
  // whitespace in it that signs differently than it reads.
  if (!/^[0-9]{1,12}$/.test(expires)) return false;
  if (!/^[0-9a-f]{64}$/.test(offered)) return false;

  // ⚠️ The signature before the clock. Checking the expiry first would answer
  // faster for an unsigned cookie with a stale date than for a signed one,
  // which is a measurement — and there is nothing to gain by hurrying.
  if (!same(offered, sign(expires, key))) return false;
  return Number(expires) * 1000 > now;
}
