// The desk that hands out pickup times, end to end.
//
// pickupSlots.ts is already covered on its own. What this exercises is the
// part that has state in it: claiming a seat, running out of seats, giving one
// back, and what a shut shop's first hour actually looks like once nine
// overnight orders have been through it.
//
// No database here, so scheduledPickups falls back to seats held in memory.
// That is the weaker of its two modes and the right one to test: if the rules
// hold when the store is a Map, the SQL only has to match the Map.

// ——— Deliberately without a database ———
//
// This suite is about the rules — which minute an order is offered, how the
// ramp spreads a morning, what happens when a slot fills — and those are the
// same rules whichever store is under them. Run against a real Postgres it
// would leave its bookings behind and fail on the second run, which is a test
// that has to be reset by hand and therefore a test nobody runs.
//
// So it forces the in-memory store, which starts empty every time. The
// database half is scheduledPickups.test.ts, which is the only place isolation
// can actually be tested and the only place that needs cleaning up.
//
// Deleted before the first import, because db.ts reads the environment when it
// is asked rather than when it is loaded.
delete process.env.CORNER_DATABASE_URL;
delete process.env.DATABASE_URL;

import { claim, offered } from "../app/pickupSchedule";
import { bookSlot, releaseSlot, slotCounts } from "../app/scheduledPickups";
import { RAMP_CAPACITY, SLOT_CAPACITY } from "../app/pickupSlots";
import { shopClock } from "../app/shopFacts";
import { LOCATIONS, WESTERN } from "../app/(marketing)/locations/locations";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

const wilshire = LOCATIONS.find((l) => l.id === "wilshire")!;
// ⚠️ The exported record, not a lookup in LOCATIONS. The shop paused this
// counter, and it is the only one with an `opensAt` of its own — so the
// non-default opening hour that the whole block below tests would otherwise
// have no record to test against. Pausing a shop must not quietly delete
// coverage of the code that serves it.
const western = WESTERN;

// 2026-08-19 is a Wednesday. Los Angeles is UTC-7 in August.
const la = (hour: number, minute = 0) => new Date(Date.UTC(2026, 7, 19, hour + 7, minute));
const hhmm = (d: Date) => {
  const { hour, minute } = shopClock(d);
  return `${hour}:${String(minute).padStart(2, "0")}`;
};

