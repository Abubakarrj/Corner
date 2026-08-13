import "server-only";

import { db, isDatabaseConfigured, ready } from "./db";

// How much work is on the counter right now.
//
// ——— What this number is, precisely ———
//
// Orders **placed through this app** that the kitchen has not yet marked
// ready. Not the queue. The queue includes the four people standing at the
// counter at 8:15, and this app cannot see them.
//
// That distinction is the whole design, and every piece of copy that renders
// this has to carry it. "3 ahead of you" when the real answer is eleven is
// worse than saying nothing: somebody reads twelve minutes, arrives, and finds
// a line out the door, and the next time they see a wait estimate here they
// will not believe it. So the UI says "online orders", and it says it every
// time, even when the number is small enough that the distinction seems
// pedantic.
//
// When Toast is connected this can become the real count — Toast knows about
// the walk-ins because it is the till. Until then it is a floor, and it is
// labelled as one.
//
// ——— Absent is not zero ———
//
// The most dangerous failure mode here is a database that is missing or
// unreachable returning 0 and rendering as "kitchen is clear". That is a
// confident lie assembled out of nothing. Every function below distinguishes
// "no orders waiting" from "we cannot say", and the API returns { known:
// false } for the second, which the component renders as nothing at all.

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS kitchen_queue (
    id          TEXT PRIMARY KEY,
    -- Toast's guid when the order reached Toast, which is how the fulfilment
    -- webhook finds the row again to close it. Null when Toast is not
    -- connected: the row still counts, it just ages out instead of being
    -- closed by a person pressing a button.
    toast_guid  TEXT,
    placed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    ready_at    TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS kitchen_queue_live
    ON kitchen_queue (placed_at) WHERE ready_at IS NULL;
  CREATE INDEX IF NOT EXISTS kitchen_queue_toast
    ON kitchen_queue (toast_guid);
`;

const prepared = () => ready("kitchen_queue", SCHEMA);

// How long an unclosed order still counts for.
//
// This exists because the closing signal is not guaranteed. A webhook that
// never arrives, a Toast connection that drops, a KDS nobody presses — any of
// them leaves a row open forever, and a count that only ever grows would end
// the day claiming forty orders ahead in an empty shop. Nothing in a bagel
// kitchen is still being made forty minutes later, so past that the row stops
// counting whether or not anybody told us.
//
// Deliberately longer than PREP_MINUTES by a wide margin. The cost of holding
// a finished order in the count for a few extra minutes is a slightly
// pessimistic wait; the cost of dropping a real one early is a number that
// reads clear while the kitchen is buried.
const STALE_MINUTES = 40;

/** How many online orders are waiting, or null when there is no way to know.
 *
 *  Null is the answer whenever a database is absent or refuses — see the note
 *  above about why that must not collapse to zero. */
export async function ordersAhead(): Promise<number | null> {
  const client = db();
  if (!client) return null;
  try {
    await prepared();
    const result = await client.query(
      `SELECT count(*)::int AS waiting
         FROM kitchen_queue
        WHERE ready_at IS NULL
          AND placed_at > now() - ($1 || ' minutes')::interval`,
      [String(STALE_MINUTES)],
    );
    const waiting = result.rows[0]?.waiting;
    return typeof waiting === "number" ? waiting : null;
  } catch (error) {
    console.error("[kitchen] could not count the queue:", (error as Error).message);
    return null;
  }
}

/** Put an order in the queue. Called after the kitchen has accepted it.
 *
 *  Never throws. A queue counter is the least important thing happening at the
 *  moment an order is placed — the customer has paid attention, the kitchen
 *  has the ticket, and a failed insert here must not turn into a failed
 *  order. */
export async function joinQueue(id: string, toastGuid?: string): Promise<void> {
  const client = db();
  if (!client) return;
  try {
    await prepared();
    await client.query(
      `INSERT INTO kitchen_queue (id, toast_guid) VALUES ($1, $2)
         ON CONFLICT (id) DO NOTHING`,
      [id, toastGuid ?? null],
    );
  } catch (error) {
    console.error("[kitchen] could not record an order:", (error as Error).message);
  }
}

/** Mark an order done, by Toast's guid. Called from the status refresh when
 *  the food reaches ready, done or voided — a person pressing Order Ready is
 *  the most trustworthy signal in this system, so it is the one that closes
 *  the row rather than the clock. */
export async function leaveQueue(toastGuid: string): Promise<void> {
  const client = db();
  if (!client) return;
  try {
    await prepared();
    await client.query(
      `UPDATE kitchen_queue SET ready_at = now()
        WHERE toast_guid = $1 AND ready_at IS NULL`,
      [toastGuid],
    );
  } catch (error) {
    console.error("[kitchen] could not close an order:", (error as Error).message);
  }
}

export function isQueueConfigured(): boolean {
  return isDatabaseConfigured();
}
