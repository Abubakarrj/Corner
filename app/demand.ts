import "server-only";

import { SCHEMA, db, explainDbError, ready } from "./db";

// Where demand came from, day by day.
//
// ——— What this is for ———
//
// One question, asked every morning: where do people want food from us, and in
// what shape. Pickup at which counter, delivery to which part of the city, and
// where we had to say no. Six weeks of it decides where the next shop opens
// far better than any amount of reasoning about a map, because it is not a
// guess about a neighbourhood — it is people who opened the app and told us.
//
// The refusals are the half nobody else has. Every delivery radius in the
// world turns addresses away and forgets them; this keeps the count, and a
// cluster of them is the clearest signal a shop will ever get.
//
// ——— What is kept, and what is deliberately not ———
//
// ⚠️ Part of this records people who never became customers, and that is why
// the shape below is what it is.
//
// No row describes a person or an event. An address is thrown away before
// anything is written: what survives is a tally, per roughly-one-kilometre
// square, per day, of how many of each kind of thing happened there. The write
// is an increment on a counter that already exists, so there is no moment at
// which an individual request has a record of its own — nothing to leak,
// nothing to subject-access, nothing to join against an order.
//
// A square of this size distinguishes Santa Monica from Venice, which is the
// question being asked. It does not distinguish a house from its street, which
// is not.
//
// Nothing here is written from the device-location path. The privacy policy
// says the coordinates your browser reports are not stored, and that stays
// literally true: this records only addresses somebody typed, searched for, or
// put on an order — a deliberate statement of where they want food delivered,
// not a reading taken from their phone.
//
// ——— Pickup and catering have no customer address, and do not need one ———
//
// Somebody collecting from a counter never tells us where they live, and this
// does not ask. Their row is filed at the *counter's* own coordinates, which
// is both the honest location of that demand and a point that describes no
// customer at all. So the map reads uniformly: volume at a place, whatever
// kind of demand it is.
//
// ——— And why there is no in-memory fallback ———
//
// Every other store in this app degrades to memory when there is no database.
// This one does not, because the value of the data is that it accumulates over
// weeks, and a tally that resets on every deploy is not a shorter version of
// that — it is a number that would be read as a trend and is not one. Without
// CORNER_DATABASE_URL this records nothing and says so once.

/** How coarse a cell is, in degrees. 0.01° is about 1.1 km north-south and
 *  0.9 km east-west at this latitude.
 *
 *  The number is a privacy decision before it is a resolution one. Finer would
 *  map demand no better — a shop is sited to an arterial road, not to a
 *  hundred metres — and would start describing blocks rather than
 *  neighbourhoods. */
export const CELL_DEGREES = 0.01;

/** How long a tally is kept. A quarter is long enough to see a season and
 *  short enough that nothing here is a permanent record of anything. */
export const KEEP_DAYS = 90;

/** How many refusals a cell needs before it is reported on the map at all.
 *
 *  A cell with one refusal in it is one person, and a map that draws it is a
 *  map that points at them. Five is a pattern. The rows below the threshold
 *  are still counted — they age out with the rest — they are simply never
 *  shown, so the smallest thing anybody can read out of this is a group.
 *
 *  Applies to customer locations. A pickup tally filed at a counter's own
 *  coordinates describes the shop, not a customer, and is reported as it is. */
export const MIN_CELL = 5;

/** What was wanted. */
export type Mode = "delivery" | "pickup" | "catering";

/** How it went.
 *
 *  `placed` is an order the kitchen received. `refused` is somebody turned
 *  away by the delivery radius. `interest` is somebody who got as far as
 *  asking and whose order, if it happened, happened somewhere this app cannot
 *  see — which today means catering, and see the note on that below. */
export type Outcome = "placed" | "refused" | "interest";

/** Where in the app it happened, because the same outcome from two screens is
 *  not equal evidence.
 *
 *  `order` is the checkout succeeding. `checkout` is a basket refused at the
 *  payment step — the strongest refusal there is. `area` is somebody on the
 *  delivery page asking whether we come to them. `search` is an address typed
 *  into the finder. `catering` is the catering sheet being opened. */
export type Channel = "order" | "checkout" | "area" | "search" | "catering";

