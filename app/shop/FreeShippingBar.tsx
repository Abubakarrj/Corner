import { formatPrice, FREE_SHIPPING_THRESHOLD_CENTS } from "./products";

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

// The basket drawer's free-shipping nudge, modeled on the reference
// concierge cart's progress bar ("You are $86.00 away from FREE
// SHIPPING"). Pure presentation over the cart's own subtotal — no new
// state, no separate threshold tracking beyond the one constant.
export default function FreeShippingBar({ subtotalCents }: { subtotalCents: number }) {
  const remainingCents = FREE_SHIPPING_THRESHOLD_CENTS - subtotalCents;
  const unlocked = remainingCents <= 0;
  const progress = Math.min(100, (subtotalCents / FREE_SHIPPING_THRESHOLD_CENTS) * 100);

  return (
    <div className="border-b border-[#E7E2D2] px-6 py-4">
      <p className="mb-2 flex items-center gap-1.5 text-[12px] text-[#3E4A30]">
        {unlocked ? (
          <>
            <CheckIcon />
            <span className="font-medium">You&rsquo;ve unlocked free shipping!</span>
          </>
        ) : (
          <>
            You&rsquo;re{" "}
            <span className="font-medium">{formatPrice(remainingCents)}</span> away from{" "}
            <span className="font-medium">free shipping</span>
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
