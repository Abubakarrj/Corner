// The queue of gift cards still owed to somebody.
//
// ——— What this is protecting ———
//
// Every row here is money already taken. The card exists at Square before this
// table hears about it, so a bug in this file is not a lost feature — it is a
// customer who paid fifty dollars and whose recipient never got anything.
//
// Two halves. The pure decisions run anywhere; the table needs a real Postgres
// and skips loudly without one, the same way the seat table does.

import {
  isDue,
  undeliverable,
  destinationFor,
  recordGiftDelivery,
  pendingGiftDeliveries,
  markGiftDelivered,
  markGiftFailed,
  type GiftDelivery,
} from "../app/giftDelivery";
import { SCHEMA, db } from "../app/db";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

const card = (over: Partial<GiftDelivery> = {}): GiftDelivery => ({
  id: "gift-1",
  squareGiftCardId: "gc-1",
  squareOrderId: "ord-1",
  amountCents: 5000,
  designId: "classic",
  method: "email",
  recipientContact: "friend@example.com",
  recipientName: "Sam",
  senderName: "Ada",
  buyerEmail: "ada@example.com",
  message: "happy birthday",
  deliverOn: null,
  ...over,
});

// ——— When a card is due ———
const TODAY = "2026-08-20";
ok("no date means now", isDue(null, TODAY) === true);
ok("today is due", isDue(TODAY, TODAY) === true);
ok("tomorrow is not", isDue("2026-08-21", TODAY) === false);
// ⚠️ A card whose date went by while the cron was broken is still owed. Skipping
// past dates would lose it silently, which is the one outcome money already
// taken cannot have.
ok("and a date that has gone by is due, not skipped",
   isDue("2026-08-01", TODAY) === true);
// String comparison across a month and a year boundary, because ISO dates are
// only safe to compare while they stay zero-padded.
ok("across a month boundary", isDue("2026-07-31", "2026-08-01") === true);
ok("and a year boundary", isDue("2027-01-01", "2026-12-31") === false);

// ——— Where it goes ———
ok("an email card goes to the recipient",
   destinationFor(card()) === "friend@example.com", destinationFor(card()));
// "Send it to me" is the buyer wanting it themselves, to forward or to print.
ok("a self card goes to the buyer",
   destinationFor(card({ method: "self" })) === "ada@example.com",
   destinationFor(card({ method: "self" })));
ok("and a card with no recipient falls back to the buyer rather than nowhere",
   destinationFor(card({ recipientContact: "" })) === "ada@example.com",
   destinationFor(card({ recipientContact: "" })));

// ——— What this app cannot send ———
//
// ⚠️ The form offers three methods and there is no SMS provider in this
// codebase. A text card that is issued and silently never sent is the worst
// outcome available, because the money has already moved — so it is named.
ok("email is deliverable", undeliverable("email") === null);
ok("self is deliverable", undeliverable("self") === null);
const noSms = undeliverable("text");
ok("text is not", noSms !== null, String(noSms));
ok("and says why, and that the card still exists",
   noSms !== null && /SMS/.test(noSms) && /issued/.test(noSms), String(noSms));

