"use client";

import Link from "next/link";
import { formatPrice, type Product } from "./products";
import ProductImage from "./ProductImage";
import { useCart } from "./CartContext";
import { requestOpenBasket } from "./openBasket";

// Card layout is 1:1 with the reference the user supplied (Flamingo
// Estate's "Summer Favorites" cards): rounded tile with a merchandising
// pill in its top-left corner, serif product name, one-line description,
// and a full-width rounded-pill button with "ADD TO BASKET" on the left
// and the price on the right.
//
// Links are /shop-rooted, not /-rooted — see the note in ShopHeader.tsx.
export default function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();

  return (
    <div
      className="flex flex-col"
      style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
    >
      <Link
        href={`/shop/product/${product.slug}`}
        className="relative cursor-pointer"
      >
        <ProductImage
          swatch={product.swatch}
          name={product.name}
          className="aspect-square w-full rounded-2xl"
        />
        {product.tag ? (
          <span className="absolute left-3 top-3 rounded-full bg-[#2D2D2D] px-3 py-1 text-[11px] font-medium text-[#F7F4EB]">
            {product.tag}
          </span>
        ) : null}
      </Link>

      <Link
        href={`/shop/product/${product.slug}`}
        className="mt-3 cursor-pointer text-[19px] leading-snug text-[#2D2D2D] hover:underline"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
      >
        {product.name}
      </Link>
      <p className="mt-1 line-clamp-2 text-[13px] leading-[1.45] text-[#6F6A5C]">
        {product.description}
      </p>

      <button
        type="button"
        onClick={() => {
          addItem(product.slug);
          requestOpenBasket();
        }}
        className="mt-3 flex cursor-pointer items-center justify-between rounded-full border border-[#2D2D2D] px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[#2D2D2D] transition-colors hover:bg-[#2D2D2D] hover:text-[#F7F4EB]"
      >
        <span>Add to basket</span>
        <span>{formatPrice(product.priceCents)}</span>
      </button>
    </div>
  );
}
