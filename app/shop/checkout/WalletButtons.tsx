"use client";

import { useT } from "../../i18n";

// Apple Pay and Google Pay, above the card fields.
//
// ——— ⚠️ Why the two are not one component ———
//
// They are opposite requirements, not variations on one.
//
// Apple forbid a merchant drawing their own control for the sheet: the button
// must be Apple's, in one of their treatments, at their proportions, with their
// clear space. Square's `applePay` has no `attach` for exactly that reason —
// the merchant supplies the button. Safari also ships `-apple-pay-button` as a
// real CSS appearance, which is the platform drawing the button itself, so
// that is what this uses.
//
// Google do the reverse. `googlePay.attach(node)` renders Google's own button
// into a node this app hands over, and this app must not draw one — so the
// Google half of this file is an empty div and nothing else.
//
// Both are deliberately the least Corner Bagel things on the checkout. They do
// not use the app's Button, do not take the shop's ink, and do not get a
// shop-shaped radius, because a wallet button people do not instantly
// recognise is a wallet button people do not press.
//
// ——— They are additions, never replacements ———
//
// These sit inside the pay-now tender, above the card fields, with an "or"
// between. Whoever has a wallet taps it; whoever does not types their number
// exactly as before, and Place order below is still their button. Nothing here
// takes an option away from anybody.

// ⚠️ Four scalars rather than the two WalletEntry objects they come from, and
// that is not a style preference. React's lint rules treat every value read out
// of an object that also supplies a `ref` as "a ref accessed during render", so
// `google.attach` on the div below poisons `google.available` beside it and
// everything derived from it. Splitting them at the prop boundary is the fix
// that keeps the rule on — and the rule is worth keeping on, because the thing
// it usually catches is real.
export default function WalletButtons({
  appleReady,
  googleReady,
  googleAttach,
  onPay,
}: {
  appleReady: boolean;
  googleReady: boolean;
  /** Where Google draws its button. */
  googleAttach: (node: HTMLDivElement | null) => void;
  /** Place the order through the wallet that was tapped.
   *
   *  ⚠️ Called straight from the press with nothing awaited on the way. Both
   *  wallets only open their sheet inside a user gesture, and an await between
   *  the tap and tokenize() spends it. See useSquareWallet. */
  onPay: (via: "apple" | "google") => void;
}) {
  const t = useT();

  // ⚠️ Google's container is rendered whether or not Google Pay turns out to be
  // available, because Square cannot attach — and so cannot tell us it is
  // available — until the node exists. It is `hidden` until the answer comes
  // back, which is why this is not simply `available && <div/>`: that condition
  // could never become true.
  const anything = appleReady || googleReady;

  return (
    <div className="flex flex-col gap-2">
      {appleReady ? (
        <>
          {/* Scoped by the class, not global. `-apple-pay-button` is Safari's
              own rendering: the correct wordmark in the correct proportions,
              drawn by the platform rather than approximated by us. The block is
              inert everywhere it is not supported.

              ⚠️ 48px, comfortably over both Apple's floor for this button and
              the app's own 44px tap target — see .cb-tap in globals.css. */}
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
            /* ⚠️ Anywhere the platform appearance does not exist, the rule
               above leaves a 48px button with no background and no text: an
               invisible control, which is worse than a wrong-looking one. In
               practice this is unreachable — Apple Pay is only ever available
               where the appearance is — but "unreachable" and "invisible if
               reached" is a bad pair to leave in a payment step. Apple's shape
               and colour rather than the shop's, for the same reason as
               above. */
            @supports not (-webkit-appearance: -apple-pay-button) {
              .cb-applepay {
                -webkit-appearance: none;
                appearance: none;
                background: #000;
                color: #fff;
                border: 0;
                font-size: 15px;
                font-weight: 500;
              }
              .cb-applepay::after { content: " Pay"; }
            }
          `}</style>
          <button
            type="button"
            onClick={() => onPay("apple")}
            // The platform button draws its own wordmark and takes no text, so
            // the accessible name has to be given rather than read out of the
            // element.
            aria-label={t("checkout.payWithApplePay")}
            className="cb-applepay"
          />
        </>
      ) : null}

      {/* Google's own button lands in here. Empty on purpose: anything this
          file draws inside it would be drawn over. */}
      <div
        ref={googleAttach}
        onClick={() => onPay("google")}
        hidden={!googleReady}
        className="w-full [&>*]:w-full"
      />

      {/* The seam between tapping and typing. Only when there is something to
          be an alternative *to* — with no wallet on offer the card fields are
          not "the other way", they are the only way, and an "or" over them
          would be a sentence about a choice nobody was given. */}
      {anything ? (
        <div className="my-1 flex items-center gap-3">
          <span aria-hidden className="h-px flex-1 bg-line-soft" />
          <span className="text-[11px] uppercase tracking-[0.08em] text-quiet">
            {t("checkout.orTypeCard")}
          </span>
          <span aria-hidden className="h-px flex-1 bg-line-soft" />
        </div>
      ) : null}
    </div>
  );
}
