"use client";

import Link from "next/link";
import { useCart } from "../CartContext";
import { formatPrice, getProduct } from "../products";
import ProductImage from "../ProductImage";
import { DISPLAY_FONT } from "../shopControls";

export default function CartPage() {
  const { lines, setQuantity, removeItem, subtotalCents } = useCart();

  const rows = lines
    .map((line) => ({ line, product: getProduct(line.slug) }))
    .filter((row): row is { line: (typeof lines)[number]; product: NonNullable<ReturnType<typeof getProduct>> } =>
      Boolean(row.product),
    );

  return (
    <div
      className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10"
    >
      <h1
        className="mb-6 text-[18px] font-bold text-[#3E4A30]"
        style={{ fontFamily: DISPLAY_FONT }}
      >
        Cart
      </h1>

      {rows.length === 0 ? (
        <div>
          <p className="text-[14px] text-[#6F6A5C]">Your cart is empty.</p>
          <Link href="/shop" className="mt-3 inline-block cursor-pointer text-[14px] underline">
            Browse the pantry
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-[#E4DECE]">
            {rows.map(({ line, product }) => (
              <div key={line.slug} className="flex gap-4 py-4">
                <Link href={`/shop/product/${product.slug}`} className="shrink-0 cursor-pointer">
                  <ProductImage
                    swatch={product.swatch}
                    name={product.name}
                    className="h-20 w-20 rounded-lg"
                  />
                </Link>

                <div className="flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/shop/product/${product.slug}`}
                      className="cursor-pointer text-[14px] font-medium text-[#3E4A30] hover:underline"
                    >
                      {product.name}
                    </Link>
                    <span className="whitespace-nowrap text-[14px] text-[#3E4A30]">
                      {formatPrice(product.priceCents * line.quantity)}
                    </span>
                  </div>
                  <span className="text-[13px] text-[#6F6A5C]">
                    {formatPrice(product.priceCents)} each
                  </span>

                  <div className="mt-auto flex items-center gap-3 pt-2">
                    <div className="flex items-center rounded-full border border-[#DDD6C2]">
                      <button
                        type="button"
                        aria-label={`Decrease quantity of ${product.name}`}
                        onClick={() => setQuantity(line.slug, line.quantity - 1)}
                        className="h-8 w-8 cursor-pointer rounded-full text-[14px] text-[#3E4A30] transition-opacity hover:opacity-60"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-[13px] text-[#3E4A30]">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase quantity of ${product.name}`}
                        onClick={() => setQuantity(line.slug, line.quantity + 1)}
                        className="h-8 w-8 cursor-pointer rounded-full text-[14px] text-[#3E4A30] transition-opacity hover:opacity-60"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(line.slug)}
                      className="cursor-pointer text-[12px] text-[#8A8A8A] underline transition-opacity hover:opacity-70"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-[#E4DECE] pt-4">
            <span className="text-[14px] font-medium text-[#3E4A30]">Subtotal</span>
            <span
              className="text-[16px] font-bold text-[#3E4A30]"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              {formatPrice(subtotalCents)}
            </span>
          </div>

          <Link
            href="/shop/checkout"
            style={{ backgroundColor: "#3E4A30" }}
            className="mt-4 block w-full cursor-pointer rounded-full py-3 text-center text-[12px] font-bold uppercase tracking-[0.06em] text-[#F3F1E5] transition-opacity hover:opacity-90"
          >
            Checkout
          </Link>
        </>
      )}
    </div>
  );
}
