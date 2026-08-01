"use client";

import Link from "next/link";
import Drawer from "./Drawer";
import ProductImage from "./ProductImage";
import { useCart } from "./CartContext";
import { formatPrice, getProduct } from "./products";

const BRAND_RED = "#BE1923";

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M3.5 3.5l11 11M14.5 3.5l-11 11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EmptyBasketIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M4 6h12l-1 10.5a1.5 1.5 0 0 1-1.5 1.5h-7a1.5 1.5 0 0 1-1.5-1.5L4 6Z"
        stroke="#C9C9C9"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M7 6V4.5a3 3 0 1 1 6 0V6"
        stroke="#C9C9C9"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// The slide-over basket. Opens from the header's basket button and — via
// OPEN_BASKET_EVENT — whenever an item is added, so the confirmation for
// "add to cart" is seeing the thing sitting in the basket, not a toast.
export default function CartDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { lines, setQuantity, removeItem, subtotalCents, itemCount } = useCart();

  const rows = lines
    .map((line) => ({ line, product: getProduct(line.slug) }))
    .filter(
      (row): row is { line: (typeof lines)[number]; product: NonNullable<ReturnType<typeof getProduct>> } =>
        Boolean(row.product),
    );

  return (
    <Drawer open={open} onClose={onClose} side="right" label="Basket">
      <div className="flex items-center justify-between border-b border-[#F0F0F0] px-5 py-4">
        <h2
          className="text-[18px] font-bold text-[#2D2D2D]"
          style={{ letterSpacing: "-0.03em" }}
        >
          Your basket
          {itemCount > 0 ? (
            <span className="ml-2 font-normal text-[#8A8A8A]">({itemCount})</span>
          ) : null}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close basket"
          className="flex h-9 w-9 cursor-pointer items-center justify-center text-[#575757] transition-opacity hover:opacity-60"
        >
          <CloseIcon />
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <EmptyBasketIcon />
          <div>
            <p className="text-[15px] font-medium text-[#2D2D2D]">
              Your basket is empty
            </p>
            <p className="mt-1 text-[13px] text-[#8A8A8A]">
              Jars, sauces, and staples from behind the counter.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ borderColor: BRAND_RED, color: BRAND_RED }}
            className="cursor-pointer border px-6 py-2.5 text-[12px] font-bold uppercase tracking-[0.06em] transition-opacity hover:opacity-70"
          >
            Browse the pantry
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1 divide-y divide-[#F0F0F0] overflow-y-auto px-5">
            {rows.map(({ line, product }) => (
              <div key={line.slug} className="flex gap-3.5 py-4">
                <Link
                  href={`/shop/product/${product.slug}`}
                  onClick={onClose}
                  className="shrink-0 cursor-pointer"
                >
                  <ProductImage
                    swatch={product.swatch}
                    name={product.name}
                    className="h-16 w-16 rounded-lg"
                  />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/shop/product/${product.slug}`}
                      onClick={onClose}
                      className="cursor-pointer truncate text-[14px] font-medium text-[#2D2D2D] hover:underline"
                    >
                      {product.name}
                    </Link>
                    <span className="whitespace-nowrap text-[14px] text-[#2D2D2D]">
                      {formatPrice(product.priceCents * line.quantity)}
                    </span>
                  </div>

                  <div className="mt-auto flex items-center justify-between pt-2">
                    <div className="flex items-center rounded-full border border-[#E2E2E2]">
                      <button
                        type="button"
                        aria-label={`Decrease quantity of ${product.name}`}
                        onClick={() => setQuantity(line.slug, line.quantity - 1)}
                        className="h-8 w-8 cursor-pointer rounded-full text-[15px] text-[#2D2D2D] transition-opacity hover:opacity-60"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-[13px] text-[#2D2D2D]">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase quantity of ${product.name}`}
                        onClick={() => setQuantity(line.slug, line.quantity + 1)}
                        className="h-8 w-8 cursor-pointer rounded-full text-[15px] text-[#2D2D2D] transition-opacity hover:opacity-60"
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

          <div className="border-t border-[#F0F0F0] px-5 pb-5 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-medium text-[#2D2D2D]">Subtotal</span>
              <span className="text-[16px] font-bold text-[#2D2D2D]">
                {formatPrice(subtotalCents)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[#8A8A8A]">
              Payment is confirmed with you after the order goes in.
            </p>
            <Link
              href="/shop/checkout"
              onClick={onClose}
              style={{ backgroundColor: BRAND_RED }}
              className="mt-3 block w-full cursor-pointer py-3.5 text-center text-[14px] font-bold uppercase tracking-[0.06em] text-white transition-opacity hover:opacity-90"
            >
              Checkout
            </Link>
            <Link
              href="/shop/cart"
              onClick={onClose}
              className="mt-3 block cursor-pointer text-center text-[12px] text-[#575757] underline transition-opacity hover:opacity-70"
            >
              View full basket
            </Link>
          </div>
        </>
      )}
    </Drawer>
  );
}
