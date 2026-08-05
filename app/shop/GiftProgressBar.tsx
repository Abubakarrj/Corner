"use client";

import { formatPrice, GIFT_NAME, GIFT_THRESHOLD_CENTS } from "./products";

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <path
        d="M2.5 6.7l2.6 2.6 5.4-5.6"
        stroke="#3E4A30"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// The basket's progress bar, modeled on the reference concierge cart's ("You
// are $86.00 away from FREE SHIPPING") but counting toward a keychain
// instead.
//
// Pure presentation over the cart's own subtotal — no new state, no separate
// tracking beyond the one threshold. Shown on every kind of order, unlike
// the free-shipping version it replaced: a gift in the bag makes as much
// sense collected in Koreatown as delivered to a door.
export default function GiftProgressBar({ subtotalCents }: { subtotalCents: number }) {
  const remainingCents = GIFT_THRESHOLD_CENTS - subtotalCents;
  const unlocked = remainingCents <= 0;
  const progress = Math.min(100, (subtotalCents / GIFT_THRESHOLD_CENTS) * 100);

  return (
    <div className="border-b border-[#E7E2D2] px-6 py-4">
      <p className="mb-2 flex items-center gap-1.5 text-[12px] text-[#3E4A30]">
        {unlocked ? (
          <>
            <CheckIcon />
            <span>
              A <span className="font-medium">{GIFT_NAME}</span> is on us.
            </span>
          </>
        ) : (
          <>
            You&rsquo;re <span className="font-medium">{formatPrice(remainingCents)}</span>{" "}
            from a complimentary <span className="font-medium">{GIFT_NAME}</span>
          </>
        )}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#E7E2D2]">
        <div
          className="h-full rounded-full bg-[#3E4A30] transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
