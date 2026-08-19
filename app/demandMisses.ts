import "server-only";

import { SCHEMA, db, explainDbError, ready } from "./db";

// Where people wanted delivery and could not have it.
//
// ——— Why this exists ———
//
// The delivery radius refuses addresses all day and forgets every one of them.
// That is the only honest map of demand the shop will ever have: not a survey,
// not a guess about a neighbourhood, but people who opened the app, typed
// where they live, and were turned away. Six weeks of it answers "where should
// we open next" better than any amount of reasoning about the geometry.
//
// ——— What is kept, and what is deliberately not ———
//
// ⚠️ This is the only thing in this app that records anything about somebody
// who never became a customer, and that is why the shape below is what it is.
//
// No row describes a person or an event. The address is thrown away before
// anything is written: what survives is a tally, per roughly-one-kilometre
// square, per day, of how many refusals happened there. The write is an
// increment on a counter that already exists, so there is no moment at which a
// individual request has a record of its own — nothing to leak, nothing to
// subject-access, nothing to join against an order.
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

/** How many refusals a cell needs before it is reported at all.
 *
 *  A cell with one refusal in it is one person, and a map that draws it is a
 *  map that points at them. Five is a pattern. The rows below the threshold
 *  are still counted — they age out with the rest — they are simply never
 *  shown, so the smallest thing anybody can read out of this is a group. */
export const MIN_CELL = 5;

/** Where the refusal came from, because they are not equal evidence.
 *
 *  `checkout` is somebody with a basket who tried to pay. `area` is somebody
 *  on the delivery page asking whether we come to them. `search` is an address
 *  typed into the finder. All three are real, and a shop would weigh the first
 *  far above the third. */
export type MissSource = "checkout" | "area" | "search";

// The scale on the two coordinate columns is load-bearing, not cosmetic.
//
// numeric(_,2) rounds on insert, so the coarsening is enforced by the table as
// well as by cellOf() below. That is deliberate belt and braces: a future
// caller that passes a raw fix straight through — the exact mistake this file
// exists to make hard — still cannot write one, because the column will not
// hold it. Widening the scale would silently remove that, which is why a test
// asserts on it.
const DDL = `
  CREATE TABLE IF NOT EXISTS ${SCHEMA}.demand_misses (
    cell_lat   numeric(6,2)  NOT NULL,
    cell_lng   numeric(7,2)  NOT NULL,
    day        date          NOT NULL,
    source     text          NOT NULL,
    misses     integer       NOT NULL DEFAULT 0,
    -- Summed rather than averaged, so the average can be taken at read time
    -- without the row having to know how many went into it.
    sum_miles  numeric(10,1) NOT NULL DEFAULT 0,
    PRIMARY KEY (cell_lat, cell_lng, day, source)
  );
  CREATE INDEX IF NOT EXISTS demand_misses_day
    ON ${SCHEMA}.demand_misses (day);
`;

const prepared = () => ready("demand_misses", DDL);

/** A point, rounded to the cell it falls in. Exported because the test asserts
 *  on it and because it is the whole privacy argument in one function. */
export function cellOf([lat, lng]: [number, number]): [number, number] {
  const round = (value: number) =>
    Number((Math.round(value / CELL_DEGREES) * CELL_DEGREES).toFixed(2));
  return [round(lat), round(lng)];
}

let warned = false;

/** Count one refusal.
 *
 *  ⚠️ Never awaited for correctness and never allowed to fail a request. A
 *  customer being told we do not deliver to them is already a bad moment; it
 *  must not also be able to become an error because a counter could not be
 *  incremented.
 *
 *  Takes a point rather than an address on purpose. The caller has the address
 *  and this does not want it — passing one would be the beginning of storing
 *  one. */
export async function recordMiss(
  at: [number, number],
  miles: number,
  source: MissSource,
): Promise<void> {
  const client = db();
  if (!client) {
    if (!warned) {
      warned = true;
      console.info(
        "[demand] no CORNER_DATABASE_URL, so refused addresses are not being" +
          " counted. Nothing else is affected.",
      );
    }
    return;
  }
  if (!Number.isFinite(miles) || miles < 0) return;

  const [lat, lng] = cellOf(at);
  try {
    await prepared();
    await client.query(
      `INSERT INTO ${SCHEMA}.demand_misses (cell_lat, cell_lng, day, source, misses, sum_miles)
       VALUES ($1, $2, current_date, $3, 1, $4)
       ON CONFLICT (cell_lat, cell_lng, day, source)
       DO UPDATE SET misses    = ${SCHEMA}.demand_misses.misses + 1,
                     sum_miles = ${SCHEMA}.demand_misses.sum_miles + $4`,
      [lat, lng, source, miles],
    );
    // Swept from here rather than on a schedule, because there is no scheduler
    // and a table nobody prunes is a retention promise nobody keeps. One write
    // in two hundred pays for it, which at this volume is a handful a week.
    if (Math.random() < 0.005) await sweep(client);
  } catch (error) {
    // Logged and dropped. This is a counter, not an order.
    console.error(`[demand] could not count a refusal: ${explainDbError(error)}`);
  }
}

async function sweep(client: NonNullable<ReturnType<typeof db>>): Promise<void> {
  await client.query(
    `DELETE FROM ${SCHEMA}.demand_misses WHERE day < current_date - $1::int`,
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
  bySource: Record<MissSource, number>;
};

/** The map, for whoever is deciding where to open next.
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
      source: string;
      misses: string;
      sum_miles: string;
    }>(
      `SELECT cell_lat, cell_lng, source,
              sum(misses)::text     AS misses,
              sum(sum_miles)::text  AS sum_miles
         FROM ${SCHEMA}.demand_misses
        WHERE day >= current_date - $1::int
        GROUP BY cell_lat, cell_lng, source`,
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
      const n = Number(row.misses);
      held.misses += n;
      held.sumMiles += Number(row.sum_miles);
      if (row.source === "checkout" || row.source === "area" || row.source === "search") {
        held.bySource[row.source] += n;
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
