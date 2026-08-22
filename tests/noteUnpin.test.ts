// Taking your own note off a wall that has no accounts.
//
// ⚠️ Needs a scratch database and drops its own table.
//
// ——— What is actually being defended ———
//
// Corner Notes has no sign-in by design, so "who posted it" cannot be checked
// against a name — a name is typed text and two notes signed the same one are
// not the same person. The only fact available at the moment a note is written
// is that the request came from a particular browser, so that browser is handed
// a secret and presenting it later is the proof. See app/noteOwner.ts.
//
// Which makes the whole security property one sentence: **the token is the only
// thing that unpins a note**. Everything below is that sentence from a
// different angle — a wrong token, no token, somebody else's token, a token for
// a different note, a hash out of the database — and the failure it guards
// against is a stranger clearing the wall.
//
// ⚠️ And one thing that is not about attackers at all: the token must never
// come back out of this app anywhere but the response that created the note. A
// wall that handed out unpin tokens with its cards would be a wall anybody
// could take down, and no amount of checking at the endpoint would matter.

import { hashDeviceToken, mintDeviceToken } from "../app/noteDevice";
import {
  addNote,
  listNotes,
  unpinNote,
  noteIdsForDevice,
} from "../app/cornerNotes";
import {
  hashUnpinToken,
  isUnpinToken,
  mintUnpinToken,
  tokenMatches,
} from "../app/noteOwner";
import { SCHEMA, db, isDatabaseConfigured } from "../app/db";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

// ——— The token itself, which needs no database ———
console.log("\n— what a token is —");
const a = mintUnpinToken();
const b = mintUnpinToken();
ok("a token is long enough to be unguessable", a.length >= 40, String(a.length));
ok("and two of them differ", a !== b);
ok("it is URL-safe, so nothing mangles it in transit", /^[A-Za-z0-9_-]+$/.test(a), a.slice(0, 8));
ok("its own shape check accepts it", isUnpinToken(a));

console.log("\n— and what is not one —");
ok("an empty string is not", isUnpinToken("") === false);
ok("a short string is not", isUnpinToken("hunter2") === false);
ok("a megabyte is not", isUnpinToken("x".repeat(1_000_000)) === false);
ok("a number is not", isUnpinToken(12345) === false);
ok("null is not", isUnpinToken(null) === false);
ok("an object is not", isUnpinToken({ token: a }) === false);

console.log("\n— the hash —");
const hashed = hashUnpinToken(a);
// ⚠️ The whole point of the column being a hash: what is stored cannot be
// presented. Somebody reading the database gets a string that unpins nothing.
ok("the hash is not the token", hashed !== a);
ok("it is a sha-256, spelled in hex", /^[0-9a-f]{64}$/.test(hashed), hashed.slice(0, 12));
ok("the same token always hashes the same", hashUnpinToken(a) === hashed);
ok("a different token hashes differently", hashUnpinToken(b) !== hashed);
ok("⚠️ presenting the stored hash does not work",
   tokenMatches(hashed, hashed) === false);

console.log("\n— matching —");
ok("the right token matches", tokenMatches(a, hashed));
ok("the wrong one does not", tokenMatches(b, hashed) === false);
ok("no stored hash never matches", tokenMatches(a, null) === false);
ok("an empty stored hash never matches", tokenMatches(a, "") === false);
// ⚠️ A near miss, because a comparison that stopped at the first differing
// character would be the one thing this file is about.
ok("a token one character off does not match",
   tokenMatches(`${a.slice(0, -1)}${a.endsWith("A") ? "B" : "A"}`, hashed) === false);

