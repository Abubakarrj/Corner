"use client";

import Link from "next/link";
import { formatPrice, type Product } from "./products";
import ProductImage from "./ProductImage";
import { useCart } from "./CartContext";
import { requestOpenBasket } from "./openBasket";
import { DISPLAY_FONT } from "./shopControls";

// The row shown in list view — a compact alternative to ProductCard's tile:
// thumbnail, name + category, description, then price and add-to-basket
// pinned right. Sizes track the same scale as the card (see
// shopControls.ts) so switching views doesn't change the page's type.
export default function ProductListRow({ product }: { product: Product }) {
  const { addItem } = useCart();
  // A row is a single line of controls, and two dropdowns don't fit in one
  // without shoving the price off the end. An item that needs choices sends
  // you to its page to make them instead — which is the honest answer either
  // way, since it can't go in the basket unconfigured.
  const needsChoices = (product.options?.length ?? 0) > 0;

  return (
    <div className="group flex items-center gap-4 border-b border-line-faint py-4 first:pt-0 last:border-b-0">
      <Link
        href={`/shop/product/${product.slug}`}
        className="shrink-0 cursor-pointer overflow-hidden rounded-xl"
      >
        <ProductImage
          swatch={product.swatch}
          name={product.name}
          className="h-14 w-14 transition-transform duration-500 ease-out group-hover:scale-[1.04] sm:h-16 sm:w-16"
        />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={`/shop/product/${product.slug}`}
            className="cursor-pointer text-[15px] leading-[1.3] text-ink transition-opacity hover:opacity-70"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            {product.name}
          </Link>
          {product.tag ? (
            <span className="rounded-full bg-ink/90 px-2 py-[2px] text-[9px] font-medium uppercase tracking-[0.06em] text-on-ink">
              {product.tag}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-hint">
          {product.category}
        </p>
        <p className="mt-1.5 hidden text-[12px] leading-[1.5] text-faint sm:line-clamp-1 sm:block">
          {product.description}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <span className="text-[13px] tabular-nums text-ink">
          {formatPrice(product.priceCents)}
        </span>
        {needsChoices ? (
          <Link
            href={`/shop/product/${product.slug}`}
            className="flex h-9 cursor-pointer items-center whitespace-nowrap rounded-full border border-ink/70 px-4 text-[10px] font-medium uppercase tracking-[0.09em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-on-ink"
          >
            Choose
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              addItem(product.slug);
              requestOpenBasket();
            }}
            className="flex h-9 cursor-pointer items-center whitespace-nowrap rounded-full border border-ink/70 px-4 text-[10px] font-medium uppercase tracking-[0.09em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-on-ink"
          >
            Add to basket
          </button>
        )}
      </div>
    </div>
  );
}
