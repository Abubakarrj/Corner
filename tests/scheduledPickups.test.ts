// The seat table, against a real Postgres.
//
// ——— Why this needed its own run ———
//
// Everything else about scheduling has been tested against the in-memory
// fallback, which is the mode this runs in without CORNER_DATABASE_URL. That
// mode is a Map, and a Map cannot be wrong about isolation. The whole reason
// scheduledPickups.ts exists in the shape it does is the SQL: one statement
// that picks a free seat and takes it, so two people tapping Pay in the same
// second get one booking and one conflict rather than the same minute twice.
//
// A Map cannot test that. This can.

import { bookSlot, releaseSlot, slotCounts, isScheduleDurable }
  from "../app/scheduledPickups";
import { SCHEMA, db } from "../app/db";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

const at = (minutes: number) => new Date(Date.now() + minutes * 60_000);

async function main() {
  // ——— Skipped without a database, and loudly ———
  //
  // The rest of the suite runs anywhere; this one needs a real Postgres,
  // because the thing it tests is isolation and a Map has none. Skipping is
  // right — a developer without a database should still be able to run the
  // tests — but skipping *quietly* would mean the one suite covering the seat
  // constraint silently never runs in CI either.
  if (!isScheduleDurable()) {
    console.log("SKIP  no CORNER_DATABASE_URL, so the durable seat path is untested.");
    console.log("      Start a Postgres and set it to run this suite:");
    console.log("      CORNER_DATABASE_URL=postgres://... npm test scheduledPickups");
    process.exit(0);
  }
  ok("it is running against a real database", isScheduleDurable());

  const client = db();
  if (!client) { console.log("\nno database"); process.exit(1); }

  // ——— This suite owns the table ———
  //
  // ⚠️ Point CORNER_DATABASE_URL at a scratch database, not at anything real.
  // Every assertion below is about counts and seat numbers, so it starts from
  // empty or it starts from whatever the last run left and measures that
  // instead. Truncating is what makes the suite runnable twice, which is the
  // difference between a test and a ceremony.
  await client.query(
    `CREATE SCHEMA IF NOT EXISTS ${SCHEMA};
     DROP TABLE IF EXISTS ${SCHEMA}.scheduled_pickups`,
  );

  // ——— One seat is one seat ———
  const slotA = at(60);
  ok("the first order takes a seat", (await bookSlot("a1", "wilshire", slotA, 2)) === true);
  ok("the second takes the other", (await bookSlot("a2", "wilshire", slotA, 2)) === true);
  ok("the third is refused", (await bookSlot("a3", "wilshire", slotA, 2)) === false);
  const counts = await slotCounts("wilshire");
  ok("and the count says two", counts.get(slotA.getTime()) === 2,
     String(counts.get(slotA.getTime())));

  // ——— The seats really are distinct rows ———
  const { rows } = await client.query<{ seat: number; id: string }>(
    `SELECT seat, id FROM ${SCHEMA}.scheduled_pickups WHERE slot_at = $1 ORDER BY seat`,
    [slotA],
  );
  ok("two rows, seats 0 and 1", rows.map((r) => r.seat).join(",") === "0,1",
     rows.map((r) => `${r.id}@${r.seat}`).join(" "));

  // ——— A retry is idempotent, and only for its own slot ———
  ok("the same order re-booking its own seat is a yes",
     (await bookSlot("a1", "wilshire", slotA, 2)) === true);
  const still = await slotCounts("wilshire");
  ok("and adds no row", still.get(slotA.getTime()) === 2, String(still.get(slotA.getTime())));
  const slotB = at(70);
  ok("the same id at a different slot is not a retry",
     (await bookSlot("a1", "wilshire", slotB, 4)) === false);
  const afterB = await slotCounts("wilshire");
  ok("so that slot stays empty", (afterB.get(slotB.getTime()) ?? 0) === 0,
     String(afterB.get(slotB.getTime())));

  // ——— Counters do not share seats ———
  ok("another counter's slot is its own",
     (await bookSlot("b1", "glendon", slotA, 2)) === true);
  const wil = await slotCounts("wilshire");
  const glen = await slotCounts("glendon");
  ok("and the counts do not bleed",
     wil.get(slotA.getTime()) === 2 && glen.get(slotA.getTime()) === 1,
     `wilshire=${wil.get(slotA.getTime())} glendon=${glen.get(slotA.getTime())}`);

  // ——— Releasing gives the seat back ———
  await releaseSlot("a1");
  const freed = await slotCounts("wilshire");
  ok("a released order frees its seat", freed.get(slotA.getTime()) === 1,
     String(freed.get(slotA.getTime())));
  ok("which the next order can take", (await bookSlot("a4", "wilshire", slotA, 2)) === true);
  ok("and then it is full again", (await bookSlot("a5", "wilshire", slotA, 2)) === false);

  // ——— The constraint that makes the race unwinnable ———
  //
  // Asserted on the schema, and that is not belt-and-braces: the concurrency
  // test below passes with the UNIQUE dropped, because a single INSERT..SELECT
  // holds its snapshot for microseconds and four pooled connections rarely
  // interleave inside that. So the race test proves the *statement* is right
  // and cannot reach the constraint at all. The constraint is what holds when
  // they do interleave — a second instance, a slower disk, a busier morning —
  // and the only honest way to test a guarantee this test cannot provoke is to
  // assert that it is there.
  const { rows: constraints } = await client.query<{ def: string }>(
    `SELECT pg_get_constraintdef(c.oid) AS def
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = $1 AND t.relname = 'scheduled_pickups' AND c.contype = 'u'`,
    [SCHEMA],
  );
  ok("the seat is unique per counter and slot",
     constraints.some((r) => /UNIQUE \(location_id, slot_at, seat\)/.test(r.def)),
     constraints.map((r) => r.def).join(" | ") || "(none)");

  // ——— The race this file exists for ———
  //
  // Twenty orders for a slot of four, fired at once. The pool caps at four
  // connections, so this is four-way concurrency repeated five times over,
  // which is the shape a busy morning actually has.
  // Read-then-write in application code loses this; a single statement against
  // a unique constraint does not. Anything other than exactly four is the
  // overbooking the whole feature is built to prevent.
  const slotC = at(120);
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) => bookSlot(`race-${i}`, "wilshire", slotC, 4)),
  );
  const won = results.filter(Boolean).length;
  ok("exactly four of twenty simultaneous orders get a seat", won === 4, String(won));
  const raced = await slotCounts("wilshire");
  ok("and the table holds exactly four", raced.get(slotC.getTime()) === 4,
     String(raced.get(slotC.getTime())));
  const { rows: seats } = await client.query<{ seat: number }>(
    `SELECT seat FROM ${SCHEMA}.scheduled_pickups WHERE slot_at = $1 ORDER BY seat`,
    [slotC],
  );
  ok("with no seat handed out twice", seats.map((r) => r.seat).join(",") === "0,1,2,3",
     seats.map((r) => r.seat).join(","));

  // ——— A slot outside the horizon is not counted ———
  const far = at(60 * 40);
  await bookSlot("far", "wilshire", far, 4);
  const horizon = await slotCounts("wilshire");
  ok("a booking beyond the horizon is not in the counts",
     !horizon.has(far.getTime()), String(horizon.get(far.getTime())));

  // ——— An unreadable table throws rather than reading as empty ———
  //
  // The single most dangerous failure here: an unknown load must never look
  // like no load, because that is how a slot gets sold twice over.
  await client.query(`ALTER TABLE ${SCHEMA}.scheduled_pickups RENAME TO hidden`);
  let threw = false;
  try { await slotCounts("wilshire"); } catch { threw = true; }
  ok("an unreadable table throws rather than reporting an empty morning", threw);
  await client.query(`ALTER TABLE ${SCHEMA}.hidden RENAME TO scheduled_pickups`);

  await client.end();
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
