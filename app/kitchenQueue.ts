import "server-only";

import { SCHEMA, db, explainDbError, isDatabaseConfigured, ready } from "./db";

// How much work is on the counter right now — the fallback answer.
//
// ⚠️ Toast answers this better, and /api/kitchen-load prefers it. Orders Hub
// is the till: it sees every ticket the kitchen has whatever channel it came
// through, it is read rather than accumulated so nothing drifts, and there is
// no row to close or sweep. See countOpenOrders() in app/toast.ts.
//
// This exists for the deployment where Toast is not wired up yet, which is the
// state this shop is in today. It counts what passed through /api/shop-order —
// a subset of the truth, and with no counter ordering very nearly all of it.
//
// ——— What this number is, precisely ———
//
// Orders the kitchen has not yet marked ready. All of them: the shop takes no
// counter orders — there is no room to queue in it — so every ticket on the
// counter came through this app, and this count is the whole queue rather than
// a slice of it.
//
// That is worth stating because the first version of this file assumed the
// opposite. It counted the same rows and called them "online orders", with a
// caveat under every rendering saying walk-ins were not included, because a
// number that undercounts the queue is the kind of thing that sends somebody
// to a shop with a line out the door. With no counter ordering there are no
// walk-ins to miss, the caveat was describing a gap that does not exist, and
// hedging against a risk you do not have is its own kind of inaccuracy.
//
// Two things would break that, and both are worth noticing before this number
// goes back to being a floor: a marketplace listing whose tickets reach the
// kitchen without passing through here, and phone orders written on a pad.
//
// Delivery orders count. A courier order occupies the kitchen exactly as a
// pickup order does, and the question this answers — how long until food comes
// off the counter — does not care where the bag goes afterwards.
//
// ——— Absent is not zero ———
//
// The most dangerous failure mode here is a database that is missing or
// unreachable returning 0 and rendering as "kitchen is clear". That is a
// confident lie assembled out of nothing. Every function below distinguishes
// "no orders waiting" from "we cannot say", and the API returns { known:
// false } for the second, which the component renders as nothing at all.

const DDL = `
  CREATE TABLE IF NOT EXISTS ${SCHEMA}.kitchen_queue (
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
    ON ${SCHEMA}.kitchen_queue (placed_at) WHERE ready_at IS NULL;
  CREATE INDEX IF NOT EXISTS kitchen_queue_toast
    ON ${SCHEMA}.kitchen_queue (toast_guid);
`;

const prepared = () => ready("kitchen_queue", DDL);

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
         FROM ${SCHEMA}.kitchen_queue
        WHERE ready_at IS NULL
          AND placed_at > now() - ($1 || ' minutes')::interval`,
      [String(STALE_MINUTES)],
    );
    const waiting = result.rows[0]?.waiting;
    return typeof waiting === "number" ? waiting : null;
  } catch (error) {
    console.error("[kitchen] could not count the queue:", explainDbError(error));
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
      `INSERT INTO ${SCHEMA}.kitchen_queue (id, toast_guid) VALUES ($1, $2)
         ON CONFLICT (id) DO NOTHING`,
      [id, toastGuid ?? null],
    );
  } catch (error) {
    console.error("[kitchen] could not record an order:", explainDbError(error));
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
      `UPDATE ${SCHEMA}.kitchen_queue SET ready_at = now()
        WHERE toast_guid = $1 AND ready_at IS NULL`,
      [toastGuid],
    );
  } catch (error) {
    console.error("[kitchen] could not close an order:", explainDbError(error));
  }
}

export function isQueueConfigured(): boolean {
  return isDatabaseConfigured();
}
