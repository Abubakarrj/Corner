"use client";

import { useState } from "react";
import { useList, useT } from "../i18n";
import { useMenu } from "../i18n/menu";
import ProductImage from "./ProductImage";
import MixPicker from "./MixPicker";
import useOptionPrompt from "./useOptionPrompt";
import {
  allergensFor,
  applyOption,
  defaultOptions,
  formatPrice,
  optionsComplete,
  packSize,
  unitPriceCents,
  type Product,
  type SelectedOptions,
} from "./products";

// Choosing a sandwich's bagel and spread without leaving the conversation.
//
// The gap this closes: Riley could show you three sandwiches, and the moment
// you wanted one of them the card said "Choose bagel" and threw you out to
// /shop/product/… — out of the panel, out of the thread, and out of the
// conversation you were having about which one to get. Everything else about
// ordering in here works; that one step sent you to the website.
//
// Chips rather than the catalog's <select>. On the product page a native
// picker is the right call — it's the fastest, most accessible control on a
// phone and it appears on every tile in a grid. In a 344px panel there are two
// groups and eleven choices total, they all fit, and seeing them laid out is
// the point: this is a conversation about what to have, so the options should
// be visible rather than hidden behind a control you have to open.
export default function ChatConfigure({
  product,
  onAdd,
  onBack,
}: {
  product: Product;
  onAdd: (options: SelectedOptions, quantity: number) => void;
  onBack: () => void;
}) {
  const t = useT();
  const list = useList();
  const menu = useMenu();
  const optionPrompt = useOptionPrompt();
  const [selected, setSelected] = useState<SelectedOptions>(() => defaultOptions(product));
  const [quantity, setQuantity] = useState(1);

  const ready = optionsComplete(product, selected);
  const unit = unitPriceCents(product, selected);
  const size = packSize(product, selected);
  // The same sentence the product page and the tile use — see
  // useOptionPrompt. In here it matters more, not less: the panel is short,
  // so the picker and the button are often the only two things on screen.
  const prompt = optionPrompt(product, selected);
  // What this configuration carries, as configured. Not possibleAllergens():
  // on this screen a choice has been made, so "contains dairy" can be the
  // truth about the sandwich in front of you rather than about every sandwich
  // it might have been.
  const allergens = allergensFor(product, selected);

  return (
    <div className="flex flex-col gap-4 px-3.5 py-3.5">
      <div className="flex items-center gap-3">
        <ProductImage
          swatch={product.swatch}
          name={menu.name(product)}
          className="h-14 w-14 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[14px] font-medium leading-[1.3] text-ink">
            {menu.name(product)}
          </p>
          <p className="m-0 text-[12px] text-muted">{formatPrice(product.priceCents)}</p>
        </div>
      </div>

      {(product.options ?? []).map((group) => {
        const value = selected[group.id];

        // A pack of more than one gets the box instead of the chips. Same
        // control the item's own page uses, at the panel's size — the whole
        // point of the chat being able to configure things is that it isn't a
        // reduced version of the shop.
        if (group.mix && size > 1) {
          return (
            <MixPicker
              key={group.id}
              group={group}
              value={value}
              total={size}
              size="compact"
              onChange={(next) =>
                setSelected((was) => applyOption(product, was, group.id, next))
              }
            />
          );
        }

        return (
          <fieldset key={group.id} className="m-0 border-0 p-0">
            <legend className="mb-1.5 p-0 text-[11px] uppercase tracking-[0.07em] text-hint">
              {menu.group(group)}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {group.choices.map((choice) => {
                const on = value === choice.id;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setSelected((was) => applyOption(product, was, group.id, choice.id))
                    }
                    className={`cb-press cursor-pointer rounded-full border px-2.5 py-1.5 text-[12px] leading-none transition-colors ${
                      on
                        ? "border-primary bg-primary text-on-primary"
                        : "border-line-soft text-ink hover:border-line-mute"
                    }`}
                  >
                    {menu.choice(group, choice)}
                    {/* The surcharge, and only where it is one. A gift card's
                        amounts *are* the price, so "$50 +$25.00" would read as
                        a fee charged on top of the card. */}
                    {choice.priceCents > 0 && !group.alwaysShow ? (
                      <span className={on ? "opacity-80" : "text-muted"}>
                        {" "}
                        +{formatPrice(choice.priceCents)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      {/* Ingredients, not a safety claim — see the note on Product.allergens.
          It moves as the chips do, which is most of why it's worth having
          here: picking the lox spread makes fish appear on this line. */}
      <p className="m-0 text-[11px] leading-[1.5] text-quiet">
        {allergens.length > 0
          ? t("product.contains", { list: list(allergens.map(menu.allergen)) })
          : t("product.noAllergens")}
      </p>

      <div className="flex items-center gap-2">
        <div className="flex shrink-0 items-center rounded-full border border-line-soft">
          <button
            type="button"
            aria-label={t("product.decreaseQty")}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="h-9 w-9 cursor-pointer rounded-full text-[15px] text-ink transition-opacity hover:opacity-60"
          >
            −
          </button>
          <span className="w-6 text-center text-[13px] tabular-nums text-ink">{quantity}</span>
          <button
            type="button"
            aria-label={t("product.increaseQty")}
            onClick={() => setQuantity((q) => Math.min(20, q + 1))}
            className="h-9 w-9 cursor-pointer rounded-full text-[15px] text-ink transition-opacity hover:opacity-60"
          >
            +
          </button>
        </div>

        <button
          type="button"
          disabled={!ready}
          onClick={() => onAdd(selected, quantity)}
          className="cb-press flex h-9 flex-1 cursor-pointer items-center justify-between rounded-full bg-primary px-4 text-[13px] font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-[var(--cb-disabled)]"
        >
          <span>{prompt ?? t("common.add")}</span>
          <span className="tabular-nums">{formatPrice(unit * quantity)}</span>
        </button>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="cb-press mx-auto cursor-pointer text-[12px] text-muted underline transition-opacity hover:opacity-70"
      >
        {t("chat.backToChat")}
      </button>
    </div>
  );
}
