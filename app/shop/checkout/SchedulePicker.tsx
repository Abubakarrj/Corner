"use client";

import { useLocale, useT } from "../../i18n";
import { localeById } from "../../localeScript";
import { slotLabel } from "../../shopFacts";
import type { PickupSchedule } from "./usePickupSchedule";

// Choosing when, for an order placed while the counter is shut.
//
// ——— The first one is already chosen ———
//
// Somebody ordering breakfast the night before overwhelmingly wants the
// earliest time they can have it, and making them tap a chip to say so is a
// step that buys nothing. So the soonest slot arrives selected and the row
// underneath is for the person who wants 7:45 instead.
//
// ——— Why the times are chips and not a dropdown ———
//
// A dropdown hides how many there are, and how many there are is the honest
// signal in this whole feature: a morning with six times left looks different
// from a morning with two, at a glance, before anybody opens anything. The
// scarcity is not a sales tactic here — it is the reason the kitchen can keep
// the promise on the chip.
//
// ——— And why it never says "sorry" ———
//
// Three things can go wrong and each gets a plain sentence: the times could
// not be read, every time is sold, or the list is still coming. None of them
// is the customer's doing and none of them reads like an apology, because an
// apology invites somebody to try the same thing again.
export default function SchedulePicker({ schedule }: { schedule: PickupSchedule }) {
  const t = useT();
  const tag = localeById(useLocale()).tag;

  if (schedule.loading) {
    return (
      <p className="m-0 mt-1 text-[13px] leading-[1.5] text-sun-ink">
        {t("checkout.findingTime")}
      </p>
    );
  }

  if (schedule.failed) {
    return (
      <p className="m-0 mt-1 text-[13px] leading-[1.5] text-sun-ink">
        {t("api.scheduleUnavailable")}
      </p>
    );
  }

  if (schedule.slots.length === 0) {
    return (
      <p className="m-0 mt-1 text-[13px] leading-[1.5] text-sun-ink">
        {t("api.scheduleFull")}
      </p>
    );
  }

  return (
    <>
      <p className="m-0 mt-1 text-[13px] leading-[1.5] text-sun-ink">
        {t("checkout.scheduleLead")}
      </p>
      {/* A group, not a list of buttons. A screen reader that reads these one
          at a time gives no clue that picking the second unpicks the first. */}
      <div
        role="group"
        aria-label={t("checkout.pickupTime")}
        className="mt-3 flex flex-wrap gap-2"
      >
        {schedule.slots.map((at) => {
          const active = at === schedule.chosen;
          return (
            <button
              key={at}
              type="button"
              aria-pressed={active}
              onClick={() => schedule.choose(at)}
              className={`cb-press cursor-pointer rounded-full border px-3 py-1.5 text-[13px] tabular-nums transition-colors ${
                active
                  ? "border-primary bg-primary text-on-primary"
                  : "border-line-soft bg-surface text-ink hover:border-line-mute"
              }`}
            >
              {slotLabel(new Date(at), tag)}
            </button>
          );
        })}
      </div>
    </>
  );
}
