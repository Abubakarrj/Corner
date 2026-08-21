"use client";

// The Apple Pay button.
//
// ——— ⚠️ Why this is a button of Apple's design and not one of ours ———
//
// Square's card fields hand back an element to attach; Apple Pay does not.
// `payments.applePay()` returns a payment method with no `attach()`, and the
// merchant is required to supply the button — drawn to Apple's Human Interface
// Guidelines, which specify the wordmark, the black or white treatment, the
// corner radius, the minimum height and the clear space around it. Apple can
// and does refuse merchants who redraw it as their own control.
//
// So this does not use the app's Button component, does not take the shop's
// ink colour, and does not get a shop-shaped radius. It is deliberately the
// least Corner Bagel thing on the checkout, because that is the requirement
// and because a wallet button people do not instantly recognise is a wallet
// button people do not press.
//
// Apple also ships `-apple-pay-button` as a real CSS appearance, which is the
// exact button rendered by the platform. It only exists in Safari — the only
// browser where any of this is offered — so it is used where it exists, with
// the drawn fallback below for anything else that somehow gets here.

import { useT } from "../../i18n";

export default function ApplePayButton({
  onPress,
  disabled,
}: {
  onPress: () => void;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <>
      {/* Scoped by the class, not global. `-apple-pay-button` is Safari's own
          rendering of the button: the correct wordmark in the correct
          proportions, drawn by the platform rather than approximated by us.
          The block is inert everywhere it is not supported.

          ⚠️ 44px minimum, which is both Apple's floor for this button and the
          app's own tap target — see .cb-tap in globals.css. */}
      <style>{`
        .cb-applepay {
          -webkit-appearance: -apple-pay-button;
          -apple-pay-button-type: pay;
          -apple-pay-button-style: black;
          width: 100%;
          height: 48px;
          border-radius: 999px;
          cursor: pointer;
        }
        @media (prefers-color-scheme: dark) {
          .cb-applepay { -apple-pay-button-style: white; }
        }
        /* Everything without the platform button: a black pill with the mark
           drawn below. Kept to Apple's shape and colour rather than the shop's.
           Unreachable in practice, since Apple Pay is only ever offered where
           the appearance exists, and here so the control is never invisible. */
        @supports not (-webkit-appearance: -apple-pay-button) {
          .cb-applepay {
            -webkit-appearance: none;
            appearance: none;
            background: #000;
            color: #fff;
            border: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
          }
        }
        @supports (-webkit-appearance: -apple-pay-button) {
          .cb-applepay > * { display: none; }
        }
      `}</style>
      <button
        type="button"
        onClick={onPress}
        disabled={disabled}
        // The platform button draws its own wordmark and takes no text, so the
        // accessible name has to be given rather than read out of the element.
        aria-label={t("checkout.payWithApplePay")}
        className="cb-applepay disabled:opacity-60"
      >
        <span aria-hidden className="flex items-center gap-1">
          <AppleMark />
          <span className="text-[15px] font-medium">Pay</span>
        </span>
      </button>
    </>
  );
}

/** The apple, for the fallback button only. Drawn from primitives here, in one
 *  flat colour, for the same reason the card marks are — see CardBrandMark. */
function AppleMark() {
  return (
    <svg width="14" height="17" viewBox="0 0 14 17" fill="none" aria-hidden>
      <path
        d="M11.4 9c0-1.7 1.4-2.5 1.4-2.6-.8-1.1-2-1.3-2.4-1.3-1-.1-2 .6-2.5.6-.5 0-1.3-.6-2.2-.6-1.1 0-2.2.7-2.8 1.7-1.2 2-.3 5 .8 6.6.6.8 1.2 1.7 2.1 1.7.9 0 1.2-.5 2.2-.5s1.3.5 2.2.5c.9 0 1.5-.8 2.1-1.6.7-.9.9-1.8.9-1.9 0 0-1.8-.7-1.8-2.6Z"
        fill="currentColor"
      />
      <path
        d="M9.8 3.8c.5-.6.8-1.4.7-2.2-.7 0-1.6.5-2.1 1.1-.4.5-.8 1.3-.7 2.1.8.1 1.6-.4 2.1-1Z"
        fill="currentColor"
      />
    </svg>
  );
}
