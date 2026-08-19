import {
  CLOSE_HOUR,
  OPEN_DAYS,
  OPEN_HOUR,
  PREP_MINUTES,
  shopClock,
  shopInstant,
} from "./shopFacts";

// Scheduling a pickup for later, without ruining the morning.
//
// ——— The problem this is shaped around ———
//
// The obvious way to accept orders while shut is to take them and hand them
// all to the kitchen at opening. That is the failure everybody has seen: a
// wall of tickets lands at 7:00, the counter spends the first hour serving a
// backlog placed overnight, the people who walked in queue behind orders from
// customers who are not in the room yet, and the food made first is cold by
// the time its owner arrives. The order was accepted, the promise was kept on
// paper, and every single person involved had a worse morning.
//
// Nothing about that is caused by scheduling. It is caused by scheduling
// *without a limit*: the shop sold more of 7:00 than 7:00 exists.
//
// So this hands out time rather than accepting orders. The day is cut into
// slots, each slot can hold a fixed number of orders, and an order takes the
// first slot with room in it. When the early slots fill, later ones are what
// is left — which is the app telling the truth about a busy morning instead of
// promising nine people the same minute.
//
// ——— Why the first slots are smaller ———
//
// A flat capacity would still let a full slot's worth of overnight orders land
// at the first bookable minute, which is the worst minute of the day to be
// handed a stack: the ovens have just come up, the counter is one person, and
// nothing is prepped ahead because nothing has been made yet.
//
// So capacity ramps. The first half hour after opening runs at half rate, and
// the shop reaches its normal throughput once it is actually running. This is
// the "adds time" part, and it adds it exactly where a kitchen needs it rather
// than as a flat penalty on everybody.
//
// ——— And why it never promises the very first minute ———
//
// Opening time is when the door unlocks, not when the first bagel is out.
// WARM_UP_MINUTES is the gap between those two. Somebody told "ready at 7:00"
// arrives at 7:00 to a counter that is still turning the lights on, which is
// the same broken promise as a late order, made in the other direction.

/** How finely the day is cut. Ten minutes is the resolution the copy is
 *  written at ("7:20") and small enough that a full slot pushes an order a few
 *  minutes rather than half an hour. */
export const SLOT_MINUTES = 10;

/** Orders one counter will commit to inside one slot, once it is running.
 *
 *  This is the whole safety valve, and it is deliberately a number somebody
 *  can argue with rather than a formula nobody can. Four orders per ten
 *  minutes is twenty-four an hour, which is a busy but survivable counter for
 *  the kind of food this shop makes. If mornings still feel bad, this is the
 *  number to lower — lowering it does not reject anybody, it just spreads them
 *  further out and tells them so before they pay. */
export const SLOT_CAPACITY = 4;

/** Half rate for the first half hour, then full.
 *
 *  Both halves matter. Ramping only the very first slot leaves the second one
 *  taking a full load off a counter that is three minutes old; ramping for an
 *  hour would push a genuinely quiet Tuesday's orders out for no reason. */
export const RAMP_MINUTES = 30;
export const RAMP_CAPACITY = 2;

/** The gap between the door unlocking and the first slot. */
export const WARM_UP_MINUTES = 15;

/** How far ahead somebody can book. One day: this is a bagel, not a table. */
export const HORIZON_HOURS = 24;

/** A bookable moment, and how much of it is already sold. */
export type Slot = {
  /** When the food is promised, as an instant. */
  at: Date;
  /** Orders already committed to it. */
  taken: number;
  /** What it holds — smaller during the ramp. */
  capacity: number;
};

// The shop's wall clock, not the runtime's. setHours here would be right on a
// laptop in Los Angeles and eight hours wrong on every server this deploys to
// — see shopInstant in shopFacts.ts.
const atMinute = (day: Date, hour: number, minute: number) => shopInstant(day, hour, minute);

/** Slot capacity, by how long the counter has been open when it starts. */
export function capacityAt(minutesOpen: number): number {
  return minutesOpen < RAMP_MINUTES ? RAMP_CAPACITY : SLOT_CAPACITY;
}

