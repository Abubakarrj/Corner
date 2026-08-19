import "server-only";

import { SCHEMA, db, explainDbError, isDatabaseConfigured, ready } from "./db";
import { HORIZON_HOURS } from "./pickupSlots";

// What each slot has already sold.
//
// ——— Why this has to be written down ———
//
// The scheduler in pickupSlots.ts is a pure function of "how many orders are
// already in each slot". That number is the only thing standing between a
// spread morning and nine people told 7:15, so it has to survive a restart, a
// second instance, and the ten seconds between two people tapping Pay.
//
// ——— Seats, and why counting was not enough ———
//
// The first shape of this file counted rows and let the caller compare the
// count to the capacity. That reads correctly and books incorrectly: two
// people tapping Pay in the same second both read "one of two taken", both
// decide there is room, and both insert. The count is right afterwards and
// the promise was already made twice.
//
// So a slot is not a counter, it is a fixed number of seats — 0..capacity-1 —
// and taking one is a single insert against a unique constraint. Two requests
// racing for the same seat produce one row and one conflict, and the loser is
// told so rather than told 7:15. That is the difference between a limit and a
// statistic.
//
// ——— And what happens without a database ———
//
// It falls back to seats held in memory, and says so in the log. That is not a
// real substitute: two instances have two sets, and a deploy resets both. The
// honest framing is that scheduling degrades to a soft spread rather than a
// hard limit — still better than no limit at all, and the failure is a busier
// morning rather than a wrong promise, because the time quoted is still a time
// the customer sees before they pay.
//
// CORNER_DATABASE_URL is what turns it into a real limit. Until it is set,
// this file is doing its best rather than its job.

const DDL = `
  CREATE TABLE IF NOT EXISTS ${SCHEMA}.scheduled_pickups (
    id           text PRIMARY KEY,
    location_id  text NOT NULL,
    slot_at      timestamptz NOT NULL,
    seat         integer NOT NULL,
    placed_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (location_id, slot_at, seat)
  );
  CREATE INDEX IF NOT EXISTS scheduled_pickups_slot
    ON ${SCHEMA}.scheduled_pickups (location_id, slot_at);
`;

const prepared = () => ready("scheduled_pickups", DDL);

// The fallback. Keyed the way the table's unique constraint is, and swept on
// read so a process that stays up for a week does not accumulate last Tuesday.
const seats = new Map<string, Set<string>>();
// Which slot each order already holds. The table gets this free from its
// primary key on id; the Map has to be told, and forgetting to tell it is a
// real bug that a test caught: an order retrying at a different time took a
// second seat, because "have I seen this id" was being asked of one slot's
// seats rather than of all of them.
const holds = new Map<string, string>();
const key = (locationId: string, at: Date) => `${locationId}@${at.toISOString()}`;

function sweepMemory(now: Date) {
  const floor = now.getTime() - 3_600_000;
  for (const entry of [...seats.keys()]) {
    const at = Date.parse(entry.slice(entry.indexOf("@") + 1));
    if (Number.isFinite(at) && at < floor) {
      for (const [id, held] of holds) if (held === entry) holds.delete(id);
      seats.delete(entry);
    }
  }
}

/** How many orders each slot holds, for the window the scheduler can reach.
 *
 *  One query for the whole horizon rather than one per slot: the scheduler
 *  asks about roughly ninety of them to answer a single order, and ninety
 *  round trips to place one bagel order is not a design, it is a mistake with
 *  an index on it. */
export async function slotCounts(
  locationId: string,
  now: Date = new Date(),
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  const until = new Date(now.getTime() + HORIZON_HOURS * 3_600_000);

  const client = db();
  if (!client) {
    sweepMemory(now);
    for (const [entry, taken] of seats) {
      if (!entry.startsWith(`${locationId}@`)) continue;
      const at = Date.parse(entry.slice(entry.indexOf("@") + 1));
      if (at >= now.getTime() - 3_600_000 && at <= until.getTime()) {
        counts.set(at, taken.size);
      }
    }
    return counts;
  }

  try {
    await prepared();
    const { rows } = await client.query<{ slot_at: Date; taken: string }>(
      `SELECT slot_at, count(*)::text AS taken
         FROM ${SCHEMA}.scheduled_pickups
        WHERE location_id = $1 AND slot_at >= $2 AND slot_at <= $3
        GROUP BY slot_at`,
      [locationId, new Date(now.getTime() - 3_600_000), until],
    );
    for (const row of rows) {
      counts.set(new Date(row.slot_at).getTime(), Number(row.taken));
    }
  } catch (error) {
    // An unreadable table means an unknown load, and an unknown load must not
    // read as an empty one — that is the overbooking this whole file exists to
    // prevent. Rethrown so the endpoint refuses the schedule rather than
    // inventing a spread it cannot honour.
    console.error(`[schedule] could not read slot counts: ${explainDbError(error)}`);
    throw error;
  }
  return counts;
}

