import "server-only";

import { SCHEMA, db, explainDbError, isDatabaseConfigured, ready } from "./db";

// How much work is on the counter right now — the fallback answer.
//
// ⚠️ Toast answers this better, and /api/kitchen-load prefers it. Orders Hub
// is the till: it sees every ticket the kitchen has whatever channel it came
// through, it is read rather than accumulated so nothing drifts, and there is
// no row to close or sweep. See countOpenPosOrders() in app/toast.ts.
//
// This exists for the deployment where Toast is not wired up yet, which is the
// state this shop is in today. It counts what passed through /api/shop-order —
// a subset of the truth, and with no counter ordering very nearly all of it.
//
// ——— What this number is, precisely ———
//
// Orders one counter has not yet marked ready. All of them: the shop takes no
// counter orders — there is no room to queue in it — so every ticket on the
// counter came through this app, and this count is the whole queue rather than
// a slice of it.
//
// ——— ⚠️ One counter, not the shop ———
//
// This used to be a single number for the whole company, and every shop on the
// map was shown it. Three counters, one count: somebody looking at Western saw
// how busy Wilshire was, and a queue at one address made all three look busy.
//
// A queue is a property of a kitchen. Wilshire being buried says nothing about
// whether the Western outlet can make a bagel in ten minutes, and the whole
// point of the line under the Order button is deciding whether to walk to
// *that* door. So every row now carries the counter it was placed at and every
// count below is scoped to one.
//
// A delivery order counts at the counter it is collected from. It occupies that
// kitchen exactly as a pickup order does, and where the bag goes afterwards
// does not change how long the food takes to come off the rail.
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
    -- Which counter is making it: a StoreLocation id, "wilshire" and so on.
    -- Null on a row written before this column existed, and on the rare order
    -- with no counter to attribute it to. See sameCounter() below for what a
    -- null does to the counts, which is deliberate rather than incidental.
    counter     TEXT,
    placed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    ready_at    TIMESTAMPTZ
  );
  -- ⚠️ The migration, and it has to be here rather than in a script somebody
  -- runs. ready() executes this whole string, and CREATE TABLE IF NOT EXISTS
  -- does nothing at all to a table that already has rows in it — so a
  -- deployment that has been taking orders would keep the old shape and every
  -- insert below would fail on a column that is not there.
  ALTER TABLE ${SCHEMA}.kitchen_queue ADD COLUMN IF NOT EXISTS counter TEXT;
  CREATE INDEX IF NOT EXISTS kitchen_queue_live
    ON ${SCHEMA}.kitchen_queue (placed_at) WHERE ready_at IS NULL;
  CREATE INDEX IF NOT EXISTS kitchen_queue_counter
    ON ${SCHEMA}.kitchen_queue (counter, placed_at) WHERE ready_at IS NULL;
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

/** How a row with no counter on it is treated, written once and used twice.
 *
 *  ⚠️ It counts at every counter rather than at none, and the direction is the
 *  point. A ticket nobody could attribute is still food somebody is making:
 *  leaving it out of every count means the number reads clear while a kitchen
 *  is busy, which is exactly how somebody gets sent to a shop with a line out
 *  of the door. Counting it everywhere is pessimistic, and a pessimistic wait
 *  costs a few minutes rather than a wasted journey.
 *
 *  In practice this is rows written before the column existed, which age out of
 *  the window within the hour. */
const SAME_COUNTER = "(q.counter = $1 OR q.counter IS NULL)";

/** How many orders one counter is still working on, or null when there is no
 *  way to know.
 *
 *  Null is the answer whenever a database is absent or refuses — see the note
 *  above about why that must not collapse to zero. */
export async function ordersAhead(counter: string): Promise<number | null> {
  const client = db();
  if (!client) return null;
  try {
    await prepared();
    const result = await client.query(
      `SELECT count(*)::int AS waiting
         FROM ${SCHEMA}.kitchen_queue q
        WHERE ready_at IS NULL
          AND ${SAME_COUNTER}
          AND placed_at > now() - ($2 || ' minutes')::interval`,
      [counter, String(STALE_MINUTES)],
    );
    const waiting = result.rows[0]?.waiting;
    return typeof waiting === "number" ? waiting : null;
  } catch (error) {
    console.error("[kitchen] could not count the queue:", explainDbError(error));
    return null;
  }
}

/** Every counter at once, so the map can be drawn from one round trip.
 *
 *  Returns a count for each id asked about, including the ones with nothing
 *  waiting — a counter missing from the answer would render as "we cannot say"
 *  when the truth is "nothing on the rail", and those must not look alike.
 *
 *  Null, as everywhere in this file, means no answer at all. */
