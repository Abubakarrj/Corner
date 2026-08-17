"use client";

import Link from "next/link";
import { useT } from "../i18n";
import { useMenu } from "../i18n/menu";
import { useState } from "react";
import {
  defaultOptions,
  encodeOptions,
  formatPrice,
  optionsComplete,
  packSize,
  unitPriceCents,
  type Product,
} from "./products";
import { useSoldOut } from "./soldOutStore";
import ProductImage from "./ProductImage";
import OptionPicker from "./OptionPicker";
import useOptionPrompt from "./useOptionPrompt";
import { useCart } from "./CartContext";
import { requestOpenBasket } from "./openBasket";
import { DISPLAY_FONT } from "./shopControls";

// Card layout follows the reference (Flamingo Estate's "Summer Favorites"
// cards): rounded tile with a merchandising pill in its top-left corner,
// display-face product name, short description, and a full-width rounded-pill
// button with "ADD TO BASKET" on the left and the price on the right.
//
// h-full + mt-auto on the button is what keeps every CTA in a grid row on
// the same baseline — without it, a one-line description sits its button
// higher than a two-line neighbour's and the row reads ragged.
//
// Links are /shop-rooted, not /-rooted — see the note in ShopHeader.tsx.

// The pill at the foot of a tile. Extracted because it is now sometimes a
// <button> and sometimes a <Link>, and two copies of a class list this long
// is how the two of them end up different heights.
// min-h rather than h: at 10px uppercase with this tracking, a label one
// character longer than "Add to basket" wraps on a tile in the two-up grid,
// and a fixed height meant the second line hung out of the pill. Every
// language has a label that will be longer than English's somewhere, so the
// pill grows instead of relying on nobody ever exceeding thirteen characters.
const TILE_BUTTON =
  "cb-press mt-3 flex min-h-9 shrink-0 cursor-pointer items-center justify-between gap-2 " +
  "rounded-full border px-3.5 py-1.5 text-[10px] font-medium uppercase leading-tight tracking-[0.09em]";

export default function ProductCard({ product }: { product: Product }) {
  const t = useT();
  const menu = useMenu();
  const optionPrompt = useOptionPrompt();
  const { addItem } = useCart();
  // The choices ride on the tile rather than sending people to the product
  // page for them: a bagel order is a handful of small decisions made fast,
  // and a round trip per sandwich would be the slowest part of it.
  const [selected, setSelected] = useState(() => defaultOptions(product));
  // Through the store rather than the bare function: the list is refreshed
  // from /api/sold-out while the tab is open, and this is what makes a tile
  // notice. See soldOutStore.ts.
  const isGone = useSoldOut();
  const gone = isGone(product.slug);
  const ready = optionsComplete(product, selected) && !gone;
  // The tile's button says what's missing rather than just going dim — the
  // same sentence the product page uses. See useOptionPrompt.
  const prompt = gone ? null : optionPrompt(product, selected);
  const price = unitPriceCents(product, selected);

  // ——— A pack is not a tile-sized question ———
  //
  // Choosing "Dozen Bagels" here used to leave a single-flavour dropdown
  // underneath it, and that is how somebody ends up with twelve poppy bagels
  // having never learnt the box could be mixed. The tile was quietly offering
  // the worse of the two things it could sell.
  //
  // So once the pack is bigger than one, the tile stops pretending it can ask.
  // The flavour group is hidden and the button becomes a link to the item's
  // own page, which has room for the stepper list. One bagel still adds from
  // here in one tap, because one bagel really is one question.
  //
  // The count travels in the URL. Landing on the product page reset to
  // "Single Bagel" would make the hand-off worse than the dead end it
  // replaces — you would answer "a dozen" twice. See encodeOptions.
  const mixGroup = (product.options ?? []).find((group) => group.mix);
  const packed = Boolean(mixGroup) && packSize(product, selected) > 1;

  // Some things in the catalog aren't sold through this basket at all — a gift
  // card is not food and cannot ride in a food order. Same hand-off shape as a
  // pack, one step earlier: no options, no price, just the way out. See
  // Offsite in products.ts.
  const offsite = product.offsite;
  const configureHref =
    `/shop/product/${product.slug}?options=` +
    encodeURIComponent(encodeOptions(selected));

  return (
    <div
      className="group flex h-full flex-col"
    >
      <Link
        href={`/shop/product/${product.slug}`}
        className="relative cursor-pointer overflow-hidden rounded-2xl"
      >
        <ProductImage
          swatch={product.swatch}
          category={product.category}
          name={menu.name(product)}
          className="aspect-square w-full transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
        {gone ? (
          <span className="absolute inset-x-0 bottom-0 bg-ink/80 py-1.5 text-center text-[10px] font-medium uppercase tracking-[0.09em] text-on-ink">
            {t("common.soldOutToday")}
          </span>
        ) : null}
        {product.tag ? (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-sun px-2 py-[3px] text-[9px] font-medium uppercase tracking-[0.06em] text-sun-ink">
            {product.tag}
          </span>
        ) : null}
      </Link>

      {/* Grows to absorb the difference between a one-line and a two-line
          description, so the buttons below stay on a common baseline while
          keeping a guaranteed gap above them. */}
      <div className="flex flex-1 flex-col">
        <Link
          href={`/shop/product/${product.slug}`}
          className="mt-3.5 cursor-pointer text-[15px] leading-[1.3] text-ink transition-opacity hover:opacity-70"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          {menu.name(product)}
        </Link>
        <p className="mt-1.5 line-clamp-2 text-[12px] leading-[1.5] text-faint">
          {menu.description(product)}
        </p>
      </div>

      {gone || offsite ? null : (
        <OptionPicker
          product={product}
          selected={selected}
          onChange={setSelected}
          idPrefix={`card-${product.slug}`}
          hiddenGroupIds={packed && mixGroup ? [mixGroup.id] : undefined}
        />
      )}

      {offsite && !gone ? (
        <Link
          href={offsite.href}
          className={`${TILE_BUTTON} border-line-soft bg-surface text-ink hover:border-ink hover:bg-ink hover:text-on-ink`}
        >
          <span>{t(offsite.label)}</span>
        </Link>
      ) : packed && !gone ? (
        // A link, not a disabled button. The pack is a real choice that has
        // been made; what's missing is a question this tile can't ask, so the
        // control's job is to go and ask it. Same shape and weight as the add
        // button beside it on other tiles — it is still "the thing you press
        // next", and the price is still the pack's price.
        <Link
          href={configureHref}
          className={`${TILE_BUTTON} border-line-soft bg-surface text-ink hover:border-ink hover:bg-ink hover:text-on-ink`}
        >
          <span>{t("mix.chooseFlavors")}</span>
          <span className="tabular-nums">{formatPrice(price)}</span>
        </Link>
      ) : (
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            addItem(product.slug, 1, selected);
            // Back to the starting point, so adding an everything bagel doesn't
            // leave the tile pre-answered for the next person's plain one.
            setSelected(defaultOptions(product));
            requestOpenBasket();
          }}
          className={`${TILE_BUTTON} border-line-soft bg-surface text-ink hover:border-ink hover:bg-ink hover:text-on-ink disabled:cursor-default disabled:opacity-[var(--cb-disabled)] disabled:hover:border-line-soft disabled:hover:bg-surface disabled:hover:text-ink`}
        >
          <span>{gone ? t("common.soldOut") : prompt ?? t("shop.addToBasket")}</span>
          <span className="tabular-nums">{formatPrice(price)}</span>
        </button>
      )}
    </div>
  );
}
