// A photograph in the table, and the rules about getting it back out.
//
// ⚠️ Needs a scratch database and drops its own table.
//
// ——— Why this is a database suite and not another unit test ———
//
// tests/notePhoto.test.ts pins the shape: what counts as a JPEG, what may be
// served, what a browser is told. All of that is pure and none of it touches a
// row. The rules that actually keep a photograph off the wall are not in those
// functions — they are in a WHERE clause and a column default, and a WHERE
// clause is only true if it is written down where the query is.
//
// So every assertion here is one of the four things that can only go wrong in
// SQL:
//
//   ⚠️ a photo is born pending. Not written and then marked: if there were a
//   moment where bytes existed with no state, that moment is one where the
//   serving query's `photo_state = 'clear'` is the only thing between a
//   stranger's picture and the internet, and it would be reading a NULL.
//
//   ⚠️ pending bytes are not served. The frame develops; the picture does not
//   arrive early.
//
//   ⚠️ hiding a note hides its photograph. This is the one that would be
//   easiest to miss and worst to have missed: the wall's only moderation
//   control is the `hidden` column, and if it took down the words and left the
//   picture at a URL, the control would not work at all.
//
//   ⚠️ a verdict is written once. A retry, a duplicated background task, a
//   queue that fired twice — none of them may reopen a photograph somebody has
//   already dealt with.

import {
  addNote,
  listNotes,
  notePhotoBytes,
  setPhotoState,
} from "../app/cornerNotes";
import { SCHEMA, db, isDatabaseConfigured } from "../app/db";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

/** A JPEG, as far as anything in this app is concerned: the SOI marker and
 *  something to tell one picture from another. */
const jpeg = (mark: number) =>
  Uint8Array.from(Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(32, mark),
  ]));

