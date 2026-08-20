// One counter's queue, not the company's.
//
// ——— The bug this is written against ———
//
// The queue was a single number for the whole shop and every location sheet on
// the map was shown it. Three counters, one count: a queue at Wilshire appeared
// under the Order button on the Western outlet's sheet, and somebody deciding
// whether to walk to Western was reading Wilshire's morning.
//
// A busyness line that describes a different address is worse than no line at
// all, because it is confidently wrong about the only thing it is for. So every
// assertion below is about a count staying where it belongs.
//
// ⚠️ Needs a real Postgres. This is SQL — the scoping lives in two queries and
// nothing about it can be checked without running them — so the suite says so
// loudly rather than passing on a stub that proves nothing.

import {
  joinQueue,
  leaveQueue,
  ordersAhead,
  ordersAheadByCounter,
  ordersAheadOf,
} from "../app/kitchenQueue";
import { countFor } from "../app/(marketing)/locations/KitchenLoad";
import { SCHEMA, db } from "../app/db";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

const COUNTERS = ["wilshire", "figueroa", "western"];

// ——— Which number a sheet shows ———
//
// The half of this that runs without a database: given the endpoint's answer,
// which count does one location sheet render. It is four lines and it is where
// the original bug lived — every sheet reading the same number — so it gets
// asked directly rather than inferred from the shape of the payload.
const answered = { known: true as const, counters: { wilshire: 4, figueroa: 1, western: 0 } };
ok("a sheet shows its own counter's number", countFor(answered, "wilshire") === 4,
   String(countFor(answered, "wilshire")));
ok("⚠️ and not another counter's", countFor(answered, "figueroa") === 1,
   String(countFor(answered, "figueroa")));
// A real, checked zero. This is the one that renders "no orders ahead", and it
// has to be reachable or a quiet counter says nothing when it has something
// worth saying.
ok("a quiet counter renders a zero rather than nothing",
   countFor(answered, "western") === 0, String(countFor(answered, "western")));
// ⚠️ Absent is not zero. A counter missing from the answer was not asked
// about — a new location, or an answer from an older deploy — and printing
// "no orders ahead" for it is a sentence invented out of a gap.
ok("a counter the answer does not mention renders nothing",
   countFor(answered, "venice") === null, String(countFor(answered, "venice")));
ok("and neither does an answer that knows nothing",
   countFor({ known: false }, "wilshire") === null);
ok("nor no answer at all", countFor(null, "wilshire") === null);

