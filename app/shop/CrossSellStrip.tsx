"use client";

import Link from "next/link";
import { formatPrice, type Product } from "./products";
import ProductImage from "./ProductImage";
import { useCart } from "./CartContext";

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M6 1.5v9M1.5 6h9"
        stroke="#F3F1E5"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

// The basket drawer's cross-sell rail, modeled on the reference cart's
// "Try New Pleasures:" strip — a couple of products not already in the
// basket, each a tap away from being added without leaving the drawer.
export default function CrossSellStrip({
  products,
  onNavigate,
}: {
  products: Product[];
  onNavigate: () => void;
}) {
  const { addItem } = useCart();

  if (products.length === 0) return null;

  return (
    <div className="border-b border-[#E7E2D2] px-6 py-4">
      <p
        className="mb-3 text-[13px] text-[#3E4A30]"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
      >
        You might also like
      </p>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {products.map((product) => (
          <div key={product.slug} className="w-24 shrink-0">
            <Link href={`/shop/product/${product.slug}`} onClick={onNavigate} className="relative block cursor-pointer">
              <ProductImage
                swatch={product.swatch}
                name={product.name}
                className="aspect-square w-full rounded-lg"
              />
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  addItem(product.slug);
                }}
                aria-label={`Add ${product.name} to basket`}
                style={{ backgroundColor: "#3E4A30" }}
                className="absolute bottom-1.5 right-1.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.25)] transition-opacity hover:opacity-90"
              >
                <PlusIcon />
              </button>
            </Link>
            <Link
              href={`/shop/product/${product.slug}`}
              onClick={onNavigate}
              className="mt-1.5 block cursor-pointer truncate text-[11px] text-[#3E4A30] hover:underline"
            >
              {product.name}
            </Link>
            <span className="text-[11px] text-[#8A8672]">{formatPrice(product.priceCents)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
