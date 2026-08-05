"use client";

import Link from "next/link";
import { useCart, useCartRows } from "../CartContext";
import OptionPicker from "../OptionPicker";
import { formatPrice } from "../products";
import { Button, ButtonLink } from "../../ui/Button";
import ProductImage from "../ProductImage";
import { DISPLAY_FONT } from "../shopControls";

export default function CartPage() {
  const { setQuantity, removeItem, setLineOptions, subtotalCents } = useCart();
  const rows = useCartRows();

  return (
    <div
      className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10"
    >
      <h1
        className="mb-6 text-[16px] font-medium text-ink"
        style={{ fontFamily: DISPLAY_FONT }}
      >
        Cart
      </h1>

      {rows.length === 0 ? (
        <div>
          <p className="text-[14px] text-muted">Your cart is empty.</p>
          <Link href="/shop" className="mt-3 inline-block cursor-pointer text-[14px] underline">
            Browse the menu
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-line">
            {rows.map(({ line, product, key, unitCents, lineCents, chosen, complete }) => (
              <div key={key} className="flex gap-4 py-4">
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
                      className="cursor-pointer text-[14px] font-medium text-ink hover:underline"
                    >
                      {product.name}
                    </Link>
                    <span className="whitespace-nowrap text-[14px] text-ink">
                      {formatPrice(lineCents)}
                    </span>
                  </div>
                  {chosen.length > 0 ? (
                    <span className="text-[13px] text-muted">
                      {chosen.join(" · ")}
                    </span>
                  ) : null}
                  <span className="text-[13px] text-faint">
                    {formatPrice(unitCents)} each
                  </span>
                  {/* A line that arrived without its choices — from a
                      basket saved before this item had any. Answering here
                      is the only way out that doesn't mean deleting it. */}
                  {!complete ? (
                    <div className="mt-1.5">
                      <p className="mb-1 text-[11px]" style={{ color: "var(--cb-red)" }}>
                        Choose before checking out:
                      </p>
                      <OptionPicker
                        product={product}
                        selected={line.options}
                        onChange={(next) => setLineOptions(key, next)}
                        idPrefix={`cart-${key}`}
                      />
                    </div>
                  ) : null}

                  <div className="mt-auto flex items-center gap-3 pt-2">
                    <div className="flex items-center rounded-full border border-line-soft">
                      <button
                        type="button"
                        aria-label={`Decrease quantity of ${product.name}`}
                        onClick={() => setQuantity(key, line.quantity - 1)}
                        className="h-8 w-8 cursor-pointer rounded-full text-[14px] text-ink transition-opacity hover:opacity-60"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-[13px] text-ink">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase quantity of ${product.name}`}
                        onClick={() => setQuantity(key, line.quantity + 1)}
                        className="h-8 w-8 cursor-pointer rounded-full text-[14px] text-ink transition-opacity hover:opacity-60"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(key)}
                      className="cursor-pointer text-[12px] text-quiet underline transition-opacity hover:opacity-70"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
            <span className="text-[14px] font-medium text-ink">Subtotal</span>
            <span
              className="text-[15px] font-medium text-ink"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              {formatPrice(subtotalCents)}
            </span>
          </div>

          {/* Held back while a line is still missing a choice, rather than
              letting someone press through to a checkout that turns them
              around. The picker they need is a few pixels above. */}
          {rows.some((row) => !row.complete) ? (
            <Button block disabled className="mt-4">
              Checkout
            </Button>
          ) : (
            <ButtonLink href="/shop/checkout" block className="mt-4">
              Checkout
            </ButtonLink>
          )}
        </>
      )}
    </div>
  );
}
