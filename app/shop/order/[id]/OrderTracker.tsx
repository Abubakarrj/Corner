"use client";

import Link from "next/link";
import { useLocale, useT } from "../../../i18n";
import { useMenu } from "../../../i18n/menu";
import { localeById } from "../../../localeScript";
import { fulfillmentModeKey } from "../../../fulfillment";
import { useEffect, useState } from "react";
import {
  findOrder,
  formatOrderDate,
  orderTotals,
  progressFor,
  useOrders,
  type PlacedOrder,
} from "../../../account";
import { SHOP_PHONE } from "../../../shopFacts";
import { useLiveStatus } from "../../useLiveStatus";
import { ButtonLink } from "../../../ui/Button";
import { formatPrice, getProduct } from "../../products";
import ProductImage from "../../ProductImage";
import { DISPLAY_FONT, PALETTE } from "../../shopControls";

const { ink, muted, faint, border, surface, controlBorder, sky } = PALETTE;

// The order-tracking screen, in the shape a food-delivery app uses: a headline
// that says where the order is, a bar that fills, the stages under it, then
// the receipt.
//
// The stage is real when the shop has said so, and an estimate when it hasn't.
//
// /api/order-status is asked every 20 seconds for as long as this screen is
// open. It answers from Toast — moved by somebody pressing Order Ready in
// Orders Hub — and, on a delivery, from Uber. When it knows nothing, which is
// every order placed before this existed and every order the kitchen has not
// touched, the clock estimate carries on exactly as it always did.
//
// See progressFor in app/account.ts for how the two are reconciled. The short
// version: a real "ready" is stated whatever the clock thinks, and a real
// "still cooking" stops the clock from claiming ready — but never holds the
// bar back below the kitchen, because a shop without a KDS fires nothing at
// all until the moment it is done.
export default function OrderTracker({ id }: { id: string }) {
  const t = useT();
  const tag = localeById(useLocale()).tag;
  const orders = useOrders();
  const order = findOrder(orders, id);

  // Re-render on a timer so the bar creeps and the stage advances while the
  // screen is open, the way a delivery app's does. 15s rather than 1s: the
  // stages are minutes apart, and a per-second repaint of a page nobody is
  // interacting with is a waste of a phone's battery.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  // One poll for the whole app — see app/shop/useLiveStatus.ts. This screen
  // used to run its own, which is how the strip above it ended up counting
  // down while the headline already said Ready.
  const live = useLiveStatus(order);

  if (!order) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-12 text-center sm:px-6">
        <p className="text-[16px] font-medium" style={{ color: ink }}>
          {t("order.notFound")}
        </p>
        <p className="mx-auto mt-2 max-w-xs text-[14px] leading-[1.5]" style={{ color: muted }}>
          {t("order.keptOnDevice")}
        </p>
        <ButtonLink href="/shop" className="mt-6">
          {t("common.backToMenu")}
        </ButtonLink>
      </div>
    );
  }

  // `undefined` for the clock, not Date.now(): progressFor defaults it, and
  // reading the clock in a render body is the impurity the lint rule is for.
  // The 15s tick above is what makes this recompute.
  const progress = progressFor(order, tag, undefined, live);
  const stage = progress.stages[progress.current];

  return (
    <div className="cb-rise mx-auto max-w-2xl px-5 py-6 sm:px-6 sm:py-8">
      <Link
        href="/shop"
        className="inline-block cursor-pointer text-[13px] underline"
        style={{ color: muted }}
      >
        ← {t("common.backToMenu")}
      </Link>

      <h1
        className="mt-5 text-[26px] font-medium leading-[1.15] tracking-[-0.02em]"
        style={{ color: ink, fontFamily: DISPLAY_FONT }}
      >
        {t(stage.label)}
      </h1>
      <p className="mt-1.5 text-[15px] leading-[1.5]" style={{ color: muted }}>
        {t(stage.detail, stage.detailVars)}
      </p>

      {/* The bar. Its width is the estimate's progress, not a measurement —
          the line under it says which. */}
      <div
        className="mt-5 h-2 overflow-hidden rounded-full"
        style={{ backgroundColor: "var(--cb-line-faint)" }}
        role="progressbar"
        aria-valuenow={Math.round(progress.fraction * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("order.progress")}
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(6, progress.fraction * 100)}%`, backgroundColor: sky }}
        />
      </div>

      <p className="mt-2 text-[13px]" style={{ color: faint }}>
        {progress.eta
          ? t("order.estimated", {
              eta: t(progress.eta.key, { time: progress.eta.time }),
            })
          : t("order.shopConfirms")}
      </p>

      {/* The stages, as a list rather than a horizontal stepper: four labels
          across a phone either truncate or shrink below reading size. */}
      <ol className="cb-stagger mt-7 flex list-none flex-col gap-0 p-0">
        {progress.stages.map((entry, index) => {
          const done = index < progress.current;
          const active = index === progress.current;
          const last = index === progress.stages.length - 1;
          return (
            <li key={entry.status} className="flex gap-3.5">
              <div className="flex flex-col items-center">
                <span
                  aria-hidden
                  className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
                  style={{
                    borderColor: done || active ? ink : controlBorder,
                    // Done is ink because it is a fact; the stage in flight is sky
                    // because it is the thing still happening.
                    backgroundColor: done ? ink : active ? sky : "transparent",
                  }}
                />
                {last ? null : (
                  <span
                    aria-hidden
                    className="my-1 w-[2px] flex-1 rounded-full"
                    style={{ backgroundColor: done ? ink : controlBorder }}
                  />
                )}
              </div>
              <div className={last ? "pb-0" : "pb-5"}>
                <p
                  className="m-0 text-[14px]"
                  style={{
                    color: done || active ? ink : faint,
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  {t(entry.label)}
                </p>
                {active ? (
                  <p className="m-0 mt-0.5 text-[13px] leading-[1.45]" style={{ color: muted }}>
                    {/* Translated, like every other string. This rendered the
                        key itself — a customer watching their order saw the
                        literal text "order.placedDetail" under the first
                        stage. The headline above uses the same field and did
                        translate it, which is why it read correctly there and
                        was easy to miss here. */}
                    {t(entry.detail, entry.detailVars)}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <Receipt order={order} />

      {/* Call, not email. Something wrong with an order is a now problem —
          the food is being made, or it isn't, or it's at the wrong door — and
          an inbox answers tomorrow. The number is a tel: link so a phone
          dials it; on a desktop it hands off to whatever handles calls, and
          the number is legible either way rather than hidden behind a
          label. */}
      <p className="mt-6 text-[13px] leading-[1.5]" style={{ color: muted }}>
        {t("order.somethingWrong")}{" "}
        <a
          href={`tel:${SHOP_PHONE}`}
          className="cursor-pointer underline underline-offset-2"
          style={{ color: ink }}
        >
          {/* The label no longer prints the number. It is still a tel: link,
              so tapping dials it — the number just isn't set in the page as
              text to be scraped or read over somebody's shoulder. */}
          {t("order.callShop")}
        </a>
        .
      </p>
    </div>
  );
}

function Receipt({ order }: { order: PlacedOrder }) {
  const t = useT();
  const menu = useMenu();
  const tag = localeById(useLocale()).tag;
  const bill = orderTotals(order);
  return (
    <div
      className="mt-8 rounded-2xl border p-5"
      style={{ borderColor: border, backgroundColor: surface }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-medium" style={{ color: ink }}>
          {order.id}
        </span>
        <span className="text-[13px]" style={{ color: faint }}>
          {formatOrderDate(order.placedAt, tag)}
        </span>
      </div>
      <p className="mt-0.5 text-[13px]" style={{ color: muted }}>
        {t(fulfillmentModeKey(order.fulfillmentMode))} · {order.fulfillmentWhere}
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {order.items.map((item, index) => (
          <div key={`${item.slug}-${index}`} className="flex items-center gap-3">
            <ProductImage
              swatch={getProduct(item.slug)?.swatch ?? "var(--cb-faint)"}
              name={menu.recorded(item).name}
              className="h-10 w-10 shrink-0 rounded-lg"
            />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[14px]" style={{ color: ink }}>
                {item.quantity}× {menu.recorded(item).name}
              </p>
              {menu.recorded(item).options ? (
                <p className="m-0 text-[12px]" style={{ color: muted }}>
                  {menu.recorded(item).options}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 text-[14px]" style={{ color: ink }}>
              {formatPrice(item.unitCents * item.quantity)}
            </span>
          </div>
        ))}
      </div>

      {/* The bill as it was charged. This used to be one row reading "Total"
          against order.subtotalCents, which is not the total — checkout adds
          tax and whatever tip was left, so the same order showed one number on
          the confirmation and a smaller one here. */}
      <div className="mt-4 border-t pt-3" style={{ borderColor: border }}>
        <Line label={t("common.subtotal")} amount={formatPrice(bill.subtotalCents)} />
        <Line label={t("checkout.tax")} amount={formatPrice(bill.taxCents)} />
        {bill.deliveryCents > 0 ? (
          <Line label={t("checkout.delivery")} amount={formatPrice(bill.deliveryCents)} />
        ) : null}
        {bill.tipCents > 0 ? <Line label={t("checkout.tip")} amount={formatPrice(bill.tipCents)} /> : null}
        <div className="mt-1.5 border-t pt-2" style={{ borderColor: border }}>
          <Line label={t("common.total")} amount={formatPrice(bill.totalCents)} strong />
        </div>
      </div>
      <p className="mt-1.5 text-[12px]" style={{ color: muted }}>
        {bill.deliveryCents > 0 ? t("order.payCourier") : t("order.payAtWindow")}
      </p>

      {/* Uber's own tracking page. Linked rather than embedded, and rather
          than rebuilt: the courier is theirs, the live position is theirs,
          and a worse copy of a page that already exists is not worth
          building. Only ever present on a delivery that got a courier. */}
      {order.trackingUrl ? (
        <a
          href={order.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="cb-press mt-3 flex w-full cursor-pointer items-center justify-center rounded-full border px-4 py-2.5 text-[13px] font-medium transition-colors hover:bg-raise"
          style={{ borderColor: ink, color: ink }}
        >
          {t("order.followCourier")}
        </a>
      ) : null}
    </div>
  );
}

function Line({
  label,
  amount,
  strong,
}: {
  label: string;
  amount: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span
        className={strong ? "text-[14px] font-medium" : "text-[13px]"}
        style={{ color: strong ? ink : muted }}
      >
        {label}
      </span>
      <span
        className={strong ? "text-[15px] font-medium" : "text-[13px]"}
        style={{ color: ink }}
      >
        {amount}
      </span>
    </div>
  );
}
