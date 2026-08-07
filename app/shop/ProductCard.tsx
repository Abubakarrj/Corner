"use client";

import Link from "next/link";
import { useT } from "../i18n";
import { useMenu } from "../i18n/menu";
import { useState } from "react";
import {
  defaultOptions,
  formatPrice,
  optionsComplete,
  unitPriceCents,
  soldOut,
  type Product,
} from "./products";
import ProductImage from "./ProductImage";
import OptionPicker from "./OptionPicker";
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
export default function ProductCard({ product }: { product: Product }) {
  const t = useT();
  const menu = useMenu();
  const { addItem } = useCart();
  // The choices ride on the tile rather than sending people to the product
  // page for them: a bagel order is a handful of small decisions made fast,
  // and a round trip per sandwich would be the slowest part of it.
  const [selected, setSelected] = useState(() => defaultOptions(product));
  const gone = soldOut(product.slug);
  const ready = optionsComplete(product, selected) && !gone;
  const price = unitPriceCents(product, selected);

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

      {gone ? null : (
        <OptionPicker
          product={product}
          selected={selected}
          onChange={setSelected}
          idPrefix={`card-${product.slug}`}
        />
      )}

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
        className="cb-press mt-3 flex h-9 shrink-0 cursor-pointer items-center justify-between gap-2 rounded-full border border-line-soft bg-surface px-3.5 text-[10px] font-medium uppercase tracking-[0.09em] text-ink hover:border-ink hover:bg-ink hover:text-on-ink disabled:cursor-default disabled:opacity-35 disabled:hover:border-line-soft disabled:hover:bg-surface disabled:hover:text-ink"
      >
        <span>{gone ? t("common.soldOut") : t("shop.addToBasket")}</span>
        <span className="tabular-nums">{formatPrice(price)}</span>
      </button>
    </div>
  );
}
