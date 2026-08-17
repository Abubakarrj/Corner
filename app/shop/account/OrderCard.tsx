"use client";

import {
  formatOrderDate,
  orderTotals,
  progressFor,
  summarizeOrderItems,
  STATUS_LABEL,
  type OrderStatus,
  type PlacedOrder,
} from "../../account";
import { useCart } from "../CartContext";
import { Button, ButtonLink } from "../../ui/Button";
import { useLocale, useT } from "../../i18n";
import { useMenu } from "../../i18n/menu";
import { localeById } from "../../localeScript";
import { formatPrice, getProduct } from "../products";
import ProductImage from "../ProductImage";
import { requestOpenBasket } from "../openBasket";
import { PALETTE } from "../shopControls";

// One past order, as a card. Shared by the account hub, which shows the
// newest few, and by /shop/account/orders, which shows all of them — the two
// screens are the same list at two lengths, and a card that differed between
// them would be two things to keep in step.

const { ink, muted, faint, border, surface, controlBorder } = PALETTE;

// Chip colours per status. The stage is estimated from the clock rather than
// reported — see the warning on OrderStatus in app/account.ts — but the whole
// set is here so the day a POS starts reporting, this doesn't need touching.
const STATUS_STYLE: Record<OrderStatus, { bg: string; fg: string; border: string }> = {
  placed: { bg: "transparent", fg: muted, border: controlBorder },
  "in-the-kitchen": { bg: "var(--cb-raise)", fg: "var(--cb-muted)", border: "var(--cb-line-soft)" },
  ready: { bg: "var(--cb-good-bg)", fg: "var(--cb-ink)", border: "var(--cb-line-soft)" },
  "on-the-way": { bg: "var(--cb-good-bg)", fg: "var(--cb-muted)", border: "var(--cb-line-soft)" },
  complete: { bg: "transparent", fg: muted, border: controlBorder },
};

export function StatusChip({ status }: { status: OrderStatus }) {
  const t = useT();
  const style = STATUS_STYLE[status];
  return (
    <span
      className="shrink-0 rounded-full border px-2.5 py-[3px] text-[11px] leading-none"
      style={{ backgroundColor: style.bg, color: style.fg, borderColor: style.border }}
    >
      {t(STATUS_LABEL[status])}
    </span>
  );
}

export default function OrderCard({ order }: { order: PlacedOrder }) {
  const t = useT();
  const menu = useMenu();
  const tag = localeById(useLocale()).tag;
  const { addItem } = useCart();
  const summary = summarizeOrderItems(order);
  const first = summary?.first;
  const product = first ? getProduct(first.slug) : undefined;
  const firstName = first ? menu.recorded(first).name : order.id;
  // An order still in flight offers tracking; a settled one offers a reorder.
  // Showing both on every row makes neither read as the thing to do.
  const progress = progressFor(order);
  const live = !progress.settled;

  return (
    <div
      className="flex gap-4 rounded-2xl border p-4"
      style={{ borderColor: border, backgroundColor: surface }}
    >
      <ProductImage
        swatch={product?.swatch ?? "var(--cb-faint)"}
        category={product?.category}
        name={firstName}
        className="h-16 w-16 shrink-0 rounded-xl"
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px]" style={{ color: ink }}>
            {order.id}
          </span>
          <StatusChip status={progress.stages[progress.current].status} />
        </div>

        <p className="mt-1 line-clamp-1 text-[14px]" style={{ color: ink }}>
          {summary
            ? summary.more > 0
              ? t("account.plusMore", { name: firstName, count: summary.more })
              : firstName
            : t("account.noOrders")}
        </p>
        <p className="mt-0.5 text-[12px]" style={{ color: faint }}>
          {order.fulfillmentWhere} · {formatOrderDate(order.placedAt, tag)}
        </p>

        <div className="mt-2 flex items-end justify-between gap-3">
          {/* What it came to, not what the food cost — the same number the
              tracker and the confirmation show. */}
          <span className="text-[15px]" style={{ color: ink }}>
            {formatPrice(orderTotals(order).totalCents)}
          </span>
          {live ? (
            <ButtonLink href={`/shop/order/${order.id}`} size="sm">
              {t("common.trackOrder")}
            </ButtonLink>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              // Puts the whole order back in the basket. Items the menu has
              // since dropped are skipped by addItem rather than failing the
              // reorder — the rest of a lunch is better than none of it.
              onClick={() => {
                for (const item of order.items) {
                  addItem(item.slug, item.quantity, item.options);
                }
                requestOpenBasket();
              }}
            >
              {t("account.reorder")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
