"use client";

import Link from "next/link";
import { useT } from "../i18n";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { describeFulfillment, peekFulfillment, useFulfillment } from "../fulfillment";
import { ButtonLink } from "../ui/Button";
import { PALETTE } from "./shopControls";
import { useOpening } from "../useOpening";

const { ink, cream, border, muted, controlBorder } = PALETTE;

// The shop is inert until an order has somewhere to go.
//
// A bagel collected in Koreatown, a tray going out to an office, and a
// delivery to an apartment are three different orders — different handoff,
// potentially different menu and price — so letting someone fill a basket first
// is inviting them to build something we can't fulfil, and then telling them
// at checkout. The choice comes first, on /locations, and lives in
// app/fulfillment.ts.
//
// Rendered inside the shop layout, so it covers the catalog, the product
// pages, the cart and checkout alike rather than each of them checking.
// Pages under /shop that aren't ordering, and so have no destination to ask
// for. Signing in and looking at an order you already placed are both things
// you do without a basket — gating them sends someone who just typed a code
// out of their email to a map, which is how a successful sign-in used to end
// up on /locations.
const UNGATED = ["/shop/account", "/shop/order"];

function ordering(pathname: string): boolean {
  return !UNGATED.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default function FulfillmentGate({ children }: { children: React.ReactNode }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const fulfillment = useFulfillment();
  const gated = ordering(pathname);

  // Landing here without a destination — a bookmark, a shared link, a
  // back button — sends you to the map, which is the one place the choice is
  // made. Anything else would be a second screen asking the same question,
  // and the rule is that until we know how the food is coming or going, you
  // are on the map.
  //
  // peek rather than the hook: the hook reports null for one render after
  // hydration, and redirecting on that would bounce someone who already has
  // a location.
  useEffect(() => {
    if (gated && peekFulfillment() === null) router.replace("/locations?for=menu");
  }, [gated, router]);

  if (gated && !fulfillment) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <p
          className="m-0 text-[20px] font-medium leading-tight"
          style={{ color: ink }}
        >
          {t("shop.whereSending")}
        </p>
        <p
          className="m-0 mt-3 max-w-xs text-[14px] leading-[1.5]"
          style={{ color: muted }}
        >
          {t("shop.takingYouToMap")}
        </p>
        <ButtonLink href="/locations" className="mt-7">
          {t("shop.chooseWhereGoing")}
        </ButtonLink>
      </div>
    );
  }

  return children;
}

// The standing answer to "where is this order going?", shown under the shop
// header on every page beneath it — including the cart and checkout, which is
// where getting it wrong costs the most.
export function FulfillmentBanner() {
  const t = useT();
  const fulfillment = useFulfillment();
  const opening = useOpening();
  if (!fulfillment) return null;

  const { mode, where } = describeFulfillment(fulfillment);

  return (
    <div
      className="flex items-center gap-2 border-b px-4 py-2 sm:gap-3 sm:px-6"
      style={{ backgroundColor: cream, borderColor: border }}
    >
      {/* No back control here. It was on this bar first, which was wrong for a
          reason worth leaving written down: this bar is not sticky and the
          header above it is, so on a long catalog the one control somebody
          needs scrolls off the top of the screen. It lives in ShopHeader now.
          "Change" stays, because changing where an order is going is a
          different act from leaving the page. */}
      <span
        className="shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em]"
        style={{ color: ink, borderColor: controlBorder }}
      >
        {t(mode)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: muted }}>
        {where}
      </span>
      {/* Open or shut, on the one bar that's on every shop page. Somebody
          browsing at 11pm should find out here rather than at checkout — or,
          worse, at the window. */}
      {!opening.open ? (
        <span className="shrink-0 rounded-full bg-sun-soft px-2 py-1 text-[10px] font-medium leading-none text-sun-ink">
          {t("shop.closed")}
        </span>
      ) : null}
      <Link
        href="/locations"
        className="shrink-0 cursor-pointer text-[12px] underline underline-offset-2 transition-opacity hover:opacity-70"
        style={{ color: ink }}
      >
        {t("shop.change")}
      </Link>
    </div>
  );
}