// The scale on the two coordinate columns is load-bearing, not cosmetic.
//
// numeric(_,2) rounds on insert, so the coarsening is enforced by the table as
// well as by cellOf() below. That is deliberate belt and braces: a future
// caller that passes a raw fix straight through — the exact mistake this file
// exists to make hard — still cannot write one, because the column will not
// hold it. Widening the scale would silently remove that, which is why a test
// asserts on it.
//
// Every column is in the key and none is nullable, which is what makes the
// upsert a single statement. A row with no counter carries '' rather than
// NULL, because NULLs in a primary key are not allowed and a sentinel that is
// obviously empty beats one that is obviously clever.
const DDL = `
  CREATE TABLE IF NOT EXISTS ${SCHEMA}.demand_daily (
    day        date          NOT NULL,
    mode       text          NOT NULL,
    outcome    text          NOT NULL,
    channel    text          NOT NULL,
    counter    text          NOT NULL DEFAULT '',
    cell_lat   numeric(6,2)  NOT NULL,
    cell_lng   numeric(7,2)  NOT NULL,
    n          integer       NOT NULL DEFAULT 0,
    -- Summed rather than averaged, so the average can be taken at read time
    -- without the row having to know how many went into it. Only meaningful
    -- on a refusal, where it is how far outside the radius the address was.
    sum_miles  numeric(10,1) NOT NULL DEFAULT 0,
    PRIMARY KEY (day, mode, outcome, channel, counter, cell_lat, cell_lng)
  );
  CREATE INDEX IF NOT EXISTS demand_daily_day
    ON ${SCHEMA}.demand_daily (day);
`;

const prepared = () => ready("demand_daily", DDL);

/** A point, rounded to the cell it falls in. Exported because the test asserts
 *  on it and because it is the whole privacy argument in one function. */
export function cellOf([lat, lng]: [number, number]): [number, number] {
  const round = (value: number) =>
    Number((Math.round(value / CELL_DEGREES) * CELL_DEGREES).toFixed(2));
  return [round(lat), round(lng)];
}

let warned = false;

export type DemandEntry = {
  mode: Mode;
  outcome: Outcome;
  channel: Channel;
  /** Where it happened. A delivery destination, or the counter's own
   *  coordinates for a pickup — see the note at the top. */
  at: [number, number];
  /** Which counter, when there is one. */
  counter?: string;
  /** Road miles, on a refusal. Ignored otherwise. */
  miles?: number;
};

/** Count one thing that happened.
 *
 *  ⚠️ Never allowed to fail the request that caused it. A customer being told
 *  we do not deliver to them is already a bad moment; it must not also be able
 *  to become an error because a counter could not be incremented. The same
 *  goes double on the success path — an order must never fail because a
 *  statistic did.
 *
 *  Takes a point rather than an address on purpose. The caller has the address
 *  and this does not want it — passing one would be the beginning of storing
 *  one. */
export async function recordDemand(entry: DemandEntry): Promise<void> {
  const client = db();
  if (!client) {
    if (!warned) {
      warned = true;
      console.info(
        "[demand] no CORNER_DATABASE_URL, so demand is not being counted." +
          " Nothing else is affected.",
      );
    }
    return;
  }

  const miles =
    typeof entry.miles === "number" && Number.isFinite(entry.miles) && entry.miles >= 0
      ? entry.miles
      : 0;
  const [lat, lng] = cellOf(entry.at);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  try {
    await prepared();
    await client.query(
      `INSERT INTO ${SCHEMA}.demand_daily
         (day, mode, outcome, channel, counter, cell_lat, cell_lng, n, sum_miles)
       VALUES (current_date, $1, $2, $3, $4, $5, $6, 1, $7)
       ON CONFLICT (day, mode, outcome, channel, counter, cell_lat, cell_lng)
       DO UPDATE SET n         = ${SCHEMA}.demand_daily.n + 1,
                     sum_miles = ${SCHEMA}.demand_daily.sum_miles + $7`,
      [entry.mode, entry.outcome, entry.channel, entry.counter ?? "", lat, lng, miles],
    );
    // Swept from here rather than on a schedule, because there is no scheduler
    // and a table nobody prunes is a retention promise nobody keeps. One write
    // in two hundred pays for it, which at this volume is a handful a week.
    if (Math.random() < 0.005) await sweep(client);
  } catch (error) {
    // Logged and dropped. This is a counter, not an order.
    console.error(`[demand] could not count ${entry.mode}/${entry.outcome}: ${explainDbError(error)}`);
  }
}

/** The old name, kept because three call sites read better in it: what they are
 *  doing really is recording a miss. */
export async function recordMiss(
  at: [number, number],
  miles: number,
  channel: Extract<Channel, "checkout" | "area" | "search">,
): Promise<void> {
  return recordDemand({ mode: "delivery", outcome: "refused", channel, at, miles });
}

