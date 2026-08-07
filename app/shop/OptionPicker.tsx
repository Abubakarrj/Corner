"use client";

import { useMenu } from "../i18n/menu";
import { formatPrice, type Product, type SelectedOptions } from "./products";

// The choices an item can't be made without — which bagel, which spread —
// rendered as native selects.
//
// Native rather than a custom dropdown on purpose: this is the control that
// stands between someone and their breakfast, it appears on every sandwich
// tile in a two-up grid, and on a phone the platform picker is faster,
// bigger-thumbed, and more accessible than anything worth rebuilding here.
//
// A group with no default (Bagel) opens on a disabled placeholder, so nobody
// can add a sandwich without saying what it's on. A group with one (Spread,
// which defaults to none) opens on that default, because the board is
// explicit that a sandwich comes without cream cheese unless you add it.
export default function OptionPicker({
  product,
  selected,
  onChange,
  size = "compact",
  idPrefix,
}: {
  product: Product;
  selected: SelectedOptions;
  onChange: (next: SelectedOptions) => void;
  size?: "compact" | "full";
  idPrefix: string;
}) {
  const menu = useMenu();
  const groups = product.options ?? [];
  if (groups.length === 0) return null;

  const compact = size === "compact";
  const field = compact
    ? "h-8 rounded-lg px-2 text-[11px]"
    : "h-11 rounded-xl px-3 text-[14px]";

  return (
    <div className={compact ? "mt-2.5 flex flex-col gap-1.5" : "flex flex-col gap-3"}>
      {groups.map((group) => {
        const id = `${idPrefix}-${group.id}`;
        const value = selected[group.id] ?? "";
        return (
          <div key={group.id}>
            <label
              htmlFor={id}
              className={
                compact
                  ? "sr-only"
                  : "mb-1.5 block text-[11px] uppercase tracking-[0.08em] text-muted"
              }
            >
              {menu.group(group)}
            </label>
            <select
              id={id}
              value={value}
              onChange={(event) =>
                onChange({ ...selected, [group.id]: event.target.value })
              }
              // Named for screen readers even when the visible label is
              // hidden on the compact tiles.
              aria-label={compact ? menu.group(group) : undefined}
              className={`w-full cursor-pointer appearance-none border bg-surface text-ink outline-none transition-colors focus:border-ink ${field} ${
                value ? "border-line-soft" : "border-ink/45"
              }`}
              // The chevron is a background image rather than a sibling
              // element so it can't be clipped by the select's own box on
              // Safari, where appearance:none also removes the native one.
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'><path d='M1 1l4 4 4-4' stroke='%233E4A30' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: `right ${compact ? "8px" : "12px"} center`,
                paddingRight: compact ? "22px" : "30px",
              }}
            >
              {group.defaultChoiceId ? null : (
                <option value="" disabled>
                  {menu.placeholder(group)}
                </option>
              )}
              {group.choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {/* The surcharge is only worth showing when it's an add-on.
                      A gift card's amounts are the price itself, so "$50
                      +$25.00" would read as a fee on top of the card. */}
                  {choice.priceCents > 0 && !group.alwaysShow
                    ? `${menu.choice(group, choice)} +${formatPrice(choice.priceCents)}`
                    : menu.choice(group, choice)}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
