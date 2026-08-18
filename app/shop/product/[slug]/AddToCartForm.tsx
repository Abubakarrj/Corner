"use client";

import { useState } from "react";
import { useT } from "../../../i18n";
import { useCart } from "../../CartContext";
import {
  decodeOptions,
  defaultOptions,
  formatPrice,
  getProduct,
  optionsComplete,
  unitPriceCents,
} from "../../products";
import { useSoldOut } from "../../soldOutStore";
import { useFulfillment } from "../../../fulfillment";
import { servesProduct } from "../../storeMenu";
import OptionPicker from "../../OptionPicker";
import useOptionPrompt from "../../useOptionPrompt";
import { requestOpenBasket } from "../../openBasket";
import SuccessCheck from "../../../ui/SuccessCheck";

// The choices, the stepper, and the reference-style pill button: "ADD TO
// BASKET" on the left, the live total (unit price × quantity, choices
// included) on the right, in one rounded outline pill that fills on hover.
export default function AddToCartForm({
  slug,
  initialOptions,
}: {
  slug: string;
  /**
   * What a catalog tile had already answered before linking here. The tile
   * can ask how many but not which flavours, so it answers what it can and
   * hands the rest over rather than making somebody say "a dozen" twice.
   */
  initialOptions?: string;
}) {
  const t = useT();
  const { addItem } = useCart();
  const optionPrompt = useOptionPrompt();
  const product = getProduct(slug);
  const [selected, setSelected] = useState(() =>
    product ? decodeOptions(product, initialOptions) : {},
  );
  const [quantity, setQuantity] = useState(1);
  // The last thing added, by name, so the tick and the label describe the
  // same event. Cleared by the next change to the choices, because a tick
  // still sitting there while somebody picks a different flavour is a tick
  // about an order they have stopped thinking about.
  const [added, setAdded] = useState(false);
  const fulfillment = useFulfillment();
  const at = fulfillment && fulfillment.mode !== "delivery" ? fulfillment.locationId : null;
  const madeHere = product ? servesProduct(at, product) : true;
  // Above the early return: a hook cannot be called conditionally, and this
  // component returns null for an unknown slug.
  const isGone = useSoldOut();

  if (!product) return null;

  // Through the store, like the catalog tile and the cart row. Read straight
  // from products.ts this was the one screen that could not learn an item had
  // gone: the tile you tapped said Sold Out and the page it opened offered to
  // add it, because nothing here was subscribed to anything.
  const gone = isGone(product.slug);
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
        onChange={(next) => {
          setAdded(false);
          setSelected(next);
        }}
        size="full"
        idPrefix={`page-${product.slug}`}
      />

      <div className="flex items-center gap-3">
        <div className="flex shrink-0 items-center rounded-full border border-ink/30">
          <button
            type="button"
            aria-label={t("product.decreaseQty")}
            onClick={() => {
              setAdded(false);
              setQuantity((q) => Math.max(1, q - 1));
            }}
            className="h-10 w-10 cursor-pointer rounded-full text-[15px] text-ink transition-opacity hover:opacity-60"
          >
            −
          </button>
          <span className="w-7 text-center text-[13px] text-ink">{quantity}</span>
          <button
            type="button"
            aria-label={t("product.increaseQty")}
            onClick={() => {
              setAdded(false);
              setQuantity((q) => Math.min(20, q + 1));
            }}
            className="h-10 w-10 cursor-pointer rounded-full text-[15px] text-ink transition-opacity hover:opacity-60"
          >
            +
          </button>
        </div>

        <button
          type="button"
          disabled={!ready || !madeHere}
          onClick={() => {
            addItem(product.slug, quantity, selected);
            setQuantity(1);
            setSelected(defaultOptions(product));
            setAdded(true);
            requestOpenBasket();
          }}
          className="flex h-10 flex-1 cursor-pointer items-center justify-between rounded-full border border-ink px-4 text-[11px] font-medium uppercase tracking-[0.08em] text-ink transition-colors hover:bg-ink hover:text-on-ink disabled:cursor-default disabled:opacity-[var(--cb-disabled)] disabled:hover:bg-transparent disabled:hover:text-ink"
        >
          {/* The tick, on 10-success-check.md.

              The note that used to sit on the click handler said the basket
              drawer sliding open was the confirmation and no message was
              needed here. That is true while the drawer opens — and it is not
              true afterwards. The drawer is dismissed, the page underneath is
              the same page with the same button on it, and there is nothing
              left saying the tap landed. Somebody who is not sure taps again
              and buys two.

              So the button keeps the tick after the drawer has gone, and drops
              it the moment the choices change, because at that point it would
              be describing an order that no longer matches what is on screen. */}
          <span className="flex min-w-0 items-center gap-2">
            <SuccessCheck shown={added} size={15} className="shrink-0" />
            <span className="truncate">{prompt ?? t("shop.addToBasket")}</span>
          </span>
          <span>{formatPrice(unit * quantity)}</span>
        </button>
      </div>

      {/* ——— Why the button is grey ———

          The catalog does not list this item at this counter, so the only way
          to be looking at it is a direct link, a bookmark, or a counter
          changed in another tab. addItem refuses it either way; without this
          line the refusal is a button that does nothing.

          Named as the counter's limit rather than the item's fault: the
          sandwich is perfectly real, and it is one counter away.

          "Not at this counter", not the checkout's "items in your cart" line
          — nothing is in the cart yet, and that is the whole point of the
          button being grey. */}
      {madeHere ? null : (
        <p className="m-0 mt-3 text-[13px] leading-[1.5] text-brand-red">
          {t("cart.notAtCounter")}
        </p>
      )}

    </div>
  );
}