async function main() {
  // Reachability, not configuration. db() builds a pool from the URL without
  // connecting, so checking it only proves somebody set a variable.
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
    console.log("SKIP  no reachable CORNER_DATABASE_URL, so the queue is untested.");
    console.log("      Every counter's count is SQL and none of it runs without one:");
    console.log("      CORNER_DATABASE_URL=postgres://... npm test kitchenQueue");
    console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
    process.exit(failures === 0 ? 0 : 1);
  }

  const client = db()!;
  // Re-runnable. A suite that only passes on a fresh database is a suite that
  // gets run once.
  await client.query(`DROP TABLE IF EXISTS ${SCHEMA}.kitchen_queue`);

  // ——— Three counters, three queues ———
  await joinQueue("w-1", { counter: "wilshire" });
  await joinQueue("w-2", { counter: "wilshire" });
  await joinQueue("w-3", { counter: "wilshire" });
  await joinQueue("f-1", { counter: "figueroa" });

  ok("a counter counts its own orders", (await ordersAhead("wilshire")) === 3,
     String(await ordersAhead("wilshire")));
  ok("and not another counter's", (await ordersAhead("figueroa")) === 1,
     String(await ordersAhead("figueroa")));
  // ⚠️ The whole point. Three tickets at Wilshire must not make Western look
  // busy — that is the number that sends somebody to the wrong door, or stops
  // them walking to the right one.
  ok("⚠️ and a counter with nothing on the rail reads zero",
     (await ordersAhead("western")) === 0, String(await ordersAhead("western")));

  // ——— All of them in one round trip ———
  // Compared field by field rather than as serialised JSON: the rows come back
  // in whatever order the query planner chose, and a suite that fails on key
  // order is a suite that fails for a reason nobody cares about.
  const same = (
    answer: Record<string, number> | null,
    expected: Record<string, number>,
  ) =>
    answer !== null &&
    Object.keys(expected).length === Object.keys(answer).length &&
    Object.entries(expected).every(([counter, count]) => answer[counter] === count);

  const all = await ordersAheadByCounter(COUNTERS);
  ok("every counter comes back at once",
     same(all, { wilshire: 3, figueroa: 1, western: 0 }), JSON.stringify(all));
  // ⚠️ Present and zero, not absent. A GROUP BY on its own returns rows only
  // for counters that have work, and a missing key renders as "we cannot say"
  // — which is a different sentence from "nothing waiting".
  ok("including the quiet one, as a zero rather than a gap",
     all !== null && "western" in all && all.western === 0, JSON.stringify(all));
  ok("and a counter nobody asked about is not invented",
     all !== null && Object.keys(all).length === 3, JSON.stringify(all));
  ok("asking about none of them is an empty answer, not a failure",
     JSON.stringify(await ordersAheadByCounter([])) === "{}");

  // ——— Where one order sits ———
  //
  // Not the count minus one: orders placed after yours are ahead of nobody.
  ok("an order knows its place at its own counter",
     (await ordersAheadOf("w-3")) === 2, String(await ordersAheadOf("w-3")));
  ok("the first one in has nobody ahead of it",
     (await ordersAheadOf("w-1")) === 0, String(await ordersAheadOf("w-1")));
  // ⚠️ Figueroa's single order is first in its own queue, not fourth behind
  // Wilshire's three. This is the same bug as the count, seen from the other
  // end: it would tell somebody at the right door to expect the wrong wait.
  ok("⚠️ and a quiet counter's order is not behind a busy one's",
     (await ordersAheadOf("f-1")) === 0, String(await ordersAheadOf("f-1")));
  // A zero here reads as "yours is next", so an order nobody has heard of must
  // never produce one.
  ok("an order nobody has heard of is null, never zero",
     (await ordersAheadOf("nope")) === null, String(await ordersAheadOf("nope")));

  // ——— A delivery is the collecting counter's work ———
  //
  // It occupies that kitchen exactly as a pickup does; where the bag goes
  // afterwards does not change how long the food takes.
  await joinQueue("d-1", { counter: "figueroa" });
  ok("a delivery counts at the counter it is collected from",
     (await ordersAhead("figueroa")) === 2, String(await ordersAhead("figueroa")));
  ok("and nowhere else", (await ordersAhead("western")) === 0);

  // ——— A ticket nobody could attribute ———
  //
  // ⚠️ Counts at every counter rather than at none, and the direction is
  // deliberate: leaving it out everywhere means the number reads clear while a
  // kitchen is busy, which is how somebody gets sent to a shop with a line out
  // of the door. Pessimistic costs a few minutes; optimistic costs the journey.
  //
  // In practice these are rows written before the column existed.
  await client.query(
    `INSERT INTO ${SCHEMA}.kitchen_queue (id, counter) VALUES ('orphan', NULL)`,
  );
  ok("an unattributed ticket counts at every counter, not at none",
     (await ordersAhead("western")) === 1, String(await ordersAhead("western")));
  ok("and at the busy ones too", (await ordersAhead("wilshire")) === 4,
     String(await ordersAhead("wilshire")));
  const withOrphan = await ordersAheadByCounter(COUNTERS);
  ok("the batch answer agrees with the single one",
     same(withOrphan, { wilshire: 4, figueroa: 3, western: 1 }), JSON.stringify(withOrphan));
  await client.query(`DELETE FROM ${SCHEMA}.kitchen_queue WHERE id = 'orphan'`);

  // ——— Marked ready ———
  await joinQueue("t-1", { counter: "western", toastGuid: "guid-1" });
  ok("a till order joins its counter", (await ordersAhead("western")) === 1,
     String(await ordersAhead("western")));
  await leaveQueue("guid-1");
  ok("and stops counting when the kitchen marks it ready",
     (await ordersAhead("western")) === 0, String(await ordersAhead("western")));
  ok("without touching another counter", (await ordersAhead("wilshire")) === 3,
     String(await ordersAhead("wilshire")));

  // ——— Old enough to have been forgotten ———
  //
  // The closing signal is not guaranteed. A row nobody closed stops counting
  // after 40 minutes rather than growing all day.
  await client.query(
    `INSERT INTO ${SCHEMA}.kitchen_queue (id, counter, placed_at)
     VALUES ('stale', 'wilshire', now() - interval '90 minutes')`,
  );
  ok("a ticket nobody closed ages out rather than counting forever",
     (await ordersAhead("wilshire")) === 3, String(await ordersAhead("wilshire")));
  // And it must not be counted as ahead of a fresh order either — it is older,
  // so a naive placed_at comparison would put it in front.
  ok("and is not ahead of anybody",
     (await ordersAheadOf("w-1")) === 0, String(await ordersAheadOf("w-1")));

  // ——— Recorded twice ———
  const before = await ordersAhead("wilshire");
  await joinQueue("w-1", { counter: "wilshire" });
  ok("the same order twice does not queue twice",
     (await ordersAhead("wilshire")) === before, String(await ordersAhead("wilshire")));

  // ——— An order with no counter at all ———
  //
  // joinQueue takes no counter as a default, which is what a caller that has
  // not been updated looks like. It must record rather than throw.
  await joinQueue("bare");
  ok("an order placed with no counter is still recorded",
     (await ordersAheadOf("bare")) !== null, String(await ordersAheadOf("bare")));

  await client.query(`DROP TABLE IF EXISTS ${SCHEMA}.kitchen_queue`);
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
