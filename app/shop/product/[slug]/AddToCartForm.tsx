"use client";

import { useState } from "react";
import { useCart } from "../../CartContext";
import { formatPrice } from "../../products";
import { requestOpenBasket } from "../../openBasket";

// The stepper plus the reference-style pill button: "ADD TO BASKET" on the
// left, the live total (price × quantity) on the right, in one rounded
// outline pill that fills on hover.
export default function AddToCartForm({
  slug,
  priceCents,
}: {
  slug: string;
  priceCents: number;
}) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex shrink-0 items-center rounded-full border border-[#3E4A30]/30">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="h-10 w-10 cursor-pointer rounded-full text-[15px] text-[#3E4A30] transition-opacity hover:opacity-60"
          >
            −
          </button>
          <span className="w-7 text-center text-[13px] text-[#3E4A30]">{quantity}</span>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQuantity((q) => Math.min(20, q + 1))}
            className="h-10 w-10 cursor-pointer rounded-full text-[15px] text-[#3E4A30] transition-opacity hover:opacity-60"
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
          className="flex h-10 flex-1 cursor-pointer items-center justify-between rounded-full border border-[#3E4A30] px-4 text-[11px] font-medium uppercase tracking-[0.08em] text-[#3E4A30] transition-colors hover:bg-[#3E4A30] hover:text-[#F3F1E5]"
        >
          <span>Add to basket</span>
          <span>{formatPrice(priceCents * quantity)}</span>
        </button>
      </div>
    </div>
  );
}
