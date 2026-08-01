"use client";

import Link from "next/link";
import Drawer from "./Drawer";
import ProductImage from "./ProductImage";
import { useCart } from "./CartContext";
import { formatPrice, getProduct } from "./products";

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

// Greyed-out twin of ShopHeader's BasketIcon — keep the two in step.
function EmptyBasketIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 8.6 12 4l3 4.6"
        stroke="#CFC8B2"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="3" y="8" width="18" height="3.4" rx="1.7" fill="#CFC8B2" />
      <path
        d="M5 11.4h14l-.95 7.4a2.2 2.2 0 0 1-2.18 1.9H8.13a2.2 2.2 0 0 1-2.18-1.9L5 11.4Z"
        fill="#CFC8B2"
      />
      <circle cx="12" cy="5.1" r="0.65" fill="#FAF8F0" />
      <rect x="7.55" y="13" width="1.9" height="5.2" rx="0.95" fill="#FAF8F0" />
      <rect x="11.05" y="13" width="1.9" height="5.2" rx="0.95" fill="#FAF8F0" />
      <rect x="14.55" y="13" width="1.9" height="5.2" rx="0.95" fill="#FAF8F0" />
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
    <Drawer open={open} onClose={onClose} side="right" label="Basket" width="wide">
      <div className="flex items-center justify-between border-b border-[#E7E2D2] px-6 py-4">
        <h2
          className="text-[15px] font-bold text-[#3E4A30]"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          Your Basket
          {itemCount > 0 ? (
            <span className="ml-2 font-normal text-[#8A8A8A]">({itemCount})</span>
          ) : null}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close basket"
          className="flex h-9 w-9 cursor-pointer items-center justify-center text-[#3E4A30] transition-opacity hover:opacity-60"
        >
          <CloseIcon />
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <EmptyBasketIcon />
          <div>
            <p className="text-[13px] font-medium text-[#3E4A30]">
              Your basket is empty
            </p>
            <p className="mt-1 text-[12px] text-[#8A8A8A]">
              Jars, sauces, and staples from behind the counter.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ borderColor: "#3E4A30", color: "#3E4A30" }}
            className="cursor-pointer rounded-full border px-5 py-2 text-[11px] font-bold uppercase tracking-[0.06em] transition-opacity hover:opacity-70"
          >
            Browse the pantry
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1 divide-y divide-[#E7E2D2] overflow-y-auto px-6">
            {rows.map(({ line, product }) => (
              <div key={line.slug} className="flex gap-4 py-5">
                <Link
                  href={`/shop/product/${product.slug}`}
                  onClick={onClose}
                  className="shrink-0 cursor-pointer"
                >
                  <ProductImage
                    swatch={product.swatch}
                    name={product.name}
                    className="h-20 w-20 rounded-lg"
                  />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/shop/product/${product.slug}`}
                      onClick={onClose}
                      className="cursor-pointer text-[13px] font-medium text-[#3E4A30] hover:underline"
                    >
                      {product.name}
                    </Link>
                    <span className="whitespace-nowrap text-[13px] text-[#3E4A30]">
                      {formatPrice(product.priceCents * line.quantity)}
                    </span>
                  </div>
                  <span className="mt-0.5 text-[12px] text-[#8A8A8A]">
                    {formatPrice(product.priceCents)} each
                  </span>

                  <div className="mt-auto flex items-center justify-between pt-3">
                    <div className="flex items-center rounded-full border border-[#DDD6C2]">
                      <button
                        type="button"
                        aria-label={`Decrease quantity of ${product.name}`}
                        onClick={() => setQuantity(line.slug, line.quantity - 1)}
                        className="h-8 w-8 cursor-pointer rounded-full text-[14px] text-[#3E4A30] transition-opacity hover:opacity-60"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-[12px] text-[#3E4A30]">
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
                      className="cursor-pointer text-[11px] text-[#8A8A8A] underline transition-opacity hover:opacity-70"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Extra bottom padding clears the home-indicator gesture area
              under viewport-fit=cover; env() is 0 anywhere that isn't set,
              so it's inert elsewhere. */}
          <div
            className="border-t border-[#E7E2D2] px-6 pt-4"
            style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#3E4A30]">Subtotal</span>
              <span
                className="text-[14px] font-bold text-[#3E4A30]"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {formatPrice(subtotalCents)}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-[#8A8A8A]">
              Payment is confirmed with you after the order goes in.
            </p>
            <Link
              href="/shop/checkout"
              onClick={onClose}
              style={{ backgroundColor: "#3E4A30" }}
              className="mt-3 block w-full cursor-pointer rounded-full py-3 text-center text-[12px] font-bold uppercase tracking-[0.06em] text-[#F3F1E5] transition-opacity hover:opacity-90"
            >
              Checkout
            </Link>
            <Link
              href="/shop/cart"
              onClick={onClose}
              className="mt-3 block cursor-pointer text-center text-[11px] text-[#575757] underline transition-opacity hover:opacity-70"
            >
              View full basket
            </Link>
          </div>
        </>
      )}
    </Drawer>
  );
}
