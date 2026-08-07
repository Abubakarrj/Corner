"use client";

import { useT } from "../i18n";
import { useMenu } from "../i18n/menu";
import { formatMix, mixTotal, parseMix, type MixEntry } from "./bagelMix";
import type { OptionGroup } from "./products";

// Filling a box: how many of each flavour, up to the pack size.
//
// ——— Why a stepper per flavour and not chips ———
//
// Chips answer "which one", and a dozen isn't one. The question here has a
// running total in it — six of twelve chosen, six to go — and a control that
// can only be on or off has nowhere to put that. A row per flavour with a
// count on it is the box, listed.
//
// ——— Why the plus button turns off rather than the box growing ———
//
// The pack size is what was paid for. A dozen means twelve, so the twelfth
// bagel is the last one, and the honest way to say that is a button that stops
// working with "Your box is full" next to it. The alternative — letting the
// count run over and quietly raising the price — is a shop changing the order
// after somebody placed it.
//
// So this never touches the count group. Wanting fourteen is wanting a
// different pack, and that choice is directly above this one.
export default function MixPicker({
  group,
  value,
  total,
  onChange,
  size = "full",
}: {
  group: OptionGroup;
  value: string | undefined;
  /** The pack size. Every count here has to add up to it. */
  total: number;
  onChange: (next: string) => void;
  size?: "full" | "compact";
}) {
  const t = useT();
  const menu = useMenu();

  const entries = parseMix(group, value, total);
  const chosen = mixTotal(entries);
  const left = total - chosen;

  const countOf = (choiceId: string) =>
    entries.find((entry) => entry.choiceId === choiceId)?.count ?? 0;

  function set(choiceId: string, count: number) {
    const next: MixEntry[] = group.choices
      .map((choice) => ({
        choiceId: choice.id,
        count: choice.id === choiceId ? count : countOf(choice.id),
      }))
      .filter((entry) => entry.count > 0);
    onChange(formatMix(group, next, total));
  }

  const compact = size === "compact";
  const row = compact ? "py-1.5 text-[12px]" : "py-2 text-[14px]";
  const step = compact ? "h-7 w-7 text-[14px]" : "h-8 w-8 text-[15px]";

  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="flex w-full items-baseline justify-between p-0">
        <span
          className={`uppercase tracking-[0.08em] text-muted ${
            compact ? "text-[11px]" : "text-[11px]"
          }`}
        >
          {menu.group(group)}
        </span>
        {/* The running total, next to the heading rather than under the rows.
            It is the thing that changes on every tap, so it belongs where the
            eye already is — and it is also the answer to "why is Add off". */}
        <span
          className={`tabular-nums ${compact ? "text-[11px]" : "text-[12px]"} ${
            left === 0 ? "text-muted" : "text-ink"
          }`}
        >
          {t("mix.chosenOf", { chosen: String(chosen), total: String(total) })}
        </span>
      </legend>

      <div className="mt-1.5 flex flex-col divide-y divide-line-soft border-y border-line-soft">
        {group.choices.map((choice) => {
          const count = countOf(choice.id);
          const label = menu.choice(group, choice);
          return (
            <div key={choice.id} className={`flex items-center gap-2 ${row}`}>
              <span className={`min-w-0 flex-1 ${count > 0 ? "text-ink" : "text-muted"}`}>
                {label}
              </span>

              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  disabled={count === 0}
                  aria-label={t("mix.removeOne", { choice: label })}
                  onClick={() => set(choice.id, count - 1)}
                  className={`cb-press cursor-pointer rounded-full text-ink transition-opacity hover:opacity-60 disabled:cursor-default disabled:opacity-20 ${step}`}
                >
                  −
                </button>
                {/* Fixed width, tabular figures: a column of counts that jumps
                    left and right as they cross from one digit to two is a
                    list that looks like it is doing something. */}
                <span
                  className={`w-6 text-center tabular-nums ${
                    count > 0 ? "text-ink" : "text-quiet"
                  }`}
                >
                  {count}
                </span>
                <button
                  type="button"
                  disabled={left === 0}
                  aria-label={t("mix.addOne", { choice: label })}
                  onClick={() => set(choice.id, count + 1)}
                  className={`cb-press cursor-pointer rounded-full text-ink transition-opacity hover:opacity-60 disabled:cursor-default disabled:opacity-20 ${step}`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* What is still needed, in words. The count above says the same thing in
          figures; this is the one that reads as an instruction, and it is what
          somebody looking at a disabled Add button is looking for. */}
      <p
        className={`m-0 mt-1.5 ${compact ? "text-[11px]" : "text-[12px]"} ${
          left === 0 ? "text-muted" : "text-ink"
        }`}
      >
        {left > 0 ? t("mix.pickMore", { count: String(left) }) : t("mix.packFull")}
      </p>
    </fieldset>
  );
}