async function main() {
  if (!isDatabaseConfigured()) {
    console.log("SKIP  no CORNER_DATABASE_URL, so the photo column is untested.");
    console.log("      CORNER_DATABASE_URL=postgres://... npm test notesPhotoStore");
    process.exit(0);
  }
  const client = db();
  if (!client) { console.log("\nno database"); process.exit(1); }
  await client.query(
    `CREATE SCHEMA IF NOT EXISTS ${SCHEMA};
     DROP TABLE IF EXISTS ${SCHEMA}.corner_notes`,
  );

  const wall = async () => (await listNotes(50)) ?? [];
  const find = async (id: string) => (await wall()).find((note) => note.id === id);

  // ——— A note with a photograph ———
  console.log("\n— what happens when somebody sends one —");
  const withPhotoRow = await addNote({
    name: "emeka", neighborhood: "Koreatown", note: "morning",
    drawing: [], photo: jpeg(1),
  });
  ok("the note is saved", typeof withPhotoRow?.id === "string", JSON.stringify(withPhotoRow));
  const withPhoto = withPhotoRow?.id ?? null;
  if (!withPhoto) { console.log("\nnothing to test"); process.exit(1); }

  const born = await client.query<{ state: string | null; has: boolean }>(
    `SELECT photo_state AS state, photo IS NOT NULL AS has
       FROM ${SCHEMA}.corner_notes WHERE id = $1`,
    [withPhoto],
  );
  ok("the bytes are in the row", born.rows[0]?.has === true);
  // ⚠️ In the same statement as the bytes. See the note at the top.
  ok("and it is pending from the moment it exists", born.rows[0]?.state === "pending",
     String(born.rows[0]?.state));

  const pendingCard = await find(withPhoto);
  ok("the wall shows the card", pendingCard !== undefined);
  ok("with a frame that is developing", pendingCard?.photo === "developing",
     String(pendingCard?.photo));
  // ⚠️ The serving rule, and the reason the card says developing rather than
  // showing a picture nobody has looked at.
  ok("and the bytes are not served yet", (await notePhotoBytes(withPhoto)) === null);

  // ——— Cleared ———
  console.log("\n— once somebody has looked —");
  await setPhotoState(withPhoto, "clear");
  const cleared = await notePhotoBytes(withPhoto);
  ok("the bytes come back", cleared !== null && cleared.length === 36, String(cleared?.length));
  ok("and they are the bytes that went in",
     cleared !== null && Buffer.from(cleared).equals(Buffer.from(jpeg(1))));
  ok("the card says the photo is ready", (await find(withPhoto))?.photo === "ready");

  // ——— Refused ———
  console.log("\n— and when it is refused —");
  const refusedRow = await addNote({
    name: "ana", neighborhood: "Echo Park", note: "hello",
    drawing: [], photo: jpeg(2),
  });
  const refused = refusedRow?.id ?? null;
  if (!refused) { console.log("\nnothing to test"); process.exit(1); }
  await setPhotoState(refused, "refused");
  ok("the note is still on the wall", (await find(refused)) !== undefined);
  // ⚠️ Not "hidden photo" — nothing. A card that announced a withheld picture
  // would be an accusation printed under somebody's name.
  ok("its card looks like a note with no photo", (await find(refused))?.photo === null,
     String((await find(refused))?.photo));
  ok("and the bytes are never served", (await notePhotoBytes(refused)) === null);

  // ——— ⚠️ A verdict is written once ———
  console.log("\n— a second verdict —");
  await setPhotoState(refused, "clear");
  ok("a refused photo cannot be cleared afterwards",
     (await notePhotoBytes(refused)) === null);
  await setPhotoState(withPhoto, "refused");
  ok("nor can a cleared one be refused by a late review",
     (await notePhotoBytes(withPhoto)) !== null);

  // ——— ⚠️ Taking a note down takes its photograph with it ———
  console.log("\n— the one moderation control there is —");
  await client.query(
    `UPDATE ${SCHEMA}.corner_notes SET hidden = true WHERE id = $1`,
    [withPhoto],
  );
  ok("a hidden note is off the wall", (await find(withPhoto)) === undefined);
  ok("and its cleared photograph stops being served",
     (await notePhotoBytes(withPhoto)) === null);

  // ——— Notes without one ———
  console.log("\n— the ordinary note, which is most of them —");
  const plainRow = await addNote({
    name: "sam", neighborhood: "", note: "just words", drawing: [],
  });
  const plain = plainRow?.id ?? null;
  if (!plain) { console.log("\nnothing to test"); process.exit(1); }
  ok("a note with no photo says so on the wall", (await find(plain))?.photo === null);
  const noState = await client.query<{ state: string | null }>(
    `SELECT photo_state AS state FROM ${SCHEMA}.corner_notes WHERE id = $1`,
    [plain],
  );
  ok("and carries no state at all", noState.rows[0]?.state === null,
     String(noState.rows[0]?.state));

  // ⚠️ A photograph on its own is a note. Nobody has to write anything to leave
  // one, the same way a drawing on its own has always counted.
  const photoOnlyRow = await addNote({
    name: "", neighborhood: "", note: "", drawing: [], photo: jpeg(3),
  });
  const photoOnly = photoOnlyRow?.id ?? null;
  ok("a photograph with no words is still a note", typeof photoOnly === "string",
     String(photoOnly));
  ok("signed anonymous, like a drawing with no name",
     photoOnly !== null && (await find(photoOnly))?.name === "anonymous");

  // ——— An id nobody issued ———
  console.log("\n— asking for something that is not a note —");
  ok("an empty id is nothing", (await notePhotoBytes("")) === null);
  ok("a made-up id is nothing", (await notePhotoBytes("n_not-a-uuid")) === null);
  // ⚠️ The parameterised query would have been safe anyway. This is checked
  // because the shape test runs *before* the query, so an id that is not one of
  // ours never becomes a round trip at all.
  ok("an injection attempt is nothing",
     (await notePhotoBytes("n_' OR '1'='1")) === null);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
