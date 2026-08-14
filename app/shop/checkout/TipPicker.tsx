"use client";

import { useState } from "react";
import { useT } from "../../i18n";
import { formatPrice } from "../products";
import { TIP_PRESETS, tipFor } from "../money";

// The tip row: three presets showing what each comes to, a way to type your
// own, and a way to leave nothing.
//
// "No tip" is a visible button rather than a hidden option behind "custom".
// A checkout that makes declining the awkward path is a checkout that's
// pressuring people, and the counter doesn't do that.
export default function TipPicker({
  subtotalCents,
  tipCents,
  onTip,
}: {
  subtotalCents: number;
  tipCents: number;
  onTip: (cents: number) => void;
}) {
  const t = useT();
  const [custom, setCustom] = useState("");
  const [customOpen, setCustomOpen] = useState(false);

  // Which preset, if any, the current amount corresponds to — derived rather
  // than stored, so the selection can't drift out of step with the number the
  // order is actually carrying.
  const activePreset = TIP_PRESETS.find(
    (rate) => tipFor(subtotalCents, rate) === tipCents && tipCents > 0,
  );

  function applyCustom(raw: string) {
    setCustom(raw);
    const dollars = Number.parseFloat(raw);
    // NaN and negatives both mean "nothing valid typed yet", which is a zero
    // tip rather than an error — the field is optional.
    onTip(Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : 0);
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {TIP_PRESETS.map((rate) => {
          const cents = tipFor(subtotalCents, rate);
          const active = activePreset === rate;
          return (
            <button
              key={rate}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setCustomOpen(false);
                setCustom("");
                onTip(cents);
              }}
              // text-ink on the inactive state is load-bearing and was missing:
              // without it the percentage inherited whatever colour the
              // surrounding page happened to set, which on the chat panel's
              // dark ground made "22%" invisible while the dollar amount under
              // it (which does set a colour) stayed readable.
              //
              // The active state is primary/on-primary rather than ink/on-ink,
              // so a chosen tip is olive in the app and blue in the chat, like
              // every other primary action.
              className={`cb-press cursor-pointer rounded-xl border px-2 py-3 text-center transition-colors ${
                active
                  ? "border-primary bg-primary text-on-primary"
                  : "border-line-soft bg-surface text-ink hover:border-line-mute"
              }`}
            >
              <span className="block text-[15px] font-medium">
                {Math.round(rate * 100)}%
              </span>
              <span className={`mt-0.5 block text-[12px] ${active ? "opacity-80" : "text-muted"}`}>
                {formatPrice(cents)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => setCustomOpen((was) => !was)}
          aria-expanded={customOpen}
          className="cb-press flex-1 cursor-pointer rounded-xl border border-line-soft bg-surface px-3 py-2.5 text-[13px] text-ink transition-colors hover:border-line-mute"
        >
          {t("checkout.enterCustomTip")}
        </button>
        <button
          type="button"
          onClick={() => {
            setCustomOpen(false);
            setCustom("");
            onTip(0);
          }}
          aria-pressed={tipCents === 0}
          className={`cb-press cursor-pointer rounded-xl border px-4 py-2.5 text-[13px] transition-colors ${
            tipCents === 0
              ? "border-primary bg-primary text-on-primary"
              : "border-line-soft bg-surface text-ink hover:border-line-mute"
          }`}
        >
          {t("checkout.noTip")}
        </button>
      </div>

      {/* t-acc, from 21-accordion.md — the panel half of it. There is no
          chevron here: the trigger is the Custom button above, which is
          already lit when the field is open, so a second indicator would be
          two controls reporting one state.

          Kept mounted so the close animates, with `inert` keeping the field
          out of the tab order while it is collapsed. */}
      <div className="t-acc" data-open={customOpen}>
        <div className="t-acc-panel">
          <div className="t-acc-panel-inner">
            <div
              inert={!customOpen}
              className="mt-2 flex items-center gap-2 rounded-xl border border-line-soft bg-surface px-4 py-3 focus-within:border-ink"
            >
              <span className="text-[15px] text-muted">$</span>
              <input
                type="text"
                inputMode="decimal"
                aria-label={t("checkout.customTipAmount")}
                placeholder="0.00"
                value={custom}
                onChange={(event) => applyCustom(event.target.value)}
                className="w-full min-w-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-quieter"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
