import "server-only";

import { opensAt, type StoreLocation } from "./(marketing)/locations/locations";
import { slotsFor, type Slot } from "./pickupSlots";
import { bookSlot, slotCounts, takenFrom } from "./scheduledPickups";

// The desk that hands out pickup times.
//
// ——— Why this is its own file ———
//
// Two callers ask the same question and must never get two answers: the
// endpoint that shows a time on the checkout before anybody pays, and the
// endpoint that takes the order. If the second one worked out the slot list
// its own way, the screen would show 7:15 and the order would land on 7:25 —
// and the customer would have agreed to a time the shop never held.
//
// So the rules live once. pickupSlots.ts decides which minutes exist,
// scheduledPickups.ts remembers which are sold, and this puts the two
// together for anybody who needs a time.
//
// ——— The seat is taken before the order is confirmed ———
//
// Not afterwards. A slot read, then an order placed, then a booking written
// is three steps with two gaps in it, and both gaps are somewhere a second
// customer can be promised the same minute. claim() below does the reading
// and the taking as one act, and the caller does not tell anybody a time
// until it has come back yes.

/** What a customer can be offered, and what happened when they asked. */
export type Claim =
  /** The time is held. Say it. */
  | { ok: true; at: Date; slots: Date[] }
  /** Every minute between now and tomorrow's close is sold. Rare, real, and
   *  the one honest thing to say when it happens. */
  | { ok: false; reason: "full" }
  /** The asked-for time is not available — either none was asked for, or the
   *  one that was has gone since the screen was drawn. `at` is what the shop
   *  can do instead, for the customer to look at and accept. */
  | { ok: false; reason: "moved"; at: Date; slots: Date[] }
  /** The bookings could not be read. Not the same as "nothing is booked":
   *  see slotCounts. */
  | { ok: false; reason: "unreadable" };

/** How many alternatives to put under the assigned time. Six is two rows of
 *  three on a phone, which is a choice rather than an appointment book. */
export const OFFER_LIMIT = 6;

async function freeSlots(store: StoreLocation, now: Date): Promise<Slot[] | null> {
  let counts: Map<number, number>;
  try {
    counts = await slotCounts(store.id, now);
  } catch {
    // Already logged where it was thrown. Null is "we do not know", which the
    // callers turn into a refusal rather than into an empty morning.
    return null;
  }
  return slotsFor(opensAt(store), now, takenFrom(counts)).filter(
    (slot) => slot.taken < slot.capacity,
  );
}

/** The times to show, without holding any of them.
 *
 *  Read-only on purpose: this runs while somebody is still filling in a card,
 *  and a screen that reserved a seat every time it was drawn would sell out
 *  the morning to people who never ordered. The seat is taken at claim(). */
export async function offered(
  store: StoreLocation,
  now: Date = new Date(),
  limit: number = OFFER_LIMIT,
): Promise<Date[] | null> {
  const free = await freeSlots(store, now);
  return free === null ? null : free.slice(0, limit).map((slot) => slot.at);
}

/** Hold a time for this order.
 *
 *  `wanted` is the time the customer saw and agreed to. Null — a client that
 *  did not ask first — is answered with "moved" rather than with a booking,
 *  because the whole point of scheduling is that the time is on screen before
 *  the payment is. */
export async function claim(
  id: string,
  store: StoreLocation,
  wanted: Date | null,
  now: Date = new Date(),
): Promise<Claim> {
  const free = await freeSlots(store, now);
  if (free === null) return { ok: false, reason: "unreadable" };
  if (free.length === 0) return { ok: false, reason: "full" };

  const shortlist = free.slice(0, OFFER_LIMIT).map((slot) => slot.at);
  const match = wanted
    ? free.find((slot) => slot.at.getTime() === wanted.getTime())
    : undefined;
  if (!match) {
    return { ok: false, reason: "moved", at: free[0].at, slots: shortlist };
  }

  if (await bookSlot(id, store.id, match.at, match.capacity)) {
    return { ok: true, at: match.at, slots: shortlist };
  }

  // Somebody took the last seat between the read above and the insert. Read
  // again rather than guessing at the next minute: by now the answer has
  // moved, and the customer is owed the new one rather than a retry that
  // races the same way.
  const again = await freeSlots(store, now);
  if (again === null) return { ok: false, reason: "unreadable" };
  if (again.length === 0) return { ok: false, reason: "full" };
  return {
    ok: false,
    reason: "moved",
    at: again[0].at,
    slots: again.slice(0, OFFER_LIMIT).map((slot) => slot.at),
  };
}
