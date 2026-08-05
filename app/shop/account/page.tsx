"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  describeOrderItems,
  formatOrderDate,
  signOut,
  summarizeUsuals,
  useAccount,
  useOrders,
  STATUS_LABEL,
  type OrderStatus,
  type PlacedOrder,
} from "../../account";
import { useCart } from "../CartContext";
import { formatPrice, getProduct } from "../products";
import ProductImage from "../ProductImage";
import { requestOpenBasket } from "../openBasket";
import { DISPLAY_FONT, PALETTE } from "../shopControls";

const { olive, muted, faint, border, surface, controlBorder } = PALETTE;

// Chip colours per status. Only "placed" is ever reached today — see the
// note on OrderStatus in app/account.ts — but the whole set is here so the
// day a POS starts reporting progress, this doesn't need touching.
const STATUS_STYLE: Record<OrderStatus, { bg: string; fg: string; border: string }> = {
  placed: { bg: "transparent", fg: muted, border: controlBorder },
  "in-the-kitchen": { bg: "#F1EAD8", fg: "#8A6D1F", border: "#E4D6AE" },
  "out-for-delivery": { bg: "#F7DED4", fg: "#B4552C", border: "#F0C9B8" },
  delivered: { bg: "#DFE8D2", fg: "#41632A", border: "#CBDABA" },
};

