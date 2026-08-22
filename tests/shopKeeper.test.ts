// The shop, signed in on its own wall.
//
// ⚠️ Needs a scratch database for the second half. The first half needs nothing.
//
// ——— What is actually being defended ———
//
// Corner Notes has no accounts, and until now nothing in the app could take
// down a note the current browser did not write. That was a real gap — the
// shop had no control on the page and the privacy policy promises one — and
// closing it means adding the first path in the app where one browser removes
// another browser's writing.
//
// So the failure this suite exists for is not "the shop cannot sign in". It is
// **a stranger clearing the wall**, and every assertion below is that sentence
// from a different angle: no key set, the wrong key, a cookie somebody edited,
// a cookie that expired, a cookie minted under a key that has since been
// rotated, a cookie of the wrong shape entirely.
//
// ——— ⚠️ And one property that is easy to lose ———
//
// The cookie is not the key. KITCHEN_TOKEN also opens /api/digest and
// /api/gift-send; a cookie carrying it would mean a stolen cookie is the whole
// shop. What is handed out is an HMAC over an expiry, good for this and for
// twelve hours. That is asserted directly, because it is the kind of thing a
// later simplification quietly undoes.

import { createHmac } from "node:crypto";

import {
  KEEPER_COOKIE,
  KEEPER_MAX_AGE,
  keeperIsValid,
  mintKeeper,
  shopKeyMatches,
} from "../app/shopKeeper";
import { addNote, listNotes, takeDownNote, unpinNote } from "../app/cornerNotes";
import { NOTE_DEVICE_COOKIE } from "../app/noteDevice";
import { SCHEMA, db, isDatabaseConfigured } from "../app/db";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else {
    failures += 1;
    console.log("FAIL ", what, detail);
  }
};

const KEY = "s3cret-shop-key-that-is-long-enough";
const OTHER = "a-different-key-entirely-after-rotation";

/** Run something with a particular KITCHEN_TOKEN in the environment.
 *
 *  ⚠️ shopKeeper reads process.env on every call rather than caching it at
 *  import, which is what makes this possible — and is also the behaviour you
 *  want in production, where rotating the variable should take effect on the
 *  next request rather than the next deploy. */
function withKey<T>(key: string | undefined, body: () => T): T {
  const before = process.env.KITCHEN_TOKEN;
  if (key === undefined) delete process.env.KITCHEN_TOKEN;
  else process.env.KITCHEN_TOKEN = key;
  try {
    return body();
  } finally {
    if (before === undefined) delete process.env.KITCHEN_TOKEN;
    else process.env.KITCHEN_TOKEN = before;
  }
}

// ——— ⚠️ No key on this deploy ———
//
// The most important block in the file, and the one a plain `offered ===
// expected` gets catastrophically wrong: with KITCHEN_TOKEN unset, both sides
// are undefined and every visitor is the shop. On a deploy that has never set
// the variable — which is every deploy until somebody does — the whole wall
// would be one form away from anybody.
console.log("\n— a deploy with no key set —");
withKey(undefined, () => {
  ok("⚠️ no key means no key matches", shopKeyMatches("anything") === false);
  ok("⚠️ including the empty string", shopKeyMatches("") === false);
  ok("⚠️ and undefined, which is what an absent field is", shopKeyMatches(undefined) === false);
  ok("and null", shopKeyMatches(null) === false);
  ok("nothing can be minted", mintKeeper() === null);
  ok("a cookie of random noise does not verify", keeperIsValid("1893456000.".padEnd(75, "a")) === false);

  // ——— ⚠️ The forgery that a random signature cannot probe ———
  //
  // The assertion above passes for the wrong reason: noise fails against any
  // key, so it says nothing about what happens with no key. The question is
  // what an attacker does when they know KITCHEN_TOKEN is unset — they sign a
  // cookie with the empty key, because that is what `shopKey() ?? ""` would be
  // verifying against.
  //
  // ⚠️ This was found by mutation. Replacing the `if (!key) return false` in
  // keeperIsValid with `?? ""` changed nothing that the suite could see, which
  // meant the fail-closed branch there was untested. It is now.
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const forged = (key: string) =>
    `${expires}.${createHmac("sha256", key).update(String(expires), "utf8").digest("hex")}`;
  ok("⚠️ nor one correctly signed with the empty key", keeperIsValid(forged("")) === false);
  ok("⚠️ nor one signed with the string \"undefined\"", keeperIsValid(forged("undefined")) === false);
});

