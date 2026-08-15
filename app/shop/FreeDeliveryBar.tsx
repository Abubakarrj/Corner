"use client";

import { formatPrice } from "./products";
import { FREE_DELIVERY_OVER_CENTS } from "./money";
import { useT } from "../i18n";

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <path
        d="M2.5 6.7l2.6 2.6 5.4-5.6"
        stroke="var(--cb-ink)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// The basket's progress bar: how far off a waived delivery fee this order is.
//
// Pure presentation over the cart's own subtotal, no new state and no tracking
// beyond the one threshold. The arithmetic that decides the waiver for real
// lives in money.ts and runs on both sides of the wire; this only draws it.
//
// ——— Delivery only, which the keychain version was not ———
//
// It used to count toward a free Corner Keychain and showed on every kind of
// order, on the reasoning that a gift in the bag makes as much sense collected
// in Koreatown as delivered to a door. That reasoning does not survive the
// change: there is no delivery fee on a pickup order, so a bar promising to
// waive one is promising nothing. CartDrawer only mounts this on a delivery.
export default function FreeDeliveryBar({ subtotalCents }: { subtotalCents: number }) {
  const t = useT();
  const remainingCents = FREE_DELIVERY_OVER_CENTS - subtotalCents;
  const unlocked = remainingCents <= 0;
  const progress = Math.min(100, (subtotalCents / FREE_DELIVERY_OVER_CENTS) * 100);

  return (
    <div className="shrink-0 border-b border-line-faint px-6 py-4">
      <p className="mb-2 flex items-center gap-1.5 text-[12px] text-ink">
        {unlocked ? (
          <>
            <CheckIcon />
            <span>{t("shop.freeDeliveryEarned")}</span>
          </>
        ) : (
          <>
            {t("shop.freeDeliveryProgress", { amount: formatPrice(remainingCents) })}
          </>
        )}
      </p>
      {/* Sun, because this is a reward being earned. As an ink bar it looked
          like a loading indicator. */}
      <div className="h-1.5 overflow-hidden rounded-full bg-line-faint">
        <div
          className="h-full rounded-full bg-sun transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