export async function ordersAheadByCounter(
  counters: readonly string[],
): Promise<Record<string, number> | null> {
  const client = db();
  if (!client) return null;
  if (counters.length === 0) return {};
  try {
    await prepared();
    // ⚠️ Not a GROUP BY on its own. Grouping returns rows only for counters
    // that have work, so a quiet counter would be absent rather than zero.
    // Unnesting the ids and joining from them gives a row for each one asked
    // about, whatever the queue holds.
    const result = await client.query(
      `SELECT c.id AS counter, count(q.id)::int AS waiting
         FROM unnest($1::text[]) AS c(id)
         LEFT JOIN ${SCHEMA}.kitchen_queue q
           ON q.ready_at IS NULL
          AND (q.counter = c.id OR q.counter IS NULL)
          AND q.placed_at > now() - ($2 || ' minutes')::interval
        GROUP BY c.id`,
      [counters, String(STALE_MINUTES)],
    );
    const counts: Record<string, number> = {};
    for (const row of result.rows) {
      counts[String(row.counter)] = Number(row.waiting) || 0;
    }
    return counts;
  } catch (error) {
    console.error("[kitchen] could not count the queues:", explainDbError(error));
    return null;
  }
}

/** How many orders are ahead of one particular order, or null when we cannot
 *  say — which includes not being able to find that order at all.
 *
 *  ——— Why this is not ordersAhead() minus one ———
 *
 *  Before you order, the useful question is how much work is on the counter:
 *  that decides whether you have time. After you order you are in the line,
 *  and the question is your place in it — a number that goes down while you
 *  watch, which is the only reason to show it at all.
 *
 *  Those are different counts, not the same count offset by one. Orders
 *  placed after yours are ahead of nobody and must not be in it.
 *
 *  Scoped to the counter making your order, and it does not need a parameter
 *  for that: the row knows which counter it is on.
 *
 *  Null when the row is missing rather than zero. A zero here reads as "yours
 *  is next", and saying that about an order the kitchen has no record of is
 *  the worst available answer. */
export async function ordersAheadOf(id: string): Promise<number | null> {
  const client = db();
  if (!client) return null;
  try {
    await prepared();
    // One round trip, and the CTE is what makes an absent order distinguish
    // itself: no row in `mine` means no rows out, which is null. A LEFT JOIN
    // rather than a WHERE so an order that is genuinely first still returns a
    // row, counting zero, instead of collapsing into the same empty result as
    // an order we have never heard of.
    const result = await client.query(
      `WITH mine AS (
         SELECT placed_at, counter FROM ${SCHEMA}.kitchen_queue WHERE id = $1
       )
       SELECT count(q.id)::int AS ahead
         FROM mine
         LEFT JOIN ${SCHEMA}.kitchen_queue q
           ON q.ready_at IS NULL
          AND q.placed_at < mine.placed_at
          -- ⚠️ Only the counter making it. An order at Western is not behind
          -- a queue at Wilshire, and counting one against the other tells
          -- somebody standing at the right door to expect the wrong wait.
          --
          -- A null on either side falls through to counting it, for the reason
          -- in SAME_COUNTER above: an unattributable ticket is still food.
          AND (q.counter = mine.counter OR q.counter IS NULL OR mine.counter IS NULL)
          AND q.placed_at > now() - ($2 || ' minutes')::interval
        GROUP BY mine.placed_at`,
      [id, String(STALE_MINUTES)],
    );
    const ahead = result.rows[0]?.ahead;
    return typeof ahead === "number" ? ahead : null;
  } catch (error) {
    console.error("[kitchen] could not place an order in the queue:", explainDbError(error));
    return null;
  }
}

/** Put an order in the queue. Called after the kitchen has accepted it.
 *
 *  Never throws. A queue counter is the least important thing happening at the
 *  moment an order is placed — the customer has paid attention, the kitchen
 *  has the ticket, and a failed insert here must not turn into a failed
 *  order. */
export async function joinQueue(
  id: string,
  at: {
    /** Which counter is making it. A StoreLocation id, and for a delivery the
     *  counter the courier collects from — it is that kitchen's work. */
    counter?: string | null;
    /** The till's own id for the order, where there is a till. */
    toastGuid?: string;
  } = {},
): Promise<void> {
  const client = db();
  if (!client) return;
  try {
    await prepared();
    await client.query(
      `INSERT INTO ${SCHEMA}.kitchen_queue (id, toast_guid, counter) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
      [id, at.toastGuid ?? null, at.counter ?? null],
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
