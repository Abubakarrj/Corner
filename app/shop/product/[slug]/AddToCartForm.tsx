"use client";

import { useState } from "react";
import { useT } from "../../../i18n";
import { useCart } from "../../CartContext";
import {
  defaultOptions,
  formatPrice,
  getProduct,
  optionsComplete,
  unitPriceCents,
  soldOut,
} from "../../products";
import OptionPicker from "../../OptionPicker";
import useOptionPrompt from "../../useOptionPrompt";
import { requestOpenBasket } from "../../openBasket";

// The choices, the stepper, and the reference-style pill button: "ADD TO
// BASKET" on the left, the live total (unit price × quantity, choices
// included) on the right, in one rounded outline pill that fills on hover.
export default function AddToCartForm({ slug }: { slug: string }) {
  const t = useT();
  const { addItem } = useCart();
  const optionPrompt = useOptionPrompt();
  const product = getProduct(slug);
  const [selected, setSelected] = useState(() =>
    product ? defaultOptions(product) : {},
  );
  const [quantity, setQuantity] = useState(1);

  if (!product) return null;

  const gone = soldOut(product.slug);
  const ready = optionsComplete(product, selected) && !gone;
  // What is still missing, if anything — the button says it. See
  // useOptionPrompt: a dead button is not a message.
  const prompt = gone ? null : optionPrompt(product, selected);
  const unit = unitPriceCents(product, selected);

  if (gone) {
    return (
      <div className="rounded-2xl border border-line-soft bg-sun-soft px-4 py-3">
        <p className="m-0 text-[14px] font-medium text-sun-ink">{t("common.soldOutToday")}</p>
        <p className="m-0 mt-1 text-[13px] leading-[1.5] text-sun-ink">
          {t("product.soldOutBody")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <OptionPicker
        product={product}
        selected={selected}
        onChange={setSelected}
        size="full"
        idPrefix={`page-${product.slug}`}
      />

      <div className="flex items-center gap-3">
        <div className="flex shrink-0 items-center rounded-full border border-ink/30">
          <button
            type="button"
            aria-label={t("product.decreaseQty")}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="h-10 w-10 cursor-pointer rounded-full text-[15px] text-ink transition-opacity hover:opacity-60"
          >
            −
          </button>
          <span className="w-7 text-center text-[13px] text-ink">{quantity}</span>
          <button
            type="button"
            aria-label={t("product.increaseQty")}
            onClick={() => setQuantity((q) => Math.min(20, q + 1))}
            className="h-10 w-10 cursor-pointer rounded-full text-[15px] text-ink transition-opacity hover:opacity-60"
          >
            +
          </button>
        </div>

        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            addItem(product.slug, quantity, selected);
            setQuantity(1);
            setSelected(defaultOptions(product));
            // The basket drawer sliding open is the confirmation — no
            // "Added" message needed here.
            requestOpenBasket();
          }}
          className="flex h-10 flex-1 cursor-pointer items-center justify-between rounded-full border border-ink px-4 text-[11px] font-medium uppercase tracking-[0.08em] text-ink transition-colors hover:bg-ink hover:text-on-ink disabled:cursor-default disabled:opacity-[var(--cb-disabled)] disabled:hover:bg-transparent disabled:hover:text-ink"
        >
          <span>{prompt ?? t("shop.addToBasket")}</span>
          <span>{formatPrice(unit * quantity)}</span>
        </button>
      </div>
    </div>
  );
}
