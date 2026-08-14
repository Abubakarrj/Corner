"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { signOut, useAccount, useOrders } from "../../account";
import { Button, ButtonLink } from "../../ui/Button";
import ThemeToggle from "../../ui/ThemeToggle";
import LanguagePicker from "../../ui/LanguagePicker";
import { useT, type StringKey } from "../../i18n";
import { SHOP_EMAIL } from "../../shopFacts";
import { AccountButtonRow, AccountLinkRow } from "./AccountRow";
import OrderCard from "./OrderCard";
import { requestOpenChat } from "../openChat";
import { DISPLAY_FONT, PALETTE } from "../shopControls";

const { ink, muted, faint, border, surface } = PALETTE;

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
  const t = useT();

  // The newest few, with the rest a row away. This screen used to print every
  // order it had — fifty of them, after the history started syncing — under
  // the settings somebody actually came here to change.
  const recent = useMemo(() => orders.slice(0, 3), [orders]);

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
          <section className="mt-9">
            <SectionHeading aside={t("account.ordersCount", { count: orders.length })}>
              {t("account.recentOrders")}
            </SectionHeading>
            <div className="cb-stagger flex flex-col gap-3">
              {recent.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          </section>
        </>
      )}

      {/* ——— The rows ———

          Everything that is a destination rather than a thing to look at.
          The account used to print all of this inline, one bordered section
          under another, so an old order and a language switch were drawn at
          the same weight and finding either meant reading past the other.

          Order matters: orders first because that is what this screen is for,
          then the two ways to reach a person, then the settings that sit
          below in full. */}
      <div className="mt-9 border-t border-line-faint">
        <AccountLinkRow
          href="/shop/account/orders"
          label={t("account.myOrders")}
          value={orders.length > 0 ? t("account.allOrders") : t("account.nothingYet")}
        />
        {/* Riley, over whatever you were looking at, rather than a route.
            See app/shop/openChat.ts. */}
        <AccountButtonRow
          onClick={requestOpenChat}
          label={t("account.customerService")}
          value={t("account.liveChat")}
        />
        {/* A real inbox, because there is nowhere better for it to go and a
            form that posts into a table nobody reads is worse than an email
            somebody answers. */}
        <AccountLinkRow
          href={`mailto:${SHOP_EMAIL}`}
          label={t("account.feedback")}
          value={SHOP_EMAIL}
          last
        />
      </div>

      {/* Settings, such as they are. Sits outside the orders branch so it's
          reachable on a brand-new account too — the same control is on the
          home screen for anyone not signed in. */}
      <section className="mt-8">
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