function StatusChip({ status }: { status: OrderStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span
      className="shrink-0 rounded-full border px-2.5 py-[3px] text-[11px] leading-none"
      style={{ backgroundColor: style.bg, color: style.fg, borderColor: style.border }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function SectionHeading({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2
        className="text-[12px] uppercase tracking-[0.08em]"
        style={{ color: faint }}
      >
        {children}
      </h2>
      {aside ? (
        <span className="text-[12px]" style={{ color: faint }}>
          {aside}
        </span>
      ) : null}
    </div>
  );
}

export default function AccountPage() {
  const account = useAccount();
  const orders = useOrders();
  const { addItem } = useCart();

  const usuals = useMemo(() => summarizeUsuals(orders), [orders]);
  // The reference's "Recent activity" is a short status feed above the
  // orders themselves — the last few things that changed, not the orders in
  // full. With one status in play it's the last few orders placed.
  const activity = useMemo(() => orders.slice(0, 3), [orders]);

  // Not signed in: nothing to show, and the way in is /membership. The
  // header only offers this link to a signed-in visitor, so reaching it
  // otherwise means a bookmark or a shared URL.
  if (!account) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-10 sm:px-6">
        <h1
          className="text-[20px] font-medium"
          style={{ color: olive, fontFamily: DISPLAY_FONT }}
        >
          Your account
        </h1>
        <p className="mt-2 text-[14px] leading-[1.5]" style={{ color: muted }}>
          Sign in to keep your usuals and your order history in one place.
        </p>
        <Link
          href="/membership"
          style={{ backgroundColor: olive }}
          className="mt-6 inline-block cursor-pointer rounded-full px-6 py-3 text-[13px] font-medium uppercase tracking-[0.06em] text-[#F3F1E5] transition-opacity hover:opacity-90"
        >
          Join or sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-6 sm:py-10">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1
            className="text-[20px] font-medium"
            style={{ color: olive, fontFamily: DISPLAY_FONT }}
          >
            {account.name || "Your account"}
          </h1>
          <p className="mt-0.5 truncate text-[13px]" style={{ color: muted }}>
            {account.email}
          </p>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="shrink-0 cursor-pointer rounded-full border px-4 py-2 text-[12px] transition-colors hover:bg-[#EFEBDD]"
          style={{ borderColor: controlBorder, color: olive }}
        >
          Sign out
        </button>
      </div>

      {orders.length === 0 ? (
        <div
          className="mt-8 rounded-2xl border p-6 text-center"
          style={{ borderColor: border, backgroundColor: surface }}
        >
          <p className="text-[14px] font-medium" style={{ color: olive }}>
            No orders yet.
          </p>
          <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-[1.5]" style={{ color: muted }}>
            Once you&rsquo;ve ordered, your usuals show up here so a second
            round takes one tap.
          </p>
          <Link
            href="/shop"
            style={{ backgroundColor: olive }}
            className="mt-5 inline-block cursor-pointer rounded-full px-6 py-3 text-[12px] font-medium uppercase tracking-[0.06em] text-[#F3F1E5] transition-opacity hover:opacity-90"
          >
            Browse the menu
          </Link>
        </div>
      ) : (
        <>
          {usuals.length > 0 ? (
            <section className="mt-9">
              <SectionHeading>Reorder your usuals</SectionHeading>
              <div className="grid grid-cols-2 gap-3">
                {usuals.map((usual) => {
                  const product = getProduct(usual.slug);
                  return (
                    <div
                      key={`${usual.slug}-${usual.optionsLabel}`}
                      className="flex flex-col rounded-2xl border p-3"
                      style={{ borderColor: border, backgroundColor: surface }}
                    >
                      <ProductImage
                        swatch={product?.swatch ?? "#ECE6D8"}
                        name={usual.name}
                        className="aspect-square w-full rounded-xl"
                      />
                      <p
                        className="mt-2.5 line-clamp-1 text-[14px]"
                        style={{ color: olive, fontFamily: DISPLAY_FONT }}
                      >
                        {usual.name}
                      </p>
                      {usual.optionsLabel ? (
                        <p className="mt-0.5 line-clamp-1 text-[12px]" style={{ color: muted }}>
                          {usual.optionsLabel}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-[12px]" style={{ color: faint }}>
                        Ordered {usual.timesOrdered}× before
                      </p>
                      <button
                        type="button"
                        // Adds it exactly as it was ordered, options and all
                        // — that's the whole point of a usual. It goes
                        // through the normal add, so it merges with a
                        // matching line already in the basket.
                        onClick={() => {
                          addItem(usual.slug, 1, usual.options);
                          requestOpenBasket();
                        }}
                        className="mt-3 flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full border text-[13px] transition-colors hover:bg-[#EFEBDD]"
                        style={{ borderColor: controlBorder, color: olive }}
                      >
                        <span aria-hidden>+</span> Add
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="mt-9">
            <SectionHeading>Recent activity</SectionHeading>
            <div className="flex flex-col gap-2">
              {activity.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5"
                  style={{ borderColor: border, backgroundColor: surface }}
                >
                  <span className="min-w-0 truncate text-[14px]" style={{ color: olive }}>
                    {order.id} {STATUS_LABEL[order.status].toLowerCase()}
                  </span>
                  <span className="shrink-0 text-[13px]" style={{ color: muted }}>
                    {formatOrderDate(order.placedAt)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-9">
            {/* "All locations" in the reference is a filter. It's a label
                here: one shop, so there is nothing to filter between. It
                becomes a control when there's a second. */}
            <SectionHeading aside="All locations">Recent orders</SectionHeading>
            <div className="flex flex-col gap-3">
              {orders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: PlacedOrder }) {
  const { addItem } = useCart();
  const first = order.items[0];
  const product = first ? getProduct(first.slug) : undefined;

  return (
    <div
      className="flex gap-4 rounded-2xl border p-4"
      style={{ borderColor: border, backgroundColor: surface }}
    >
      <ProductImage
        swatch={product?.swatch ?? "#ECE6D8"}
        name={first?.name ?? order.id}
        className="h-16 w-16 shrink-0 rounded-xl"
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px]" style={{ color: olive }}>
            {order.id}
          </span>
          <StatusChip status={order.status} />
        </div>

        <p className="mt-1 line-clamp-1 text-[14px]" style={{ color: olive }}>
          {describeOrderItems(order)}
        </p>
        <p className="mt-0.5 text-[12px]" style={{ color: faint }}>
          {order.fulfillmentWhere} · {formatOrderDate(order.placedAt)}
        </p>

        <div className="mt-2 flex items-end justify-between gap-3">
          <span className="text-[15px]" style={{ color: olive }}>
            {formatPrice(order.subtotalCents)}
          </span>
          <button
            type="button"
            // Puts the whole order back in the basket. Items the menu has
            // since dropped are skipped by addItem rather than failing the
            // reorder — the rest of a lunch is better than none of it.
            onClick={() => {
              for (const item of order.items) {
                addItem(item.slug, item.quantity, item.options);
              }
              requestOpenBasket();
            }}
            className="shrink-0 cursor-pointer rounded-full border px-4 py-2 text-[13px] transition-colors hover:bg-[#EFEBDD]"
            style={{ borderColor: controlBorder, color: olive }}
          >
            Reorder
          </button>
        </div>
      </div>
    </div>
  );
}
