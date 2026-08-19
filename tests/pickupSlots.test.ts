// Scheduling a pickup for later.
//
// The interesting assertions are the ones about a busy morning: what happens
// when more people want 7:15 than 7:15 can hold. That is the whole reason the
// file exists, and a version of it that quietly overbooks would pass every
// test about a quiet Tuesday.

import {
  RAMP_CAPACITY,
  SLOT_CAPACITY,
  SLOT_MINUTES,
  capacityAt,
  firstFreeSlot,
  isSlotBoundary,
  offerableSlots,
  slotsFor,
} from "../app/pickupSlots";
import { PREP_MINUTES, shopClock } from "../app/shopFacts";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

// Los Angeles is UTC-7 in August. 2026-08-19 is a Wednesday.
const la = (hour: number, minute = 0) => new Date(Date.UTC(2026, 7, 19, hour + 7, minute));
const clock = (d: Date) => {
  const { hour, minute } = shopClock(d);
  return `${hour}:${String(minute).padStart(2, "0")}`;
};
const empty = () => 0;

// ——— 4am: shut, and the first slot is after the warm-up ———
{
  const slot = firstFreeSlot(7, la(4), empty);
  ok("a 4am order is scheduled, not refused", slot !== null);
  ok("for 7:15, not 7:00", clock(slot!.at) === "7:15", clock(slot!.at));
  ok("and that slot runs at the ramp rate", slot!.capacity === RAMP_CAPACITY,
     String(slot!.capacity));
}

// ——— The ramp ———
{
  ok("the first half hour is half rate", capacityAt(0) === RAMP_CAPACITY);
  ok("29 minutes in, still ramping", capacityAt(29) === RAMP_CAPACITY);
  ok("30 minutes in, full rate", capacityAt(30) === SLOT_CAPACITY);
}

// ——— A busy morning: the thing this exists to stop ———
{
  // Everybody wants the first slot. Fill it and watch where the next go.
  const booked = new Map<number, number>();
  const taken = (at: Date) => booked.get(at.getTime()) ?? 0;
  const book = (at: Date) => booked.set(at.getTime(), taken(at) + 1);

  const given: string[] = [];
  for (let i = 0; i < 9; i += 1) {
    const slot = firstFreeSlot(7, la(4), taken);
    if (!slot) break;
    given.push(clock(slot.at));
    book(slot.at);
  }

  ok("nine overnight orders are spread, not stacked",
     new Set(given).size > 1, given.join(" "));
  ok("the first two take 7:15", given[0] === "7:15" && given[1] === "7:15", given.join(" "));
  ok("the third is pushed to 7:25", given[2] === "7:25", given.join(" "));
  ok("no slot is oversold",
     [...booked.entries()].every(([, count]) => count <= SLOT_CAPACITY),
     JSON.stringify(given));
  // The ramp is visible in the shape. Compared against the first full-rate
  // slot rather than the last one used: the last slot only holds what was
  // left over, so it says more about how many orders the test made than about
  // capacity.
  const at = (time: string) => given.filter((g) => g === time).length;
  ok("the ramp slots take two each", at("7:15") === RAMP_CAPACITY && at("7:25") === RAMP_CAPACITY,
     given.join(" "));
  ok("and the first full-rate slot takes four", at("7:35") === SLOT_CAPACITY, given.join(" "));
  console.log("      nine orders landed at:", given.join(", "));
}

// ——— While open, it is just "later today" ———
{
  const slot = firstFreeSlot(7, la(9, 3), empty);
  ok("a 9:03 order is not offered a time before the kitchen could make it",
     slot!.at.getTime() >= la(9, 3).getTime() + PREP_MINUTES * 60_000,
     clock(slot!.at));
  ok("and it is on the grid", isSlotBoundary(slot!.at, 7), clock(slot!.at));
}

// ——— The outlet opens at 11, so its first slot is 11:15 ———
{
  const slot = firstFreeSlot(11, la(4), empty);
  ok("the outlet's first slot is 11:15", clock(slot!.at) === "11:15", clock(slot!.at));
  ok("the store's is 7:15 at the same moment", clock(firstFreeSlot(7, la(4), empty)!.at) === "7:15");
}

// ——— Nothing after close ———
{
  const all = slotsFor(7, la(4), empty);
  const today = all.filter((s) => s.at.getTime() < la(24).getTime());
  ok("no slot at or after 4pm",
     today.every((s) => shopClock(s.at).hour < 16), clock(today[today.length - 1].at));
  ok("the last one is 3:55", clock(today[today.length - 1].at) === "15:55",
     clock(today[today.length - 1].at));
}

// ——— A 4pm order rolls to tomorrow rather than failing ———
{
  const slot = firstFreeSlot(7, la(16, 30), empty);
  ok("an order after close gets tomorrow morning", slot !== null);
  ok("at 7:15 tomorrow", clock(slot!.at) === "7:15", clock(slot!.at));
  ok("and it really is the next day",
     slot!.at.getTime() > la(16, 30).getTime(), slot!.at.toISOString());
}

// ——— A full day says so rather than overbooking ———
{
  const slot = firstFreeSlot(7, la(4), () => SLOT_CAPACITY);
  ok("every slot full returns nothing", slot === null, JSON.stringify(slot));
}

// ——— The grid guard ———
{
  ok("7:15 is on the grid", isSlotBoundary(la(7, 15), 7));
  ok("7:20 is not", !isSlotBoundary(la(7, 20), 7));
  ok("7:25 is", isSlotBoundary(la(7, 25), 7));
  ok("6:55 is not, it is before opening", !isSlotBoundary(la(6, 55), 7));
  ok("4pm is not, it is closing", !isSlotBoundary(la(16), 7));
}

// ——— The short list somebody chooses from ———
{
  const offers = offerableSlots(7, la(4), empty, 4);
  ok("offers four times", offers.length === 4, String(offers.length));
  ok("starting at the first free one", clock(offers[0].at) === "7:15");
  ok("ten minutes apart",
     offers[1].at.getTime() - offers[0].at.getTime() === SLOT_MINUTES * 60_000);
}

console.log(`\n${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
