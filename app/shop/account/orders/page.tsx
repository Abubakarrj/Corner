"use client";

import Link from "next/link";
import { useAccount, useOrders } from "../../../account";
import { ButtonLink } from "../../../ui/Button";
import { useT } from "../../../i18n";
import OrderCard from "../OrderCard";
import { DISPLAY_FONT, PALETTE } from "../../shopControls";

const { ink, muted } = PALETTE;

// Every order, in full.
//
// ——— Why this is a page and not more of the account ———
//
// The account printed all of them. That was survivable while an order lived
// on one device and there were three of them; it stopped being survivable
// when history started syncing from the server, because fifty cards now sit
// between the greeting and the language switch. A hub should be short enough
// to see the bottom of.
//
// So the account shows the newest three and a row through to here, and here
// is the only screen whose length is allowed to grow with how much somebody
// has bought from us.
//
// ——— Where the orders come from ———
//
// useOrders, the same store as everywhere else: the device's own record,
// merged with the server's on sign-in. That is deliberate rather than a fetch
// of its own — this screen must work offline for an order placed on this
// phone, and an account page that needs the network to show you what you
// already bought is a worse version of a receipt.
export default function OrdersPage() {
  const account = useAccount();
  const orders = useOrders();
  const t = useT();

  return (
    <div className="mx-auto max-w-2xl px-5 py-6 sm:px-6 sm:py-8">
      <Link
        href="/shop/account"
        className="inline-block cursor-pointer text-[13px] underline"
        style={{ color: muted }}
      >
        ← {t("account.title")}
      </Link>

      <h1
        className="mt-5 text-[24px] font-medium leading-tight tracking-[-0.01em]"
        style={{ color: ink, fontFamily: DISPLAY_FONT }}
      >
        {t("account.myOrders")}
      </h1>

      {/* Signed out is not the same as having no orders, and the two used to
          look alike. An order placed without an account still lives on this
          device and is still shown; what signing in adds is the ones placed
          on a different phone. */}
      {orders.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-[14px] font-medium" style={{ color: ink }}>
            {t("account.nothingYet")}
          </p>
          <ButtonLink href="/shop" className="mt-5">
            {t("common.browseMenu")}
          </ButtonLink>
          {!account ? (
            <p className="mx-auto mt-6 max-w-xs text-[13px] leading-[1.5]" style={{ color: muted }}>
              {t("account.signInPrompt")}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <p className="mt-1 text-[13px]" style={{ color: muted }}>
            {t("account.ordersCount", { count: orders.length })}
          </p>
          <div className="cb-stagger mt-6 flex flex-col gap-3">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
