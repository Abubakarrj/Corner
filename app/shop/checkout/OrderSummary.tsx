"use client";

import { useT } from "../../i18n";
import { useMenu } from "../../i18n/menu";
import { formatPrice } from "../products";
import ProductImage from "../ProductImage";
import { Disclosure, Money } from "./CheckoutSections";
import DeliveryFeeInfo from "./DeliveryFeeInfo";
import UberDirectMark from "./UberDirectMark";
import type { Checkout } from "./useCheckout";

// The collapsible order summary, shared by the page and the chat sheet.
//
// Collapsed by default and headed by the total, which is the reference's shape
// and the right one: the number is what somebody is checking, and the lines
// under it are for when the number surprises them. A summary that is always
// open pushes the fields that still need filling below the fold.
//
// Thumbnails because at a glance a picture of the thing tells you it's the
// right thing faster than its name does — and this is a last chance to notice
// the wrong bagel before it gets made.
export default function OrderSummary({ checkout }: { checkout: Checkout }) {
  const t = useT();
  const menu = useMenu();
  const { rows, itemCount, subtotalCents, totals } = checkout;

  return (
    <Disclosure
      summary={
        <span className="flex w-full items-center justify-between gap-3">
          <span className="text-muted">{t("checkout.orderSummary")}</span>
          <span className="font-medium tabular-nums text-ink">
            {formatPrice(totals.totalCents)}
          </span>
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        {rows.map(({ line, product, key, lineCents }) => {
          const chosen = menu.options(product, line.options);
          return (
            <div key={key} className="flex items-center gap-3">
              <ProductImage
                swatch={product.swatch}
                category={product.category}
                name={menu.name(product)}
                className="h-11 w-11 shrink-0 rounded-lg"
              />
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[14px] leading-[1.3] text-ink">
                  {menu.name(product)}
                </p>
                <p className="m-0 truncate text-[12px] text-muted">
                  {/* The chosen options when there are any, the quantity when
                      there aren't — rather than a "Qty 1" line under every row
                      that says nothing. */}
                  {chosen.length > 0
                    ? chosen.join(" · ")
                    : t("checkout.qty", { count: line.quantity })}
                </p>
              </div>
              <span className="shrink-0 text-[14px] tabular-nums text-ink">
                {formatPrice(lineCents)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 border-t border-line pt-2">
        <Money label={t("common.subtotal")} amount={formatPrice(subtotalCents)} />
        <Money label={t("checkout.tax")} amount={formatPrice(totals.taxCents)} />
        {/* Keyed on the *quoted* fee, not the charged one. Waived, the charge
            is zero and gating on that would make the row disappear at exactly
            the moment it has something worth saying. */}
        {totals.deliveryQuotedCents > 0 ? (
          // Who is driving, and a way to ask why it costs that. This is the
          // line on a food bill people assume is padded; naming the courier
          // and showing their rate card is how it stops reading that way.
          //
          // The (i) keeps the real quote either way: the rate card is about
          // what the trip costs, which is unchanged by who is paying for it.
          <Money
            label={t("checkout.delivery")}
            amount={
              totals.deliveryWaived
                ? t("checkout.deliveryWaived")
                : formatPrice(totals.deliveryCents)
            }
            after={
              <>
                <UberDirectMark className="text-[11px] text-quiet" />
                <DeliveryFeeInfo
                  miles={checkout.quote?.miles}
                  feeCents={totals.deliveryQuotedCents}
                  chargedCents={totals.deliveryCents}
                />
              </>
            }
          />
        ) : null}
        {totals.tipCents > 0 ? (
          <Money label={t("checkout.tip")} amount={formatPrice(totals.tipCents)} />
        ) : null}
        <div className="mt-1 border-t border-line pt-2">
          <Money
            label={
              itemCount === 1
                ? t("checkout.itemCountOne")
                : t("checkout.itemCount", { count: itemCount })
            }
            amount={formatPrice(totals.totalCents)}
            strong
          />
        </div>
      </div>
    </Disclosure>
  );
}
