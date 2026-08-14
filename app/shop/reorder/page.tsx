"use client";

import Link from "next/link";
import { useMemo } from "react";
import { summarizeUsuals, useOrders } from "../../account";
import { useCart } from "../CartContext";
import { Button, ButtonLink } from "../../ui/Button";
import { useT } from "../../i18n";
import { useMenu } from "../../i18n/menu";
import { getProduct } from "../products";
import ProductImage from "../ProductImage";
import { requestOpenBasket } from "../openBasket";
import OrderCard from "../account/OrderCard";
import { DISPLAY_FONT, PALETTE } from "../shopControls";

const { ink, muted, faint, border, surface } = PALETTE;

// Reorder — the tab's own screen.
//
// ——— Why it stopped being part of the account ———
//
// Reorder and Account were two tabs pointing at one page, told apart by an
// anchor: Account landed at the top, Reorder scrolled to the usuals halfway
// down. That worked as a stopgap and it was never a design. A tab that
// scrolls you into the middle of another tab's screen is one tab wearing two
// labels, and the back button has no idea which one you meant.
//
// They are also different questions. Account is about you — who is signed in,
// what you have bought, how the app is set up. Reorder is about lunch: what
// did I have last time, put it in the basket. The account is somewhere you go
// occasionally, this is somewhere you go at eight in the morning with one
// hand.
//
// ——— And why it does not require an account ———
//
// The usuals are derived from orders on this device, which exist whether or
// not anybody signed in. Sending a repeat customer to a login screen to see
// what they ordered from this same phone last week would be asking for a
// password to unlock their own memory. Signing in adds the orders from their
// other phone; it is not the price of entry.
export default function ReorderPage() {
  const orders = useOrders();
  const { addItem } = useCart();
  const t = useT();
  const menu = useMenu();

  const usuals = useMemo(() => summarizeUsuals(orders), [orders]);
  // Whole orders, under the individual items. Two ways to repeat yourself,
  // and they are genuinely different: one bagel you always get, against the
  // entire Friday order for four people.
  const recent = useMemo(() => orders.slice(0, 5), [orders]);

  return (
    <div className="mx-auto max-w-2xl px-5 py-6 sm:px-6 sm:py-8">
      <Link
        href="/shop"
        className="inline-block cursor-pointer text-[13px] underline"
        style={{ color: muted }}
      >
        ← {t("common.backToMenu")}
      </Link>

      <h1
        className="mt-5 text-[24px] font-medium leading-tight tracking-[-0.01em]"
        style={{ color: ink, fontFamily: DISPLAY_FONT }}
      >
        {t("nav.reorder")}
      </h1>

      {orders.length === 0 ? (
        <div
          className="mt-8 rounded-2xl border p-6 text-center"
          style={{ borderColor: border, backgroundColor: surface }}
        >
          <p className="text-[14px] font-medium" style={{ color: ink }}>
            {t("reorder.emptyTitle")}
          </p>
          <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-[1.5]" style={{ color: muted }}>
            {t("reorder.emptyBody")}
          </p>
          <ButtonLink href="/shop" className="mt-5">
            {t("common.browseMenu")}
          </ButtonLink>
        </div>
      ) : (
        <>
          {usuals.length > 0 ? (
            <section className="mt-7">
              <h2
                className="mb-3 text-[12px] uppercase tracking-[0.08em]"
                style={{ color: faint }}
              >
                {t("account.reorderUsuals")}
              </h2>
              <div className="cb-stagger grid grid-cols-2 gap-3">
                {usuals.map((usual) => {
                  const product = getProduct(usual.slug);
                  return (
                    <div
                      key={`${usual.slug}-${usual.optionsLabel}`}
                      className="flex flex-col rounded-2xl border p-3"
                      style={{ borderColor: border, backgroundColor: surface }}
                    >
                      <ProductImage
                        swatch={product?.swatch ?? "var(--cb-faint)"}
                        name={menu.recorded(usual).name}
                        className="aspect-square w-full rounded-xl"
                      />
                      <p
                        className="mt-2.5 line-clamp-1 text-[14px]"
                        style={{ color: ink, fontFamily: DISPLAY_FONT }}
                      >
                        {menu.recorded(usual).name}
                      </p>
                      {menu.recorded(usual).options ? (
                        <p className="mt-0.5 line-clamp-1 text-[12px]" style={{ color: muted }}>
                          {menu.recorded(usual).options}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-[12px]" style={{ color: faint }}>
                        {t("account.orderedBefore", { count: usual.timesOrdered })}
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        block
                        // Adds it exactly as it was ordered, options and all
                        // — that's the whole point of a usual. It goes through
                        // the normal add, so it merges with a matching line
                        // already in the basket.
                        onClick={() => {
                          addItem(usual.slug, 1, usual.options);
                          requestOpenBasket();
                        }}
                        className="mt-3"
                      >
                        <span aria-hidden>+</span> {t("reorder.add")}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="mt-9">
            <h2
              className="mb-3 text-[12px] uppercase tracking-[0.08em]"
              style={{ color: faint }}
            >
              {t("reorder.wholeOrders")}
            </h2>
            <div className="cb-stagger flex flex-col gap-3">
              {recent.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
            {orders.length > recent.length ? (
              <Link
                href="/shop/account/orders"
                className="cb-press mt-4 inline-block cursor-pointer text-[14px] underline underline-offset-2"
                style={{ color: muted }}
              >
                {t("account.allOrders")}
              </Link>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