async function sweep(client: NonNullable<ReturnType<typeof db>>): Promise<void> {
  await client.query(
    `DELETE FROM ${SCHEMA}.demand_daily WHERE day < current_date - $1::int`,
    [KEEP_DAYS],
  );
}

export type DemandCell = {
  /** The centre of the cell. */
  at: [number, number];
  misses: number;
  /** How far outside the radius those refusals were, on average. Two cells with
   *  the same count are not the same problem if one is half a mile out and the
   *  other is nine. */
  averageMiles: number;
  bySource: Record<"checkout" | "area" | "search", number>;
};

/** The refusal map, for whoever is deciding where to open next.
 *
 *  Null when there is no database — which is different from an empty map, and
 *  the endpoint says so rather than showing a city with no demand in it. */
export async function demandMap(days = 42): Promise<DemandCell[] | null> {
  const client = db();
  if (!client) return null;
  try {
    await prepared();
    const { rows } = await client.query<{
      cell_lat: string;
      cell_lng: string;
      channel: string;
      n: string;
      sum_miles: string;
    }>(
      `SELECT cell_lat, cell_lng, channel,
              sum(n)::text          AS n,
              sum(sum_miles)::text  AS sum_miles
         FROM ${SCHEMA}.demand_daily
        WHERE day >= current_date - $1::int
          AND outcome = 'refused'
        GROUP BY cell_lat, cell_lng, channel`,
      [Math.max(1, Math.min(KEEP_DAYS, Math.round(days)))],
    );

    const cells = new Map<string, DemandCell & { sumMiles: number }>();
    for (const row of rows) {
      const at: [number, number] = [Number(row.cell_lat), Number(row.cell_lng)];
      const key = `${at[0]},${at[1]}`;
      const held =
        cells.get(key) ??
        {
          at,
          misses: 0,
          averageMiles: 0,
          sumMiles: 0,
          bySource: { checkout: 0, area: 0, search: 0 },
        };
      const n = Number(row.n);
      held.misses += n;
      held.sumMiles += Number(row.sum_miles);
      if (row.channel === "checkout" || row.channel === "area" || row.channel === "search") {
        held.bySource[row.channel] += n;
      }
      cells.set(key, held);
    }

    return [...cells.values()]
      // The threshold, applied here rather than in the query, so it is next to
      // the sentence explaining it. See MIN_CELL.
      .filter((cell) => cell.misses >= MIN_CELL)
      .map(({ sumMiles, ...cell }) => ({
        ...cell,
        averageMiles: Number((sumMiles / cell.misses).toFixed(1)),
      }))
      .sort((a, b) => b.misses - a.misses);
  } catch (error) {
    console.error(`[demand] could not read the map: ${explainDbError(error)}`);
    return null;
  }
}

/** One day's worth, as the digest email reads it. */
export type DayRow = {
  mode: Mode;
  outcome: Outcome;
  channel: Channel;
  counter: string;
  at: [number, number];
  n: number;
  averageMiles: number;
};

/** Everything counted on one day, ungrouped.
 *
 *  Raw rather than shaped, because the digest wants to slice it several ways
 *  and a function per slice is how a report ends up disagreeing with itself.
 *
 *  ⚠️ No threshold here. This goes to the shop's own inbox rather than onto a
 *  screen, and a digest that hid the day's only refusal would be hiding the
 *  single most useful thing in it. The threshold protects a *published* map;
 *  this is the shop reading its own till. */
export async function demandOn(day: string): Promise<DayRow[] | null> {
  const client = db();
  if (!client) return null;
  try {
    await prepared();
    const { rows } = await client.query<{
      mode: string;
      outcome: string;
      channel: string;
      counter: string;
      cell_lat: string;
      cell_lng: string;
      n: string;
      sum_miles: string;
    }>(
      `SELECT mode, outcome, channel, counter, cell_lat, cell_lng,
              n::text, sum_miles::text
         FROM ${SCHEMA}.demand_daily
        WHERE day = $1::date`,
      [day],
    );
    return rows.map((row) => ({
      mode: row.mode as Mode,
      outcome: row.outcome as Outcome,
      channel: row.channel as Channel,
      counter: row.counter,
      at: [Number(row.cell_lat), Number(row.cell_lng)] as [number, number],
      n: Number(row.n),
      averageMiles: Number(row.n) > 0
        ? Number((Number(row.sum_miles) / Number(row.n)).toFixed(1))
        : 0,
    }));
  } catch (error) {
    console.error(`[demand] could not read ${day}: ${explainDbError(error)}`);
    return null;
  }
}
