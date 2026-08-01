"use client";

import Link from "next/link";
import { formatPrice, type Product } from "./products";
import ProductImage from "./ProductImage";
import { useCart } from "./CartContext";
import { requestOpenBasket } from "./openBasket";

// The row shown in list view — a compact alternative to ProductCard's tile,
// styled after the reference wholesale catalog's row layout (thumbnail,
// name + category, price, quantity control) but built for this catalog's
// single-quantity add-to-basket flow rather than wholesale case counts.
export default function ProductListRow({ product }: { product: Product }) {
  const { addItem } = useCart();

  return (
    <div className="flex items-center gap-4 border-b border-[#E7E2D2] py-4 first:pt-0 last:border-b-0">
      <Link
        href={`/shop/product/${product.slug}`}
        className="relative shrink-0 cursor-pointer"
      >
        <ProductImage
          swatch={product.swatch}
          name={product.name}
          className="h-16 w-16 rounded-xl sm:h-20 sm:w-20"
        />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/shop/product/${product.slug}`}
            className="cursor-pointer text-[15px] leading-snug text-[#3E4A30] hover:underline"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            {product.name}
          </Link>
          {product.tag ? (
            <span className="rounded-full bg-[#3E4A30] px-2 py-0.5 text-[9px] font-medium text-[#F3F1E5]">
              {product.tag}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[11px] uppercase tracking-[0.06em] text-[#8A8672]">
          {product.category}
        </p>
        <p className="mt-1 hidden text-[12px] leading-[1.45] text-[#6F6A5C] sm:line-clamp-1 sm:block">
          {product.description}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className="text-[14px] text-[#3E4A30]">{formatPrice(product.priceCents)}</span>
        <button
          type="button"
          onClick={() => {
            addItem(product.slug);
            requestOpenBasket();
          }}
          className="cursor-pointer whitespace-nowrap rounded-full border border-[#3E4A30] px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[#3E4A30] transition-colors hover:bg-[#3E4A30] hover:text-[#F3F1E5]"
        >
          Add to basket
        </button>
      </div>
    </div>
  );
}
