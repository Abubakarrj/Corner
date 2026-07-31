"use client";

import Link from "next/link";
import { formatPrice, type Product } from "./products";
import ProductImage from "./ProductImage";
import { useCart } from "./CartContext";

const BRAND_RED = "#BE1923";

export default function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();

  return (
    <div className="flex flex-col">
      <Link href={`/product/${product.slug}`} className="cursor-pointer">
        <ProductImage
          swatch={product.swatch}
          name={product.name}
          className="aspect-square w-full rounded-lg"
        />
      </Link>
      <Link
        href={`/product/${product.slug}`}
        className="mt-3 cursor-pointer text-[14px] font-medium text-[#2D2D2D] hover:underline"
        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
      >
        {product.name}
      </Link>
      <span
        className="mt-0.5 text-[13px] text-[#575757]"
        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
      >
        {formatPrice(product.priceCents)}
      </span>
      <button
        type="button"
        onClick={() => addItem(product.slug)}
        style={{ borderColor: BRAND_RED, color: BRAND_RED }}
        className="mt-2 cursor-pointer border py-1.5 text-[12px] font-bold uppercase tracking-[0.06em] transition-opacity hover:opacity-70"
      >
        Add to cart
      </button>
    </div>
  );
}
