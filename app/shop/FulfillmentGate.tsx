"use client";

import Link from "next/link";
import { describeFulfillment, useFulfillment } from "../fulfillment";
import { PALETTE } from "./shopControls";

const { olive, onOlive, cream, border, muted, controlBorder } = PALETTE;

// The shop is inert until an order has somewhere to go.
//
// A bagel collected in Koreatown, handed over at an outpost, and delivered to
// an apartment are three different orders — different handoff, potentially
// different menu and price — so letting someone fill a basket before choosing
// is inviting them to build something we can't fulfil, and then telling them
// at checkout. The choice comes first, on /locations, and lives in
// app/fulfillment.ts.
//
// Rendered inside the shop layout, so it covers the catalog, the product
// pages, the cart and checkout alike rather than each of them checking.
export default function FulfillmentGate({ children }: { children: React.ReactNode }) {
  const fulfillment = useFulfillment();

  if (!fulfillment) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <p
          className="m-0 text-[22px] font-bold leading-tight"
          style={{ color: olive }}
        >
          Where are we sending this?
        </p>
        <p
          className="m-0 mt-3 max-w-xs text-[14px] leading-[1.5]"
          style={{ color: muted }}
        >
          Pick a shop, an outpost, or a delivery address and the menu opens up.
        </p>
        <Link
          href="/locations"
          style={{ backgroundColor: olive, color: onOlive }}
          className="mt-7 cursor-pointer rounded-full px-7 py-3 text-[14px] font-bold transition-opacity hover:opacity-90"
        >
          Choose a location
        </Link>
      </div>
    );
  }

  return children;
}

// The standing answer to "where is this order going?", shown under the shop
// header on every page beneath it — including the cart and checkout, which is
// where getting it wrong costs the most.
export function FulfillmentBanner() {
  const fulfillment = useFulfillment();
  if (!fulfillment) return null;

  const { mode, where } = describeFulfillment(fulfillment);

  return (
    <div
      className="flex items-center gap-3 border-b px-4 py-2 sm:px-6"
      style={{ backgroundColor: cream, borderColor: border }}
    >
      <span
        className="shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]"
        style={{ color: olive, borderColor: controlBorder }}
      >
        {mode}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: muted }}>
        {where}
      </span>
      <Link
        href="/locations"
        className="shrink-0 cursor-pointer text-[12px] underline underline-offset-2 transition-opacity hover:opacity-70"
        style={{ color: olive }}
      >
        Change
      </Link>
    </div>
  );
}
