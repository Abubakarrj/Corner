"use client";

import { useState } from "react";
import { useCart } from "../../CartContext";
import { requestOpenBasket } from "../../openBasket";

const BRAND_RED = "#BE1923";

export default function AddToCartForm({ slug }: { slug: string }) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);

  return (
    <div style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-full border border-[#E2E2E2]">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="h-10 w-10 cursor-pointer rounded-full text-[16px] text-[#2D2D2D] transition-opacity hover:opacity-60"
          >
            −
          </button>
          <span className="w-8 text-center text-[14px] text-[#2D2D2D]">{quantity}</span>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQuantity((q) => Math.min(20, q + 1))}
            className="h-10 w-10 cursor-pointer rounded-full text-[16px] text-[#2D2D2D] transition-opacity hover:opacity-60"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            addItem(slug, quantity);
            setQuantity(1);
            // The basket drawer sliding open is the confirmation — no
            // "Added" message needed here.
            requestOpenBasket();
          }}
          style={{ backgroundColor: BRAND_RED }}
          className="h-10 flex-1 cursor-pointer text-[13px] font-bold uppercase tracking-[0.06em] text-white transition-opacity hover:opacity-90"
        >
          Add to cart
        </button>
      </div>
    </div>
  );
}