async function main() {
  if (!isDatabaseConfigured()) {
    console.log("\nSKIP  no CORNER_DATABASE_URL, so unpinning is untested.");
    console.log("      CORNER_DATABASE_URL=postgres://... npm test noteUnpin");
    process.exit(failures === 0 ? 0 : 1);
  }
  const client = db();
  if (!client) { console.log("\nno database"); process.exit(1); }
  await client.query(
    `CREATE SCHEMA IF NOT EXISTS ${SCHEMA};
     DROP TABLE IF EXISTS ${SCHEMA}.corner_notes`,
  );

  const wall = async () => (await listNotes(50)) ?? [];
  const onWall = async (id: string) => (await wall()).some((note) => note.id === id);

  const mine = await addNote({ name: "abu", neighborhood: "Ktown", note: "happy to be here", drawing: [] });
  const yours = await addNote({ name: "heeyoung", neighborhood: "Boston", note: "corner bagel rocks", drawing: [] });
  if (!mine || !yours) { console.log("\nnothing to test"); process.exit(1); }

  console.log("\n— what comes back when a note is written —");
  ok("an id and a token", typeof mine.id === "string" && typeof mine.token === "string");
  ok("the token is a real one", isUnpinToken(mine.token));
  ok("two notes get different tokens", mine.token !== yours.token);

  // ——— ⚠️ The token is not on the wall ———
  //
  // The assertion that matters most and is easiest to leave out. Everything
  // else here checks the endpoint's rules; this checks that the rules are worth
  // having, by making sure the key is not printed on the door.
  console.log("\n— and what the wall gives out —");
  const cards = await wall();
  const serialised = JSON.stringify(cards);
  ok("⚠️ no token appears in what the wall serves",
     !serialised.includes(mine.token) && !serialised.includes(yours.token));
  ok("⚠️ nor does any hash of one",
     !serialised.includes(hashUnpinToken(mine.token)));
  ok("and the note shape carries no such field",
     cards.every((card) => !("token" in card) && !("unpin" in card) && !("unpin_hash" in card)),
     Object.keys(cards[0] ?? {}).join(","));

  // ——— Unpinning ———
  console.log("\n— taking one down —");
  ok("both notes start on the wall", (await onWall(mine.id)) && (await onWall(yours.id)));
  ok("the right token takes it down", (await unpinNote(mine.id, mine.token)) === true);
  ok("and the card is gone", (await onWall(mine.id)) === false);
  ok("while the other note is untouched", await onWall(yours.id));

  // ⚠️ Hidden, not deleted. The words survive so the shop can put a card back,
  // which is the same promise every other takedown on this wall makes.
  const row = await client.query<{ note: string; hidden: boolean }>(
    `SELECT note, hidden FROM ${SCHEMA}.corner_notes WHERE id = $1`,
    [mine.id],
  );
  ok("the row is still there, marked hidden",
     row.rows[0]?.hidden === true && row.rows[0]?.note === "happy to be here",
     JSON.stringify(row.rows[0]));

  // Idempotent: the caller's question is "is my note down", and it is.
  ok("unpinning it again still answers yes",
     (await unpinNote(mine.id, mine.token)) === true);

  // ——— ⚠️ Somebody else's note ———
  console.log("\n— and the ways it must not work —");
  ok("my token does not unpin your note",
     (await unpinNote(yours.id, mine.token)) === false);
  ok("and your note is still up", await onWall(yours.id));
  ok("a token nobody was issued does nothing",
     (await unpinNote(yours.id, mintUnpinToken())) === false);
  ok("and your note is still up", await onWall(yours.id));
  // ⚠️ The stored hash is not a password. If this passed, reading the database
  // would be enough to clear the wall — which is the reason the column holds a
  // hash rather than the token in the first place.
  const stored = await client.query<{ h: string }>(
    `SELECT unpin_hash AS h FROM ${SCHEMA}.corner_notes WHERE id = $1`,
    [yours.id],
  );
  ok("⚠️ the hash out of the database does not unpin the note",
     (await unpinNote(yours.id, stored.rows[0].h)) === false);
  ok("and your note is still up", await onWall(yours.id));

  console.log("\n— ids that are not ids —");
  // ——— ⚠️ The device cookie, which is the other proof ———
  //
  // The one this exists for: Safari caps script-writable storage at seven days
  // without a visit, so the token in localStorage is gone and the note is
  // still up. Before the cookie that was the end of it — the person who wrote
  // the note could not take it down and nothing on the page said why.
  const deviceA = hashDeviceToken(mintDeviceToken());
  const deviceB = hashDeviceToken(mintDeviceToken());
  const onPhone = await addNote({
    name: "phone", neighborhood: "", note: "written on a phone",
    drawing: [], deviceHash: deviceA,
  });
  ok("a note can be written against a device", onPhone !== null);
  if (!onPhone) return;

  ok("⚠️ the device that wrote it can take it down with no token at all",
     (await unpinNote(onPhone.id, "", deviceA)) === true);

  const second = await addNote({
    name: "phone", neighborhood: "", note: "and another",
    drawing: [], deviceHash: deviceA,
  });
  if (!second) return;
  ok("another device cannot", (await unpinNote(second.id, "", deviceB)) === false);
  ok("and neither can no device at all", (await unpinNote(second.id, "", null)) === false);
  ok("but its own token still works, so nothing was taken away",
     (await unpinNote(second.id, second.token)) === true);

  // ⚠️ A note written before device cookies existed has no device_hash. Every
  // browser presenting a cookie must not be able to unpin it.
  const legacy = await addNote({
    name: "old", neighborhood: "", note: "from before the cookie", drawing: [],
  });
  if (!legacy) return;
  ok("⚠️ a note with no device on it is not unpinnable by any device",
     (await unpinNote(legacy.id, "", deviceA)) === false);
  ok("and still comes down with its token", (await unpinNote(legacy.id, legacy.token)) === true);

  // ——— Which notes a device may offer to take down ———
  const third = await addNote({
    name: "phone", neighborhood: "", note: "still up", drawing: [], deviceHash: deviceA,
  });
  if (!third) return;
  const listed = await noteIdsForDevice(deviceA);
  ok("a device's own note is listed", listed.has(third.id));
  ok("⚠️ and one it already took down is not", !listed.has(onPhone.id));
  ok("another device's list does not contain it", !(await noteIdsForDevice(deviceB)).has(third.id));
  ok("and no device at all lists nothing", (await noteIdsForDevice(null)).size === 0);

  ok("an empty id does nothing", (await unpinNote("", yours.token)) === false);
  ok("a made-up id does nothing", (await unpinNote("n_not-a-uuid", yours.token)) === false);
  // The parameterised query would have been safe anyway; the shape test runs
  // first, so this never becomes a round trip.
  ok("an injection attempt does nothing",
     (await unpinNote("n_' OR '1'='1", yours.token)) === false);
  ok("and after all of that, your note is still up", await onWall(yours.id));

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
