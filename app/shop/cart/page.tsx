"use client";

import Link from "next/link";
import { useT } from "../../i18n";
import { useMenu } from "../../i18n/menu";
import { useBasketMoved, useCart, useCartRows, MAX_PER_LINE } from "../CartContext";
import OptionPicker from "../OptionPicker";
import { formatPrice } from "../products";
import { Button, ButtonLink } from "../../ui/Button";
import ProductImage from "../ProductImage";
import { DISPLAY_FONT } from "../shopControls";

export default function CartPage() {
  const t = useT();
  const menu = useMenu();
  const { setQuantity, removeItem, setLineOptions, subtotalCents } = useCart();
  const rows = useCartRows();
  const moved = useBasketMoved();

  return (
    <div
      className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10"
    >
      {/* 20px, matching Checkout and the rest of the shop's page titles. This
          was 16px — the same size as body copy, which made the page look like
          it had no heading at all. */}
      <h1
        className="mb-6 text-[20px] font-medium text-ink"
        style={{ fontFamily: DISPLAY_FONT }}
      >
        {t("cart.title")}
      </h1>

      {moved ? (
        <p className="mb-5 rounded-xl border border-line-soft bg-sky-soft px-3 py-2.5 text-[12px] leading-[1.5] text-sky-ink">
          {t("cart.movedFrom", { from: moved.from, to: moved.to })}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div>
          <p className="text-[14px] text-muted">{t("cart.empty")}</p>
          <Link href="/shop" className="mt-3 inline-block cursor-pointer text-[14px] underline">
            {t("common.browseMenu")}
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-line">
            {rows.map(({ line, product, key, unitCents, lineCents, chosen, complete, gone }) => (
              <div key={key} className="flex gap-4 py-4">
                <Link href={`/shop/product/${product.slug}`} className="shrink-0 cursor-pointer">
                  <ProductImage
                    swatch={product.swatch}
                    name={menu.name(product)}
                    className="h-20 w-20 rounded-lg"
                  />
                </Link>

                <div className="flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/shop/product/${product.slug}`}
                      className="cursor-pointer text-[14px] font-medium text-ink hover:underline"
                    >
                      {menu.name(product)}
                    </Link>
                    <span className="whitespace-nowrap text-[14px] text-ink">
                      {formatPrice(lineCents)}
                    </span>
                  </div>
                  {chosen.length > 0 ? (
                    <span className="text-[13px] text-muted">
                      {menu.options(product, line.options).join(" · ")}
                    </span>
                  ) : null}
                  <span className="text-[13px] text-faint">
                    {t("product.eachPrice", { price: formatPrice(unitCents) })}
                  </span>
                  {gone ? (
                    <span className="mt-1 w-fit rounded-full bg-sun-soft px-2 py-[3px] text-[11px] font-medium leading-none text-sun-ink">
                      {t("common.soldOutToday")}
                    </span>
                  ) : null}
                  {/* A line that arrived without its choices — from a
                      basket saved before this item had any. Answering here
                      is the only way out that doesn't mean deleting it. */}
                  {!complete ? (
                    <div className="mt-1.5">
                      <p className="mb-1 text-[11px]" style={{ color: "var(--cb-red)" }}>
                        {t("cart.chooseBefore")}
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
                        aria-label={t("cart.decreaseOf", { name: menu.name(product) })}
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
                        aria-label={t("cart.increaseOf", { name: menu.name(product) })}
                        onClick={() => setQuantity(key, line.quantity + 1)}
                        disabled={line.quantity >= MAX_PER_LINE}
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
                      {t("common.remove")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
            <span className="text-[14px] font-medium text-ink">{t("common.subtotal")}</span>
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
          {rows.some((row) => !row.complete || row.gone) ? (
            <Button block disabled className="mt-4">
              {t("common.checkout")}
            </Button>
          ) : (
            <ButtonLink href="/shop/checkout" block className="mt-4">
              {t("common.checkout")}
            </ButtonLink>
          )}
        </>
      )}
    </div>
  );
}
