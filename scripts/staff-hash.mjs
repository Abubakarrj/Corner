#!/usr/bin/env node
// Makes one STAFF_ACCOUNTS line.
//
//   node scripts/staff-hash.mjs <email> "<Display Name>" <admin|member> <locationId>
//
// It asks for the password rather than taking it as an argument, because an
// argument ends up in the shell history, in `ps` output, and in whatever
// terminal scrollback somebody screen-shares later.
//
// Output is one line. Paste it into STAFF_ACCOUNTS on the deployment — one
// account per line — and redeploy. The line contains a scrypt hash, never the
// password: it is safe in a secrets manager and worthless to anybody who
// intercepts it, and there is no way to read the password back out of it,
// including for us.
//
// The fields of the hash are separated by colons rather than the dollar signs
// the usual PHC format uses, because dotenv expands `$name` inside a quoted
// .env value and would quietly eat most of the hash. See the long note in
// app/staff/staff.ts.
//
// The parameters below are duplicated from app/staff/staff.ts rather than
// imported, because that file is TypeScript with a "server-only" import and
// this is a plain node script run outside the app. They must stay in step; the
// format string at the bottom is what ties them together, and staff.ts reads
// N, r and p back out of it rather than assuming, so an old line keeps working
// if these ever change.

import { createInterface } from "node:readline";
import { randomBytes, scryptSync } from "node:crypto";

const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;

const [email, name, role, locationId] = process.argv.slice(2);

if (!email || !name || !role || !locationId) {
  console.error(
    'usage: node scripts/staff-hash.mjs <email> "<Display Name>" <admin|member> <locationId>\n' +
      'example: node scripts/staff-hash.mjs sam@cornerbagel.com "Sam Okafor" admin koreatown',
  );
  process.exit(1);
}
if (role !== "admin" && role !== "member") {
  console.error(`role must be "admin" or "member", not "${role}"`);
  process.exit(1);
}
if (/[|\n;]/.test(name)) {
  console.error("the display name can't contain | ; or a newline — those separate the fields");
  process.exit(1);
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    // Echo is left on. Turning it off here would mean reimplementing raw-mode
    // input for a script an admin runs on their own machine, and the password
    // they type is one they are about to hand to a person anyway.
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const password = await ask("Password: ");
if (password.length < 12) {
  console.error("\nUse at least 12 characters. Length is what actually helps.");
  process.exit(1);
}

const salt = randomBytes(16);
const key = scryptSync(password.normalize("NFKC"), salt, KEY_LENGTH, {
  N: SCRYPT_N,
  r: SCRYPT_R,
  p: SCRYPT_P,
  maxmem: 128 * SCRYPT_N * SCRYPT_R * 2,
});
const secret = [
  "scrypt",
  SCRYPT_N,
  SCRYPT_R,
  SCRYPT_P,
  salt.toString("base64url"),
  key.toString("base64url"),
].join(":");

// The line itself on stdout and nothing else, so `>> accounts.txt` works.
// Everything explanatory goes to stderr.
console.error("\nAdd this line to STAFF_ACCOUNTS:\n");
console.log([email.toLowerCase(), name, role, locationId, secret].join("|"));