async function main() {
  // ⚠️ Reachability, not configuration. db() builds a pool from the URL without
  // connecting, so checking it only proves somebody set a variable — the first
  // version of this guard did exactly that and the suite crashed with
  // ECONNREFUSED instead of skipping. A developer without a database running
  // should get a skip, not a stack trace.
  const reachable = await (async () => {
    const client = db();
    if (!client) return false;
    try {
      await client.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  })();

  if (!reachable) {
    console.log("SKIP  no reachable CORNER_DATABASE_URL, so the delivery queue is untested.");
    console.log("      Start a Postgres and set it to run this half:");
    console.log("      CORNER_DATABASE_URL=postgres://... npm test giftDelivery");
    console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
    process.exit(failures === 0 ? 0 : 1);
  }

  const client = db()!;
  // Re-runnable. A suite that only passes on a fresh database is a suite that
  // gets run once.
  await client.query(`DROP TABLE IF EXISTS ${SCHEMA}.gift_deliveries`);

  ok("a card is recorded", (await recordGiftDelivery(card())) === true);

  const due = await pendingGiftDeliveries(TODAY);
  ok("and comes back as owed", due.length === 1, JSON.stringify(due));
  ok("with everything needed to send it",
     due[0]?.squareGiftCardId === "gc-1" &&
       due[0]?.recipientContact === "friend@example.com" &&
       due[0]?.message === "happy birthday" &&
       due[0]?.amountCents === 5000,
     JSON.stringify(due[0]));

  // ⚠️ The number itself is not stored. It is a bearer instrument, Square
  // already holds it, and a copy here would be live money sitting in a table
  // anybody with a backup can read.
  const columns = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'gift_deliveries'`,
    [SCHEMA],
  );
  const names = columns.rows.map((r) => String(r.column_name));
  ok("the card number is not in the table",
     !names.some((n) => /gan|number|code/.test(n)), JSON.stringify(names));

  // ——— A card for a birthday on Saturday ———
  await recordGiftDelivery(card({ id: "gift-2", deliverOn: "2026-08-25" }));
  const stillToday = await pendingGiftDeliveries(TODAY);
  ok("a future card is not sent early", stillToday.length === 1, JSON.stringify(stillToday));
  const onTheDay = await pendingGiftDeliveries("2026-08-25");
  ok("and is owed on the day", onTheDay.length === 2, JSON.stringify(onTheDay.map((d) => d.id)));

  // ——— Sending it ———
  await markGiftDelivered("gift-1");
  const left = await pendingGiftDeliveries("2026-08-25");
  ok("a sent card stops being owed",
     left.length === 1 && left[0]?.id === "gift-2", JSON.stringify(left.map((d) => d.id)));

  // ——— A send that failed ———
  //
  // Resend down for ten minutes must not lose a card. The row waits.
  await markGiftFailed("gift-2", "resend said 503");
  const waiting = await pendingGiftDeliveries("2026-08-25");
  ok("a failed send leaves the card owed rather than dropping it",
     waiting.length === 1 && waiting[0]?.id === "gift-2", JSON.stringify(waiting));
  const row = await client.query(
    `SELECT attempts, last_error FROM ${SCHEMA}.gift_deliveries WHERE id = 'gift-2'`,
  );
  ok("and counts the attempt", Number(row.rows[0]?.attempts) === 1,
     String(row.rows[0]?.attempts));
  ok("with the reason kept, so a stuck one can be explained",
     /503/.test(String(row.rows[0]?.last_error)), String(row.rows[0]?.last_error));

  // ——— Recorded twice ———
  //
  // The purchase path can retry. A second insert of the same card must not
  // become a second gift.
  const before = (await pendingGiftDeliveries("2026-08-25")).length;
  const again = await recordGiftDelivery(card({ id: "gift-2", deliverOn: "2026-08-25" }));
  ok("recording the same card twice does not owe it twice",
     (await pendingGiftDeliveries("2026-08-25")).length === before,
     String((await pendingGiftDeliveries("2026-08-25")).length));
  // ⚠️ And reports success, because it *is* one — the card is recorded.
  // Without ON CONFLICT the second insert violates the primary key, gets caught,
  // and logs "issued and must be sent by hand" about a card that is already
  // safely queued. A false alarm on that line is worse than no line: it is the
  // one somebody is meant to act on.
  ok("and a repeat is a quiet success rather than a false alarm",
     again === true, String(again));

  // ——— Catching up in batches ———
  for (let i = 0; i < 5; i += 1) {
    await recordGiftDelivery(card({ id: `bulk-${i}` }));
  }
  const batch = await pendingGiftDeliveries("2026-08-25", 3);
  ok("a backlog comes back in batches rather than all at once",
     batch.length === 3, String(batch.length));

  await client.query(`DROP TABLE IF EXISTS ${SCHEMA}.gift_deliveries`);
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