// ——— The key itself ———
console.log("\n— the key —");
withKey(KEY, () => {
  ok("the shop's key matches", shopKeyMatches(KEY) === true);
  ok("a different one does not", shopKeyMatches(OTHER) === false);
  ok("neither does the empty string", shopKeyMatches("") === false);
  // ⚠️ A prefix is the case a length-only or startsWith check would wave
  // through, and it is what an attacker walking a key one character at a time
  // is producing.
  ok("⚠️ nor a prefix of it", shopKeyMatches(KEY.slice(0, -1)) === false);
  ok("nor the key with something appended", shopKeyMatches(`${KEY}x`) === false);
  ok("nor the key in another case", shopKeyMatches(KEY.toUpperCase()) === false);
  ok("nor the key with whitespace round it", shopKeyMatches(` ${KEY} `) === false);
  ok("a number is not a key", shopKeyMatches(12345) === false);
  ok("an object is not a key", shopKeyMatches({ key: KEY }) === false);
  ok("an array is not a key", shopKeyMatches([KEY]) === false);
  // ⚠️ Bounded *before* hashing, so an unauthenticated request cannot make this
  // process do a megabyte of SHA-256. The real key is 32 bytes of base64.
  //
  // ⚠️ This assertion cannot see the cap and does not claim to: a megabyte of
  // "x" is refused either way, because it is not the key. Removing the length
  // check changes only what the refusal costs, which is a property a pass/fail
  // line cannot hold. It is asserted for the refusal and the cap is documented
  // in shopKeeper.ts for the cost. Verified by mutation: dropping the cap makes
  // nothing here fail, and that is expected rather than a gap to paper over.
  ok("a megabyte is refused", shopKeyMatches("x".repeat(1_000_000)) === false);
});

// ——— The cookie ———
console.log("\n— the cookie it hands out —");
withKey(KEY, () => {
  const cookie = mintKeeper();
  if (!cookie) {
    console.log("FAIL  nothing was minted");
    process.exit(1);
  }

  ok("a freshly minted cookie verifies", keeperIsValid(cookie) === true);

  // ⚠️ The property that keeps a stolen cookie from being the whole shop.
  ok("⚠️ and it is not the key", !cookie.includes(KEY));
  ok("⚠️ nor does it contain any run of the key", !KEY.split("-").some((bit) => bit.length > 3 && cookie.includes(bit)));

  const [expires, signature] = cookie.split(".");
  ok("it carries its expiry in the open", /^[0-9]+$/.test(expires));
  ok("and a signature over it", /^[0-9a-f]{64}$/.test(signature));
  ok(
    `it lasts ${KEEPER_MAX_AGE / 3600} hours, not longer`,
    Math.abs(Number(expires) * 1000 - (Date.now() + KEEPER_MAX_AGE * 1000)) < 5000,
    expires,
  );

  // ——— ⚠️ Everything somebody might send instead ———
  ok("⚠️ an expiry pushed forward without resigning is refused",
     keeperIsValid(`${Number(expires) + 86400}.${signature}`) === false);
  ok("⚠️ so is a signature from nowhere",
     keeperIsValid(`${expires}.${"f".repeat(64)}`) === false);
  ok("a signature one character off is refused",
     keeperIsValid(`${expires}.${signature.slice(0, -1)}${signature.endsWith("a") ? "b" : "a"}`) === false);
  ok("a truncated signature is refused", keeperIsValid(`${expires}.${signature.slice(0, 32)}`) === false);
  ok("an upper-case signature is refused", keeperIsValid(`${expires}.${signature.toUpperCase()}`) === false);
  ok("the two halves swapped are refused", keeperIsValid(`${signature}.${expires}`) === false);
  ok("no dot at all is refused", keeperIsValid(`${expires}${signature}`) === false);
  ok("a leading dot is refused", keeperIsValid(`.${signature}`) === false);
  ok("nothing is refused", keeperIsValid("") === false);
  ok("undefined is refused", keeperIsValid(undefined) === false);
  ok("null is refused", keeperIsValid(null) === false);
  ok("a number is refused", keeperIsValid(1) === false);
  ok("an object is refused", keeperIsValid({ toString: () => cookie }) === false);
  ok("a megabyte is refused", keeperIsValid("x".repeat(1_000_000)) === false);
  // ⚠️ These two are refused by the *signature*, not by the digit check above
  // them: sign("1e999") and sign(" 123") are not sign("123"), so a malformed
  // expiry never matches a real signature anyway. Mutation confirms it —
  // deleting the regex from shopKeeper.ts makes nothing here fail.
  //
  // The regex stays regardless, and the comment on it says why: Number("1e999")
  // is Infinity and Number(" 1 ") is 1, so a loose parse is one refactor away
  // from a cookie that never expires. This is defence in depth, asserted as the
  // behaviour it produces rather than as a claim about which line produced it.
  ok("an expiry in scientific notation is refused", keeperIsValid(`1e999.${signature}`) === false);
  ok("an expiry with whitespace in it is refused", keeperIsValid(` ${expires}.${signature}`) === false);
  ok("a negative expiry is refused", keeperIsValid(`-1.${signature}`) === false);

  // ——— The clock ———
  ok("⚠️ it stops working once it expires",
     keeperIsValid(cookie, Date.now() + (KEEPER_MAX_AGE + 60) * 1000) === false);
  ok("and is still good a minute before that",
     keeperIsValid(cookie, Date.now() + (KEEPER_MAX_AGE - 60) * 1000) === true);
});