/** Take a seat in a slot, or report that there wasn't one.
 *
 *  ⚠️ Called *before* the order is confirmed to the customer, and the answer
 *  is what decides whether they are told a time at all. Booking afterwards
 *  would mean the confirmation screen is written before the shop has agreed
 *  to the minute on it.
 *
 *  False is an ordinary answer, not an error: it means somebody else took the
 *  last seat in the seconds since this order read the slot list. The caller's
 *  move is the next free slot, not a failed order.
 *
 *  The id is the order's own, so a retry of the same order finds its existing
 *  row and returns true rather than taking a second seat. */
export async function bookSlot(
  id: string,
  locationId: string,
  at: Date,
  capacity: number,
): Promise<boolean> {
  const client = db();
  if (!client) {
    const entry = key(locationId, at);
    // Already holds a seat, here or anywhere. A retry is not a second
    // booking, and the table says so with its primary key on id.
    const already = holds.get(id);
    if (already !== undefined) return already === entry;
    const held = seats.get(entry) ?? new Set<string>();
    seats.set(entry, held);
    if (held.size >= capacity) return false;
    held.add(id);
    holds.set(id, entry);
    return true;
  }
  try {
    await prepared();
    // One statement, and that is the whole point of it. The seat is chosen
    // from the ones nobody holds and inserted in the same breath, so two
    // requests that pick the same number produce one row and one conflict
    // rather than two bookings — read-then-write in application code cannot
    // make that promise however carefully it is written.
    const { rowCount } = await client.query(
      `INSERT INTO ${SCHEMA}.scheduled_pickups (id, location_id, slot_at, seat)
       SELECT $1, $2, $3, s.seat
         FROM generate_series(0, $4::int - 1) AS s(seat)
        WHERE NOT EXISTS (
                SELECT 1 FROM ${SCHEMA}.scheduled_pickups held
                 WHERE held.location_id = $2
                   AND held.slot_at = $3
                   AND held.seat = s.seat)
        ORDER BY s.seat
        LIMIT 1
       ON CONFLICT DO NOTHING`,
      [id, locationId, at, capacity],
    );
    if ((rowCount ?? 0) > 0) return true;
    // No row. Either the slot filled, or this exact order already holds this
    // exact seat — a retry, which is a yes.
    //
    // Matched on the slot as well as the id, and that is the whole difference
    // between the two answers. An id that already holds a *different* minute
    // is not a retry, it is an order about to be told a time its own row
    // disagrees with; false sends the caller back to read the slots again.
    const { rows } = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM ${SCHEMA}.scheduled_pickups
        WHERE id = $1 AND slot_at = $2`,
      [id, at],
    );
    return Number(rows[0]?.n ?? 0) > 0;
  } catch (error) {
    // A booking that could not be written is a time nobody is holding, and
    // saying "ready at 7:15" on the strength of a failed insert is the exact
    // promise this file exists to keep. So a failure here is a no, and the
    // caller refuses the order rather than inventing a slot.
    console.error(`[schedule] could not book ${id}: ${explainDbError(error)}`);
    return false;
  }
}

/** Give a seat back.
 *
 *  The seat is taken before the order reaches the kitchen, so an order the
 *  kitchen refuses has to hand it back — otherwise every failed submission
 *  quietly shrinks the morning. */
export async function releaseSlot(id: string): Promise<void> {
  const client = db();
  if (!client) {
    for (const held of seats.values()) held.delete(id);
    return;
  }
  try {
    await prepared();
    await client.query(`DELETE FROM ${SCHEMA}.scheduled_pickups WHERE id = $1`, [id]);
  } catch (error) {
    // Logged only. A seat that outlives its order costs one slot of capacity
    // on one morning; refusing to tell the customer their order failed
    // because the cleanup failed too would cost considerably more.
    console.error(`[schedule] could not release ${id}: ${explainDbError(error)}`);
  }
}

/** Whether the counts above are a real limit or a best effort. Rendered
 *  nowhere; it exists so the log can say which one is running. */
export function isScheduleDurable(): boolean {
  return isDatabaseConfigured();
}

/** The `taken` function pickupSlots.ts asks for, built from one read. */
export function takenFrom(counts: Map<number, number>): (at: Date) => number {
  return (at) => counts.get(at.getTime()) ?? 0;
}
