"use client";

import { useCallback, useEffect, useState } from "react";

// The times this counter can still promise, on the checkout.
//
// ——— Why the browser asks rather than works it out ———
//
// It knows the hours and it can read a clock, so it could draw the grid
// itself. What it cannot know is which minutes are already sold, and that is
// the whole feature: an app that offers 7:15 to everyone who asks has built
// the wall of tickets it was supposed to prevent, in CSS.
//
// ——— Asking holds nothing ———
//
// /api/pickup-slots is read-only. Somebody who opens the checkout, looks at
// the time and closes the tab has taken nothing from the morning. The seat is
// claimed by the order itself, which is also the only moment the time becomes
// a promise — see claim() in app/pickupSchedule.ts.
//
// So the list here can go stale, and does: between reading it and paying,
// somebody else can take the last seat at 7:15. That is not a bug to design
// out, it is a race the server settles — it refuses the order with the next
// available time attached, and correct() below puts that on screen.

export type PickupSchedule = {
  /** What can be offered, as ISO strings, soonest first. */
  slots: string[];
  /** The one this order is for. Null until the list arrives. */
  chosen: string | null;
  choose: (at: string) => void;
  /** Still asking. */
  loading: boolean;
  /** Asked, and could not be told. Distinct from an empty list, which is the
   *  much rarer and much worse "every slot is sold". */
  failed: boolean;
  /** Replace the list with the one a refused order came back with, and move
   *  to the time it offered. */
  correct: (at: string, slots: string[]) => void;
};

type Answer = { forCounter: string; slots: string[] } | { forCounter: string; failed: true };

export function usePickupSchedule(
  locationId: string | null,
  /** Whether a time is needed at all — a pickup at a shut counter. An open
   *  one is not scheduled and must not ask, or every order all day would be
   *  taking a seat out of tomorrow morning. */
  needed: boolean,
): PickupSchedule {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    if (!needed || !locationId) return;
    const counter = locationId;
    let live = true;
    void (async () => {
      try {
        const response = await fetch(
          `/api/pickup-slots?locationId=${encodeURIComponent(counter)}`,
          { cache: "no-store" },
        );
        const body = (await response.json().catch(() => null)) as {
          slots?: unknown;
        } | null;
        if (!live) return;
        if (!response.ok || !Array.isArray(body?.slots)) {
          setAnswer({ forCounter: counter, failed: true });
          return;
        }
        const slots = (body.slots as unknown[]).filter(
          (value): value is string => typeof value === "string",
        );
        setAnswer({ forCounter: counter, slots });
        // The soonest, by default. Somebody scheduling breakfast overwhelmingly
        // wants the first time they can have it, and making them tap a chip to
        // say so is a step for nothing.
        setChosen((current) => (current && slots.includes(current) ? current : (slots[0] ?? null)));
      } catch {
        if (live) setAnswer({ forCounter: counter, failed: true });
      }
    })();
    return () => {
      live = false;
    };
    // The counter is the only input. An open counter needs no times, and
    // re-asking on every render of the checkout would be a request per
    // keystroke in the card form.
  }, [locationId, needed]);

  const correct = useCallback(
    (at: string, slots: string[]) => {
      // The server's list wins outright. It was read after ours and it is the
      // one the next attempt will be checked against.
      setAnswer({
        forCounter: locationId ?? "",
        slots: slots.length > 0 ? slots : [at],
      });
      setChosen(at);
    },
    [locationId],
  );

  const choose = useCallback((at: string) => setChosen(at), []);

  // Only an answer about the counter currently chosen counts. Switching from
  // Wilshire to the outlet mid-checkout must not leave 7:15 on screen for a
  // counter that opens at 11.
  const mine = answer && answer.forCounter === locationId ? answer : null;

  return {
    slots: mine && "slots" in mine ? mine.slots : [],
    chosen: mine && "slots" in mine ? chosen : null,
    choose,
    loading: needed && Boolean(locationId) && mine === null,
    failed: mine !== null && "failed" in mine,
    correct,
  };
}