async function main() {
  // ——— The overnight rush, through the real claim path ———
  //
  // Nine people order at 4am. This is the Starbucks failure in miniature: the
  // wrong answer is nine tickets on 7:15, and it is the answer every
  // implementation that forgets the capacity gives.
  const gave: string[] = [];
  for (let i = 0; i < 9; i += 1) {
    const times = await offered(wilshire, la(4));
    const first = await claim(`order-${i}`, wilshire, times![0] ?? null, la(4));
    ok(`order ${i} got a time`, first.ok === true, JSON.stringify(first));
    if (first.ok) gave.push(hhmm(first.at));
  }
  console.log("  overnight spread:", gave.join(" "));
  ok(
    "the ramp holds two per slot for the first half hour",
    gave.slice(0, 6).join(" ") === "7:15 7:15 7:25 7:25 7:35 7:35",
    gave.join(" "),
  );
  // 7:35 starts thirty-five minutes after the door, which is past the ramp,
  // so it holds four where 7:15 and 7:25 held two. That step from two to four
  // in the middle of the list is the ramp doing its job, and it is what a flat
  // capacity would erase.
  ok(
    "and four per slot once the counter is running",
    gave.slice(4).join(" ") === "7:35 7:35 7:35 7:35 7:45",
    gave.slice(4).join(" "),
  );
  ok("nobody was told a time twice over capacity", new Set(gave).size === 4, gave.join(" "));

  // ——— A retry is not a second booking ———
  //
  // At the claim() level this cannot arise: a full slot is not in the free
  // list, so an order already holding 7:15 is answered "moved" like anybody
  // else asking for it. Identity is bookSlot's job, and that is where it is
  // checked — against the slot the order actually holds, with the slot full,
  // which is the only shape a retry can have.
  const earliest = [...(await slotCounts("wilshire", la(4))).keys()].sort((a, b) => a - b)[0];
  const retry = await bookSlot("order-0", "wilshire", new Date(earliest), RAMP_CAPACITY);
  ok("an order re-booking the seat it holds is a yes", retry === true, String(retry));
  const counts = await slotCounts("wilshire", la(4));
  const at715 = [...counts.entries()].sort((a, b) => a[0] - b[0])[0];
  ok("and did not add a third seat to a slot of two", at715[1] === RAMP_CAPACITY, String(at715[1]));
  // A stranger asking for the same full slot is refused, which is what makes
  // the yes above about identity rather than about the slot being lax.
  ok(
    "while a different order is refused the same seat",
    (await bookSlot("order-new", "wilshire", new Date(earliest), RAMP_CAPACITY)) === false,
  );

  // ——— A time nobody offered ———
  //
  // 7:20 is not on the grid and 6:00 is before the door opens. Neither one is
  // a minute the kitchen ever agreed to, however plausible the request looks.
  const offGrid = await claim("order-x", wilshire, la(7, 20), la(4));
  ok("an off-grid minute is refused", offGrid.ok === false, JSON.stringify(offGrid));
  ok(
    "and answered with one that is on it",
    offGrid.ok === false && offGrid.reason === "moved" && hhmm(offGrid.at) === "7:45",
    JSON.stringify(offGrid),
  );

  // ——— No time asked for ———
  //
  // A client that posts an order without a slot is told one rather than given
  // one. The whole point is that the time is read before it is paid for.
  const silent = await claim("order-y", wilshire, null, la(4));
  ok(
    "an order with no time chosen is answered, not booked",
    silent.ok === false && silent.reason === "moved",
    JSON.stringify(silent),
  );
  const afterSilent = await slotCounts("wilshire", la(4));
  const seated = [...afterSilent.values()].reduce((a, b) => a + b, 0);
  ok("and took no seat while being refused", seated === 9, String(seated));

  // ——— Giving a seat back ———
  await releaseSlot("order-0");
  const freed = await slotCounts("wilshire", la(4));
  const first715 = [...freed.entries()].sort((a, b) => a[0] - b[0])[0];
  ok("a released order frees its seat", first715[1] === RAMP_CAPACITY - 1, String(first715[1]));
  const reclaimed = await claim("order-z", wilshire, first715 ? new Date(first715[0]) : null, la(4));
  ok("which the next order can take", reclaimed.ok === true, JSON.stringify(reclaimed));

  // ——— The outlet keeps its own hours and its own seats ———
  const outletTimes = await offered(western, la(4));
  ok("the outlet's first time is 11:15, not 7:15", hhmm(new Date(outletTimes![0])) === "11:15",
     hhmm(new Date(outletTimes![0])));
  const outletCounts = await slotCounts("western", la(4));
  ok("and its morning is untouched by Wilshire's", outletCounts.size === 0, String(outletCounts.size));

  // ——— A full slot at full rate ———
  //
  // Four in one slot, then the fifth moves on. Checked away from the ramp so
  // it is SLOT_CAPACITY being enforced rather than RAMP_CAPACITY.
  const noon = la(12);
  const slot = (await offered(wilshire, noon))![0];
  for (let i = 0; i < SLOT_CAPACITY; i += 1) {
    const taken = await claim(`noon-${i}`, wilshire, slot, noon);
    ok(`noon seat ${i} taken`, taken.ok === true, JSON.stringify(taken));
  }
  const fifth = await claim("noon-4", wilshire, slot, noon);
  ok(
    "the fifth order at a full slot is moved on",
    fifth.ok === false && fifth.reason === "moved" && fifth.at.getTime() > slot.getTime(),
    JSON.stringify(fifth),
  );

  // ——— bookSlot is the hard limit, not a hint ———
  const solo = new Date(la(14).getTime());
  ok("a seat is taken", (await bookSlot("s1", "test", solo, 1)) === true);
  ok("and the next one is refused", (await bookSlot("s2", "test", solo, 1)) === false);
  ok("while the same id is idempotent", (await bookSlot("s1", "test", solo, 1)) === true);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