/** Every slot a counter could offer between `now` and the horizon.
 *
 *  Local time throughout, from shopClock, because a shop's day is a wall
 *  clock and the visitor may be in another zone entirely — somebody ordering
 *  from a hotel in Seoul for a friend in Koreatown must not be offered 7 AM
 *  their time.
 *
 *  `taken` comes from the caller. This module does no I/O and knows nothing
 *  about where bookings are kept, which is what makes the rules testable
 *  without a database. */
export function slotsFor(
  opensAt: number,
  now: Date,
  taken: (at: Date) => number,
): Slot[] {
  const slots: Slot[] = [];
  // Not before the kitchen could make it even if it were open now. A shop
  // that is open still schedules through here — "later today" is the same
  // question — and an order placed at 9:58 for 10:00 is one nobody can make.
  const earliest = new Date(now.getTime() + PREP_MINUTES * 60_000);
  const horizon = new Date(now.getTime() + HORIZON_HOURS * 3_600_000);

  // Walk today and tomorrow. Two days is all the horizon can reach, and a
  // loop over calendar days is what keeps this correct across midnight
  // without arithmetic on hours-since-epoch.
  for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
    // Stepping a day, not naming one: shopInstant below anchors it to the
    // shop's calendar, so this only has to land somewhere inside tomorrow.
    const day = new Date(now.getTime() + dayOffset * 86_400_000);
    const { day: weekday } = shopClock(day);
    if (!isOpenDay(weekday)) continue;

    const first = atMinute(day, opensAt, WARM_UP_MINUTES);
    const last = atMinute(day, CLOSE_HOUR, 0);

    for (let at = first; at < last; at = new Date(at.getTime() + SLOT_MINUTES * 60_000)) {
      if (at < earliest) continue;
      if (at > horizon) return slots;
      const minutesOpen = (at.getTime() - atMinute(day, opensAt, 0).getTime()) / 60_000;
      slots.push({ at, taken: taken(at), capacity: capacityAt(minutesOpen) });
    }
  }
  return slots;
}

// Every day, today. Kept as a function, and reading OPEN_DAYS rather than
// returning true, so the day this shop closes on Mondays is a change to one
// list in shopFacts rather than a rewrite of the loop above.
function isOpenDay(weekday: number): boolean {
  return OPEN_DAYS.includes(weekday);
}

/** The slot an order placed now would be given, or null when the horizon
 *  holds nothing — every slot between here and tomorrow's close is full.
 *
 *  Null is a real answer and the endpoint has to say it rather than round it
 *  down to "sorry, try again". A shop that has genuinely sold every slot for a
 *  day should say so; it is a much better problem than the alternative, and
 *  the alternative is what this file exists to prevent. */
export function firstFreeSlot(
  opensAt: number,
  now: Date,
  taken: (at: Date) => number,
): Slot | null {
  return slotsFor(opensAt, now, taken).find((slot) => slot.taken < slot.capacity) ?? null;
}

/** The slots to offer somebody who would rather choose than be assigned.
 *
 *  The first free one is what they get by default; this is the short list
 *  under it. Capped, because a scrolling list of ninety times is a worse
 *  screen than four buttons — somebody scheduling a bagel wants "soon", "a
 *  bit later" or "much later", not an appointment book. */
export function offerableSlots(
  opensAt: number,
  now: Date,
  taken: (at: Date) => number,
  limit = 6,
): Slot[] {
  return slotsFor(opensAt, now, taken)
    .filter((slot) => slot.taken < slot.capacity)
    .slice(0, limit);
}

/** Whether an instant is a slot boundary this counter could have offered.
 *
 *  The endpoint's guard against a chosen time that never appeared on anybody's
 *  screen: a request can name any timestamp it likes, and one that is not on
 *  the grid is one the kitchen never agreed to. */
export function isSlotBoundary(at: Date, opensAt: number): boolean {
  const { hour, minute } = shopClock(at);
  if (hour < opensAt || hour >= CLOSE_HOUR) return false;
  const sinceFirst = (hour - opensAt) * 60 + minute - WARM_UP_MINUTES;
  return sinceFirst >= 0 && sinceFirst % SLOT_MINUTES === 0;
}

/** The default opening hour, re-exported so callers scheduling for "the shop"
 *  rather than a named counter do not have to reach into shopFacts for it. */
export { OPEN_HOUR };