// ——— ⚠️ Rotation, which is the only revocation there is ———
//
// One shared key and no session store means the way to sign everybody out is to
// change the key. That only works if a cookie signed under the old one stops
// verifying under the new one — otherwise rotating the token after somebody
// walks off with the shop's phone does nothing for twelve hours.
console.log("\n— rotating the key —");
const minted = withKey(KEY, () => mintKeeper());
ok("a cookie minted under the old key verifies under it",
   withKey(KEY, () => keeperIsValid(minted)) === true);
ok("⚠️ and stops verifying the moment the key changes",
   withKey(OTHER, () => keeperIsValid(minted)) === false);
ok("⚠️ and when the key is removed altogether",
   withKey(undefined, () => keeperIsValid(minted)) === false);

// ——— ⚠️ The name it goes by ———
//
// Compared against the real constant, not against the string "cb_notes" — the
// compiler knows two different literals differ and told me so, which meant the
// assertion could never fail no matter what either module did. Against the
// import it is a live check: naming both cookies the same thing would make a
// visitor's note-device cookie parse as a keeper cookie and vice versa.
ok("⚠️ the keeper cookie is not the one every visitor already has",
   String(KEEPER_COOKIE) !== String(NOTE_DEVICE_COOKIE),
   `${KEEPER_COOKIE} vs ${NOTE_DEVICE_COOKIE}`);

if (!isDatabaseConfigured()) {
  console.log("\n⚠️ No CORNER_DATABASE_URL — skipping the takedown itself.");
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

// ——— ⚠️ And what a keeper can actually do ———
async function main() {
  const client = db();
  if (!client) return;
  await client.query(`DROP TABLE IF EXISTS ${SCHEMA}.corner_notes`);

  console.log("\n— the takedown —");
  const theirs = await addNote({
    name: "somebody else", neighborhood: "Ktown", note: "not the shop's note", drawing: [],
  });
  const second = await addNote({
    name: "another", neighborhood: "Boston", note: "also not the shop's", drawing: [],
  });
  if (!theirs || !second) {
    console.log("FAIL  could not write the notes to test against");
    process.exit(1);
  }

  const up = async (id: string) => (await listNotes(100))?.some((note) => note.id === id) === true;

  // ⚠️ The whole point: a note this browser did not write, with no token and no
  // device cookie, comes down. Nothing else in the app can do this.
  ok("⚠️ the shop takes down a note it did not write", (await takeDownNote(theirs.id)) === true);
  ok("and it is off the wall", (await up(theirs.id)) === false);

  // ⚠️ Hidden, not deleted. The words are still there, so a takedown made in
  // error is recoverable — the permanent one is scripts/notes.mjs, by hand.
  const rows = await client.query<{ hidden: boolean; note: string }>(
    `SELECT hidden, note FROM ${SCHEMA}.corner_notes WHERE id = $1`,
    [theirs.id],
  );
  ok("⚠️ the row is still there, hidden rather than deleted", rows.rowCount === 1);
  ok("with what they wrote intact, so it can be put back",
     rows.rows[0]?.note === "not the shop's note");

  ok("taking down an already-hidden note says yes rather than erroring",
     (await takeDownNote(theirs.id)) === true);
  ok("and the other note is untouched", await up(second.id));

  // ——— What it still refuses ———
  ok("a made-up id does nothing", (await takeDownNote("n_not-a-uuid")) === false);
  ok("an empty id does nothing", (await takeDownNote("")) === false);
  ok("⚠️ an injection attempt does nothing, before any query runs",
     (await takeDownNote("n_' OR '1'='1")) === false);
  const absent = "n_00000000-0000-4000-8000-000000000000";
  ok("⚠️ an id for no note answers false, rather than true about nothing",
     (await takeDownNote(absent)) === false);
  ok("after all of that the second note is still up", await up(second.id));

  // ——— ⚠️ And the door it does not open ———
  //
  // takeDownNote is the keeper's path and unpinNote is the visitor's. Nothing
  // about adding the first may loosen the second: a stranger with no token and
  // no device still cannot take anything down.
  ok("⚠️ the visitor's path still refuses an empty token",
     (await unpinNote(second.id, "")) === false);
  ok("⚠️ and somebody else's token",
     (await unpinNote(second.id, theirs.token)) === false);
  ok("and a wrong device hash", (await unpinNote(second.id, "", "not-a-hash")) === false);
  ok("the note is still up after all three", await up(second.id));
  ok("its own token still works", (await unpinNote(second.id, second.token)) === true);

  await client.query(`DROP TABLE ${SCHEMA}.corner_notes`);
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
