import "server-only";

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { LOCATIONS, type StoreLocation } from "../(marketing)/locations/locations";

// Who works here, and what they are allowed to do.
//
// ——— Why this is not the customer sign-in ———
//
// Customers sign in with Auth0, passwordless, by a code mailed to them. That
// is the right shape for somebody who visits three times a year: nothing to
// remember, nothing to leak.
//
// It is the wrong shape for somebody opening the ordering screen at 6am with
// flour to reorder before the delivery window closes. Waiting on an email is
// waiting on an email, and shops have patchy back-office wifi. So staff get a
// password, on a separate cookie, with its own session secret. A stolen staff
// session must not become a customer session and a stolen customer session
// must never become a staff one; keeping the two systems apart is what
// guarantees that rather than a check somebody has to remember to write.
//
// ——— Where the accounts live, and why that is env and not a database ———
//
// There is no database in this app. Deliberately, and it has held up well:
// orders live in Toast, applications live in a mailbox, the cart lives in the
// browser. A handful of staff accounts is small enough that a config value is
// an honest place for them, and it has the property that the thing guarding
// the ordering screen cannot be edited by anything the app can reach.
//
// The cost is real and worth stating plainly: adding somebody means editing an
// environment variable and redeploying. That is fine at five people and
// irritating at fifteen. When it stops being fine, this file is the only one
// that changes — parse() is replaced with a query and everything above it,
// including every route and every page, carries on unchanged. See
// app/api/staff/invite for how a new hire's line gets produced without anyone
// typing a hash by hand.
//
// ——— What is never in this repository ———
//
// No password and no hash is checked in. STAFF_ACCOUNTS is set on the
// deployment, and `node scripts/staff-hash.mjs` is how a line is made. The
// hash is scrypt with a per-account salt, so the env value leaking costs an
// attacker a very long offline grind rather than the passwords themselves.

export type StaffRole = "admin" | "member";

export type StaffAccount = {
  email: string;
  name: string;
  role: StaffRole;
  /** The shop this person works at. Every screen behind the staff login is
   *  scoped to it: an order is placed for this location and no other, so
   *  choosing the wrong one is not a mistake that can be made. */
  locationId: string;
  /** scrypt:N:r:p:salt:hash, base64url for both halves. */
  secret: string;
};

/** What a signed-in staff member is, once the password is out of the picture.
 *  This is what the session carries and what every screen is handed. */
export type StaffIdentity = {
  email: string;
  name: string;
  role: StaffRole;
  locationId: string;
};

// ——— scrypt ———
//
// N=2^15 puts a single verification at roughly 100ms on the kind of machine
// this runs on, which is unnoticeable on a login and ruinous at scale for
// somebody working through a leaked env file.
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
// scrypt's memory use is roughly 128 * N * r bytes — 32MB here — and Node
// refuses to exceed maxmem, whose default is 32MB. Asking for double leaves
// room rather than throwing on the first login.
const MAX_MEM = 128 * SCRYPT_N * SCRYPT_R * 2;

function derive(password: string, salt: Buffer): Buffer {
  return scryptSync(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEM,
  });
}

