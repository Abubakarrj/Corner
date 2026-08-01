"use client";

import Link from "next/link";
import { formatPrice, type Product } from "./products";
import ProductImage from "./ProductImage";
import { useCart } from "./CartContext";
import { requestOpenBasket } from "./openBasket";

// Card layout follows the reference (Flamingo Estate's "Summer Favorites"
// cards): rounded tile with a merchandising pill in its top-left corner,
// serif product name, short description, and a full-width rounded-pill
// button with "ADD TO BASKET" on the left and the price on the right.
//
// h-full + mt-auto on the button is what keeps every CTA in a grid row on
// the same baseline — without it, a one-line description sits its button
// higher than a two-line neighbour's and the row reads ragged.
//
// Links are /shop-rooted, not /-rooted — see the note in ShopHeader.tsx.
export default function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();

  return (
    <div
      className="group flex h-full flex-col"
      style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
    >
      <Link
        href={`/shop/product/${product.slug}`}
        className="relative cursor-pointer overflow-hidden rounded-2xl"
      >
        <ProductImage
          swatch={product.swatch}
          name={product.name}
          className="aspect-square w-full transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
        {product.tag ? (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-[#3E4A30]/90 px-2 py-[3px] text-[9px] font-medium uppercase tracking-[0.06em] text-[#F3F1E5]">
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
          className="mt-3.5 cursor-pointer text-[15px] leading-[1.3] text-[#3E4A30] transition-opacity hover:opacity-70"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          {product.name}
        </Link>
        <p className="mt-1.5 line-clamp-2 text-[12px] leading-[1.5] text-[#8A8672]">
          {product.description}
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          addItem(product.slug);
          requestOpenBasket();
        }}
        className="mt-4 flex h-9 shrink-0 cursor-pointer items-center justify-between gap-2 rounded-full border border-[#3E4A30]/70 px-3.5 text-[10px] font-medium uppercase tracking-[0.09em] text-[#3E4A30] transition-colors hover:border-[#3E4A30] hover:bg-[#3E4A30] hover:text-[#F3F1E5]"
      >
        <span>Add to basket</span>
        <span className="tabular-nums">{formatPrice(product.priceCents)}</span>
      </button>
    </div>
  );
}
