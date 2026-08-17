import "server-only";

import { timingSafeEqual } from "node:crypto";

// ——— A sign-in that does not need a mailbox ———
//
// Everything behind the account — order history, rewards, the reorder screen,
// saved addresses — can only be looked at by someone who is signed in, and
// signing in means an Auth0 tenant is configured and a real code arrives in a
// real inbox. That makes the whole logged-in half of the app hard to work on
// and, on a deploy with no tenant, impossible: /api/auth/start and /verify both
// answer 503 and there is no way past them.
//
// So: one address, one code, both named in the environment. Nothing else about
// the flow changes — the same two endpoints, the same session cookie, the same
// screens. The only difference is that no mail is sent and the code is one you
// already know.
//
// ——— ⚠️ What keeps this from being a back door ———
//
// It is a login bypass. Shipped carelessly it is an account takeover, so the
// shape matters more than the feature:
//
//   It works for exactly one address.  AUTH_TEST_EMAIL names it. This is the
//     property that makes the rest survivable: if both variables leak, the
//     worst outcome is a stranger signing into the debug account. A bypass
//     that took any address plus a magic code would hand over every customer's
//     order history, and that is the version this deliberately is not.
//
//   It cannot be switched on by accident.  Three variables have to be present
//     together and the code has to be exactly eight digits. A blank, a short
//     code, or a missing address turns the whole thing off rather than
//     weakening it — see reasonOff() for what refuses and why.
//
//   It is loud.  Every use logs. /api/capabilities reports it, so a deploy
//     that has it on says so from the outside instead of looking normal.
//
//   It is guessable only in theory.  Eight digits is a hundred million, and
//     attempts against the test address are capped below. Without that cap the
//     length would be decoration: the real codes are protected by Auth0's own
//     attack protection and this path never reaches Auth0, so nothing else is
//     watching it.
//
// ⚠️ Take these variables off any deploy real customers use. It grants a real
// session to whoever knows eight digits, and the audit trail on that account is
// then worth nothing.
//
// Set, to use it:
//
//   AUTH_TEST_EMAIL=debug@thecornerbagel.com
//   AUTH_TEST_CODE=44821907          # exactly 8 digits
//   AUTH0_SESSION_SECRET=...         # already needed; this signs the cookie

const CODE = /^\d{8}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type TestLogin = { email: string; code: string };

/** Why the test login is off, or null when it is on.
 *
 *  A string rather than a boolean because every one of these is somebody having
 *  configured it and got a blank screen: the difference between "I did not set
 *  this up" and "I set it up and mistyped the code" is invisible from the
 *  outside and is most of the time lost to it. */
export function reasonOff(): string | null {
  const email = process.env.AUTH_TEST_EMAIL?.trim().toLowerCase();
  const code = process.env.AUTH_TEST_CODE?.trim();
  if (!email && !code) return "AUTH_TEST_EMAIL and AUTH_TEST_CODE are not set";
  if (!email) return "AUTH_TEST_CODE is set but AUTH_TEST_EMAIL is not";
  if (!code) return "AUTH_TEST_EMAIL is set but AUTH_TEST_CODE is not";
  if (!EMAIL.test(email)) return `AUTH_TEST_EMAIL is not an email address`;
  if (!CODE.test(code)) {
    return "AUTH_TEST_CODE must be exactly 8 digits. A shorter one is guessable";
  }
  // The cookie is signed with it, so without it a code that matched could not
  // become a session anyway.
  if (!process.env.AUTH0_SESSION_SECRET) {
    return "AUTH0_SESSION_SECRET is not set, so there is nothing to sign a session with";
  }
  return null;
}

/** The configured pair, or null when anything about it is wrong. */
export function testLogin(): TestLogin | null {
  if (reasonOff() !== null) return null;
  return {
    email: (process.env.AUTH_TEST_EMAIL as string).trim().toLowerCase(),
    code: (process.env.AUTH_TEST_CODE as string).trim(),
  };
}

/** Whether this address is the test address. Used by /api/auth/start to skip
 *  the mail, and it must not be used to decide anything else: knowing an
 *  address is the debug one is not knowing the code. */
export function isTestAddress(email: string): boolean {
  const configured = testLogin();
  return configured !== null && configured.email === email.trim().toLowerCase();
}

// ——— The attempt cap ———
//
// In memory, so it does not survive a restart and does not span instances,
// which is the same limitation /api/auth/start's rate limiter carries and the
// same reasoning: it is the difference between a hundred million guesses being
// a slow afternoon and being impossible. A shared store is the real answer for
// a real secret; this is a debug switch that should not be on a public deploy
// in the first place.
//
// Keyed on nothing, because there is only one address that can get here. That
// also means a locked-out window is a global one, which for a single-user debug
// hatch is correct rather than a compromise.
const ATTEMPT_WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 10;
let attempts: number[] = [];

function tooManyAttempts(): boolean {
  const now = Date.now();
  attempts = attempts.filter((at) => now - at < ATTEMPT_WINDOW_MS);
  attempts.push(now);
  return attempts.length > MAX_ATTEMPTS;
}

/** Constant-time, so a wrong code cannot be narrowed digit by digit off the
 *  response time. Overkill for a debug hatch and free to do correctly. */
function sameCode(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export type TestVerdict =
  | { ok: true; email: string }
  | { ok: false; rateLimited?: boolean };

/** Whether this address and code are the configured test pair.
 *
 *  Returns a plain miss for anything that is not the test address, so a caller
 *  can fall through to the real Auth0 path without having learned anything. */
export function checkTestCode(email: string, code: string): TestVerdict {
  const configured = testLogin();
  if (!configured) return { ok: false };
  if (configured.email !== email.trim().toLowerCase()) return { ok: false };

  if (tooManyAttempts()) {
    console.warn(
      "[auth] test-login attempts are rate limited." +
        ` More than ${MAX_ATTEMPTS} in ${ATTEMPT_WINDOW_MS / 60_000} minutes.`,
    );
    return { ok: false, rateLimited: true };
  }

  if (!sameCode(configured.code, code.trim())) {
    console.warn("[auth] ⚠️ test-login code did not match");
    return { ok: false };
  }

  console.warn(
    `[auth] ⚠️ TEST LOGIN used for ${configured.email}. This is a bypass:` +
      " no code was mailed and Auth0 was not asked. Unset AUTH_TEST_EMAIL and" +
      " AUTH_TEST_CODE on any deploy real customers use.",
  );
  return { ok: true, email: configured.email };
}

/** The identity a test session carries.
 *
 *  A `sub` of its own, prefixed, so a row written by the debug account is
 *  recognisable as one wherever orders and rewards are keyed by subject — and
 *  so it can never collide with a real Auth0 subject, which is what would let
 *  test data land in a customer's history. */
export function testUser(email: string): { sub: string; email: string; name: string } {
  return { sub: `test|${email}`, email, name: email.split("@")[0] };
}
