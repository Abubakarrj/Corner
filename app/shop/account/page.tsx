"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  formatOrderDate,
  orderTotals,
  progressFor,
  signOut,
  summarizeOrderItems,
  summarizeUsuals,
  useAccount,
  useOrders,
  STATUS_LABEL,
  type OrderStatus,
  type PlacedOrder,
} from "../../account";
import { useCart } from "../CartContext";
import { Button, ButtonLink } from "../../ui/Button";
import ThemeToggle from "../../ui/ThemeToggle";
import LanguagePicker from "../../ui/LanguagePicker";
import { useLocale, useT, type StringKey } from "../../i18n";
import { useMenu } from "../../i18n/menu";
import { localeById } from "../../localeScript";
import { formatPrice, getProduct } from "../products";
import ProductImage from "../ProductImage";
import { requestOpenBasket } from "../openBasket";
import { DISPLAY_FONT, PALETTE } from "../shopControls";

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

function StatusChip({ status }: { status: OrderStatus }) {
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

// "Good morning" until noon, "Good afternoon" until 5, "Good evening" after.
// Read from the visitor's own clock, not the shop's: a greeting is about the
// time where they are, unlike the opening hours, which are about the shop.
//
// Two keys per slot rather than a greeting with a name glued on the end,
// because where the name goes is a property of the language: English puts it
// last after a comma, Japanese and Korean put it first with an honorific, and
// Chinese puts it first with its own comma.
function greetingKey(named: boolean, now: Date = new Date()): StringKey {
  const hour = now.getHours();
  const slot = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  return `account.greet${slot}${named ? "Named" : ""}` as StringKey;
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
  const router = useRouter();
  const account = useAccount();
  const orders = useOrders();
  const { addItem } = useCart();
  const t = useT();
  const menu = useMenu();
  const tag = localeById(useLocale()).tag;

  const usuals = useMemo(() => summarizeUsuals(orders), [orders]);
  // The reference's "{t("account.recentActivity")}" is a short status feed above the
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
          style={{ color: ink, fontFamily: DISPLAY_FONT }}
        >
          {t("account.title")}
        </h1>
        <p className="mt-2 text-[14px] leading-[1.5]" style={{ color: muted }}>
          {t("account.signInPrompt")}
        </p>
        <ButtonLink href="/membership" className="mt-6">
          {t("account.joinOrSignIn")}
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-6 sm:px-6 sm:py-8">
      {/* The shop header above this has a search field and a basket and no way
          back to the catalog, so without this the account is a room with no
          door — the tab bar isn't on shop routes. */}
      <Link
        href="/shop"
        className="inline-block cursor-pointer text-[13px] underline"
        style={{ color: muted }}
      >
        ← Back to the menu
      </Link>

      <div className="mt-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1
            className="text-[24px] font-medium leading-tight tracking-[-0.01em]"
            style={{ color: ink, fontFamily: DISPLAY_FONT }}
          >
            {(() => {
              const first = account.name.split(" ")[0];
              return first
                ? t(greetingKey(true), { name: first })
                : t(greetingKey(false));
            })()}
          </h1>
          <p className="mt-0.5 truncate text-[13px]" style={{ color: muted }}>
            {account.email}
          </p>
        </div>
        {/* Out of here on the way out.

            Signing out used to leave you on this page, which then had nothing
            on it — the account collapses to "Sign in to keep your usuals",
            a heading and a button, on a screen you were already looking at.
            That reads like the tap failed. Somebody signing out of a bagel
            shop is not leaving the shop, they're just done being signed in,
            so the menu is where they belong.

            replace, not push: the signed-in account page is gone for this
            visitor, and leaving it in the history for the back button to
            find is offering a door to a room that no longer exists. */}
        <Button
          variant="quiet"
          size="sm"
          onClick={() => {
            signOut();
            router.replace("/shop");
          }}
        >
          {t("account.signOut")}
        </Button>
      </div>

      {orders.length === 0 ? (
        <div
          className="mt-8 rounded-2xl border p-6 text-center"
          style={{ borderColor: border, backgroundColor: surface }}
        >
          <p className="text-[14px] font-medium" style={{ color: ink }}>
            {t("account.noOrders")}
          </p>
          <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-[1.5]" style={{ color: muted }}>
            Once you&rsquo;ve ordered, your usuals show up here so a second
            round takes one tap.
          </p>
          <ButtonLink href="/shop" className="mt-5">
            {t("common.browseMenu")}
          </ButtonLink>
        </div>
      ) : (
        <>
          {usuals.length > 0 ? (
            <section className="mt-9">
              <SectionHeading>{t("account.reorderUsuals")}</SectionHeading>
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
                        <span aria-hidden>+</span> Add
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="mt-9">
            <SectionHeading>{t("account.recentActivity")}</SectionHeading>
            <div className="cb-stagger flex flex-col gap-2">
              {activity.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5"
                  style={{ borderColor: border, backgroundColor: surface }}
                >
                  <span className="min-w-0 truncate text-[14px]" style={{ color: ink }}>
                    {order.id} &middot;{" "}
                    {t(
                      STATUS_LABEL[
                        progressFor(order).stages[progressFor(order).current].status
                      ],
                    )}
                  </span>
                  <span className="shrink-0 text-[13px]" style={{ color: muted }}>
                    {formatOrderDate(order.placedAt, tag)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-9">
            <SectionHeading>{t("account.recentOrders")}</SectionHeading>
            <div className="cb-stagger flex flex-col gap-3">
              {orders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          </section>
        </>
      )}

      {/* Settings, such as they are. Sits outside the orders branch so it's
          reachable on a brand-new account too — the same control is on the
          home screen for anyone not signed in. */}
      <section className="mt-9 border-t pt-6" style={{ borderColor: border }}>
        <SectionHeading>{t("settings.language")}</SectionHeading>
        <div className="flex items-center justify-between gap-4">
          <p className="m-0 text-[13px] leading-[1.5]" style={{ color: muted }}>
            {t("settings.languageNote")}
          </p>
          <LanguagePicker className="shrink-0" />
        </div>

        <div className="mt-6">
          <SectionHeading>{t("settings.appearance")}</SectionHeading>
          <div className="flex items-center justify-between gap-4">
            <p className="m-0 text-[13px] leading-[1.5]" style={{ color: muted }}>
              {t("settings.appearanceNote")}
            </p>
            <ThemeToggle className="shrink-0" />
          </div>
        </div>
      </section>
    </div>
  );
}

function OrderCard({ order }: { order: PlacedOrder }) {
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
