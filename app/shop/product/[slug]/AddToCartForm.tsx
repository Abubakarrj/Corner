"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "../../CartContext";

const BRAND_RED = "#BE1923";

export default function AddToCartForm({ slug }: { slug: string }) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  return (
    <div style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
      <div className="flex items-center gap-3">
        <div className="flex items-center border border-[#E2E2E2]">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="h-10 w-10 cursor-pointer text-[16px] text-[#2D2D2D] transition-opacity hover:opacity-60"
          >
            −
          </button>
          <span className="w-8 text-center text-[14px] text-[#2D2D2D]">{quantity}</span>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQuantity((q) => Math.min(20, q + 1))}
            className="h-10 w-10 cursor-pointer text-[16px] text-[#2D2D2D] transition-opacity hover:opacity-60"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            addItem(slug, quantity);
            setAdded(true);
            setQuantity(1);
          }}
          style={{ backgroundColor: BRAND_RED }}
          className="h-10 flex-1 cursor-pointer text-[13px] font-bold uppercase tracking-[0.06em] text-white transition-opacity hover:opacity-90"
        >
          Add to cart
        </button>
      </div>

      {added ? (
        <p className="mt-3 text-[13px] text-[#575757]">
          Added.{" "}
          <Link href="/cart" className="underline">
            View cart
          </Link>
        </p>
      ) : null}
    </div>
  );
}
