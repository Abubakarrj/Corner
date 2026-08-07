"use client";

import { useT } from "../i18n";
import { useMenu } from "../i18n/menu";
import { parseMix } from "./bagelMix";
import MixPicker from "./MixPicker";
import {
  applyOption,
  formatPrice,
  packSize,
  type Product,
  type SelectedOptions,
} from "./products";

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
  const t = useT();
  const menu = useMenu();
  const groups = product.options ?? [];
  if (groups.length === 0) return null;

  const compact = size === "compact";
  const field = compact
    ? "h-8 rounded-lg px-2 text-[11px]"
    : "h-11 rounded-xl px-3 text-[14px]";
  const size_ = packSize(product, selected);

  return (
    <div className={compact ? "mt-2.5 flex flex-col gap-1.5" : "flex flex-col gap-3"}>
      {groups.map((group) => {
        const id = `${idPrefix}-${group.id}`;
        const value = selected[group.id] ?? "";

        // The box, when there is a box to fill and room to draw it.
        //
        // Not on the compact size, and that is a decision about where this
        // control belongs rather than a limitation. Compact is a catalog tile
        // in a two-up grid and a row in the basket drawer; six flavour rows
        // with steppers would be taller than the tile it sits in. Adding a
        // dozen of one flavour from a tile stays one tap, which is what a
        // tile is for, and mixing is a thing you go to the item to do.
        if (group.mix && !compact && size_ > 1) {
          return (
            <MixPicker
              key={group.id}
              group={group}
              value={selected[group.id]}
              total={size_}
              onChange={(next) => onChange(applyOption(product, selected, group.id, next))}
            />
          );
        }

        // A mix, in a control that can only hold one answer.
        //
        // This is the basket drawer looking at a box somebody filled on the
        // item's own page. A <select> has no way to say "three plain and three
        // everything", so rather than showing the first flavour and lying, or
        // showing blank and looking broken, the current value gets an option of
        // its own that reads "Mixed" and cannot be re-chosen. Picking a real
        // flavour replaces the mix with a box of that one — which is a real
        // thing to want, is what the control appears to offer, and is undone by
        // going back to the item.
        //
        // The test is "no option can hold this", not "more than one flavour".
        // Those differ on exactly the case worth catching: a pack repaired
        // after a flavour was retired comes back as a single counted entry —
        // "plain*3" in a box of six — which is one flavour and is still not a
        // choice id, so the narrower test would have left a blank select on
        // the one line the basket is already asking about.
        const mixed =
          Boolean(group.mix) &&
          value.length > 0 &&
          !group.choices.some((choice) => choice.id === value) &&
          parseMix(group, value, size_).length > 0;

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
                onChange(applyOption(product, selected, group.id, event.target.value))
              }
              // Named for screen readers even when the visible label is
              // hidden on the compact tiles.
              aria-label={compact ? menu.group(group) : undefined}
              // An unanswered group carries a stronger edge than an answered
              // one, so the thing still being asked for is the thing that
              // stands out.
              //
              // It was ink/45, which is a difference you can measure and not
              // one you can see: against the dark theme's surface it landed
              // close enough to the answered border that both read as the same
              // faint grey line. ink/70 is the same idea at a weight that
              // survives the dark palette.
              className={`w-full cursor-pointer appearance-none border bg-surface text-ink outline-none transition-colors focus:border-ink ${field} ${
                value ? "border-line-soft" : "border-ink/70"
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
              {mixed ? (
                <option value={value} disabled>
                  {t("mix.mixed")}
                </option>
              ) : null}
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