/** Makes the secret half of an account line. Used by scripts/staff-hash.mjs
 *  and by the invite flow, so there is one definition of the format. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = derive(password, salt);
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join(":");
}

function checkPassword(password: string, secret: string): boolean {
  const parts = secret.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltText, hashText] = parts;
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(hashText, "base64url");
  let actual: Buffer;
  try {
    actual = scryptSync(password.normalize("NFKC"), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 128 * Number(n) * Number(r) * 2,
    });
  } catch {
    // A malformed line — bad parameters, truncated base64. Treated as a failed
    // password rather than a crash, so one typo in the env value locks out one
    // person instead of taking the login down for everybody.
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// ——— Parsing the env value ———
//
// One account per line:
//
//   email|Display Name|role|locationId|scrypt:32768:8:1:<salt>:<hash>
//
// Newline-separated, because that is what a hosting dashboard's multi-line
// secret field gives you. Semicolons work too, for the platforms whose env
// editor is a single-line box. Neither character can appear in an email
// address, a role or a base64url hash, so there is nothing to escape.
//
// ——— Colons, not dollar signs ———
//
// The usual way to write a password hash is the PHC string format, which
// separates its fields with `$`: scrypt$N$r$p$salt$hash. This does not, and the
// reason is worth writing down because the failure it avoids is invisible.
//
// dotenv — which Next.js uses to read .env files, and which plenty of
// container tooling uses too — performs shell-style variable expansion inside
// double-quoted values. `$32768` is not a field separator to it; it is a
// reference to a variable named `32768`, which does not exist, so it
// interpolates an empty string. A hash written the standard way arrives here
// as the word "scrypt" and a few surviving characters. Nothing errors. The
// account parses, because it still has five fields. Everybody is simply locked
// out, with a "that email and password don't match" that is a lie.
//
// A colon means nothing to any of that, and base64url has no colon in its
// alphabet, so the format stays unambiguous. The shape check below catches a
// mangled line anyway and says which one it is — being locked out of the shop's
// ordering screen at 6am deserves better than silence.

const SEPARATOR = /[\n;]+/;

const SECRET_SHAPE = /^scrypt:\d+:\d+:\d+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/;

function parse(raw: string | undefined): StaffAccount[] {
  if (!raw) return [];
  const accounts: StaffAccount[] = [];
  for (const line of raw.split(SEPARATOR)) {
    const text = line.trim();
    if (text === "" || text.startsWith("#")) continue;
    const fields = text.split("|").map((field) => field.trim());
    if (fields.length !== 5) {
      console.error(`[staff] ignoring a malformed STAFF_ACCOUNTS line (${fields.length} fields)`);
      continue;
    }
    const [email, name, role, locationId, secret] = fields;
    if (role !== "admin" && role !== "member") {
      console.error(`[staff] ignoring ${email}: unknown role "${role}"`);
      continue;
    }
    if (!LOCATIONS.some((location) => location.id === locationId)) {
      // A typo here would otherwise produce an account that can sign in and
      // then order for a shop that does not exist.
      console.error(`[staff] ignoring ${email}: unknown location "${locationId}"`);
      continue;
    }
    if (!SECRET_SHAPE.test(secret)) {
      console.error(
        `[staff] ignoring ${email}: the password hash is not in the expected form.` +
          " If it looks truncated, something expanded it — a `$` in the value and a" +
          " .env file will do that. Regenerate the line with scripts/staff-hash.mjs.",
      );
      continue;
    }
    accounts.push({ email: email.toLowerCase(), name, role, locationId, secret });
  }
  return accounts;
}

// Parsed once. The env value cannot change without a restart, so re-splitting
// it on every login is work for nothing — but it is read lazily rather than at
// module load, so importing this file during a build doesn't require the
// variable to be set.
let cache: { raw: string | undefined; accounts: StaffAccount[] } | null = null;

function accounts(): StaffAccount[] {
  const raw = process.env.STAFF_ACCOUNTS;
  if (!cache || cache.raw !== raw) cache = { raw, accounts: parse(raw) };
  return cache.accounts;
}

export function isStaffConfigured(): boolean {
  return accounts().length > 0;
}

/** Every admin's address. Where an invite's finished credential line is sent,
 *  because they are the people who can act on it. */
export function adminEmails(): string[] {
  return accounts()
    .filter((account) => account.role === "admin")
    .map((account) => account.email);
}

export function locationOf(identity: { locationId: string }): StoreLocation {
  const found = LOCATIONS.find((location) => location.id === identity.locationId);
  // Unreachable: parse() drops any account whose location is unknown, and a
  // session is only minted from a parsed account. Throwing rather than
  // defaulting keeps it that way — a silent fallback to LOCATIONS[0] is how a
  // second shop's order goes to the first shop's supplier.
  if (!found) throw new Error(`staff account points at unknown location ${identity.locationId}`);
  return found;
}

// A hash of a password nobody has, in the same format and with the same cost
// as a real one. An unknown address is checked against this so that answering
// takes as long as it does for a real account — otherwise the login endpoint
// tells anybody with a stopwatch which addresses belong to staff.
const DECOY = hashPassword(randomBytes(24).toString("hex"));

export function signIn(email: string, password: string): StaffIdentity | null {
  const address = email.trim().toLowerCase();
  const account = accounts().find((entry) => entry.email === address);
  if (!account) {
    checkPassword(password, DECOY);
    return null;
  }
  if (!checkPassword(password, account.secret)) return null;
  return {
    email: account.email,
    name: account.name,
    role: account.role,
    locationId: account.locationId,
  };
}
