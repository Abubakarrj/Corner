// Counting the addresses we turn away, and — mostly — not counting anything
// else.
//
// ⚠️ Needs a scratch database and drops its own table. This is the only store
// in the app that records anything about somebody who never became a customer,
// so the assertions below are as much about what is *absent* from the table as
// about what is in it.

import { cellOf, demandMap, recordMiss, CELL_DEGREES, MIN_CELL, KEEP_DAYS }
  from "../app/demandMisses";
import { SCHEMA, db, isDatabaseConfigured } from "../app/db";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

async function main() {
  if (!isDatabaseConfigured()) {
    console.log("SKIP  no CORNER_DATABASE_URL, so the demand counter is untested.");
    console.log("      CORNER_DATABASE_URL=postgres://... npm test demandMisses");
    process.exit(0);
  }
  const client = db();
  if (!client) { console.log("\nno database"); process.exit(1); }
  await client.query(
    `CREATE SCHEMA IF NOT EXISTS ${SCHEMA};
     DROP TABLE IF EXISTS ${SCHEMA}.demand_misses`,
  );

  // ——— The coarsening, which is the privacy argument ———
  //
  // Two doors on the same block have to land in the same cell, or the table is
  // a record of houses with a rounding step in front of it.
  const santaMonica: [number, number] = [34.019512, -118.491234];
  const nextDoor: [number, number] = [34.019902, -118.491600];
  ok("a point rounds to two decimals",
     cellOf(santaMonica).join(",") === "34.02,-118.49", cellOf(santaMonica).join(","));
  ok("and its neighbour lands in the same cell",
     cellOf(nextDoor).join(",") === cellOf(santaMonica).join(","),
     cellOf(nextDoor).join(","));
  // While a different neighbourhood does not.
  const venice: [number, number] = [33.985, -118.4695];
  ok("a different neighbourhood is a different cell",
     cellOf(venice).join(",") !== cellOf(santaMonica).join(","));
  ok("the cell is about a kilometre", CELL_DEGREES === 0.01);

  // ——— Nothing is stored until the threshold, and never an address ———
  for (let i = 0; i < MIN_CELL - 1; i += 1) {
    await recordMiss(santaMonica, 14.2, "checkout");
  }
  let map = await demandMap();
  ok("a cell under the threshold is not reported", (map ?? []).length === 0,
     JSON.stringify(map));
  const { rows: under } = await client.query<{ misses: string }>(
    `SELECT misses::text FROM ${SCHEMA}.demand_misses`,
  );
  ok("though it is being counted", under[0]?.misses === String(MIN_CELL - 1),
     under[0]?.misses);

  await recordMiss(santaMonica, 14.6, "checkout");
  map = await demandMap();
  ok("at the threshold it appears", (map ?? []).length === 1, JSON.stringify(map));
  ok("with the right count", map?.[0]?.misses === MIN_CELL, String(map?.[0]?.misses));
  ok("at the cell centre, not the doorstep",
     map?.[0]?.at.join(",") === "34.02,-118.49", map?.[0]?.at.join(","));
  ok("and an average distance",
     map?.[0]?.averageMiles !== undefined && map[0].averageMiles > 14 &&
       map[0].averageMiles < 15, String(map?.[0]?.averageMiles));

  // ——— The table has no column that could name anybody ———
  //
  // Asserted on the schema rather than on behaviour, because "we did not
  // store the address" is a promise about a shape, and a shape is the thing
  // that can be checked once and stay checked.
  const { rows: columns } = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'demand_misses'`,
    [SCHEMA],
  );
  const names = columns.map((c) => c.column_name).sort();
  ok("the columns are only a cell, a day, a source and two numbers",
     names.join(",") === "cell_lat,cell_lng,day,misses,source,sum_miles", names.join(","));
  for (const forbidden of ["address", "email", "phone", "name", "ip", "session", "account"]) {
    ok(`no ${forbidden} column`, !names.some((n) => n.includes(forbidden)));
  }
  // And no row is finer-grained than a day, so nothing here is a timeline.
  const { rows: shape } = await client.query<{ data_type: string }>(
    `SELECT data_type FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'demand_misses' AND column_name = 'day'`,
    [SCHEMA],
  );
  ok("the clock is a date, not a timestamp", shape[0]?.data_type === "date",
     shape[0]?.data_type);

  // ——— The column rounds too, and that is the point ———
  //
  // Found by mutation: deleting cellOf() from recordMiss changed nothing,
  // because numeric(_,2) rounds on insert and the table refused the precision
  // anyway. That is the design working — two layers, either sufficient — but
  // it means the code-level coarsening alone is not what is protecting anyone,
  // and the column's scale has to be asserted or it can be widened by accident.
  const { rows: scale } = await client.query<{ column_name: string; numeric_scale: number }>(
    `SELECT column_name, numeric_scale FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'demand_misses'
        AND column_name IN ('cell_lat', 'cell_lng')
      ORDER BY column_name`,
    [SCHEMA],
  );
  ok("the table itself will not hold a finer coordinate than the cell",
     scale.length === 2 && scale.every((c) => c.numeric_scale === 2),
     scale.map((c) => `${c.column_name}:${c.numeric_scale}`).join(" "));

  // ——— Sources are kept apart ———
  for (let i = 0; i < MIN_CELL; i += 1) await recordMiss(venice, 13.9, "area");
  map = await demandMap();
  const veniceCell = map?.find((c) => c.at[0] === 33.99 || c.at[0] === 33.98);
  ok("a second cell appears", veniceCell !== undefined, JSON.stringify(map?.map((c) => c.at)));
  ok("counted under its own source",
     veniceCell?.bySource.area === MIN_CELL && veniceCell?.bySource.checkout === 0,
     JSON.stringify(veniceCell?.bySource));
  ok("and the checkout cell is unaffected",
     map?.find((c) => c.at[0] === 34.02)?.bySource.checkout === MIN_CELL);

  // ——— Retention is a real deletion, not a filter ———
  await client.query(
    `UPDATE ${SCHEMA}.demand_misses SET day = current_date - $1::int`, [KEEP_DAYS + 5],
  );
  map = await demandMap();
  ok("anything past the window is not reported", (map ?? []).length === 0,
     JSON.stringify(map));
  // The sweep is probabilistic on write, so drive it rather than wait for it.
  for (let i = 0; i < 2000 && (await client.query(
    `SELECT count(*)::int AS n FROM ${SCHEMA}.demand_misses`,
  )).rows[0].n > 0; i += 1) {
    await recordMiss(santaMonica, 12, "search");
  }
  const { rows: left } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${SCHEMA}.demand_misses WHERE day < current_date - ${KEEP_DAYS}`,
  );
  ok("and is eventually deleted rather than kept out of sight", left[0].n === 0,
     String(left[0].n));

  // ——— A refusal never fails the request that caused it ———
  await client.query(`ALTER TABLE ${SCHEMA}.demand_misses RENAME TO gone`);
  let threw = false;
  try { await recordMiss(santaMonica, 11, "checkout"); } catch { threw = true; }
  ok("a broken table does not throw into the customer's request", !threw);
  await client.query(`ALTER TABLE ${SCHEMA}.gone RENAME TO demand_misses`);

  await client.end();
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
