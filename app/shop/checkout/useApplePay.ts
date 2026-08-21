"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  paymentsFor,
  useSquareConfig,
  type SquarePayments,
  type SquareWallet,
} from "./squareSdk";
import type { TokenizedCard } from "./useSquareCard";

// Apple Pay, through Square's Web Payments SDK.
//
// ——— What this is and is not ———
//
// It is the same processor, the same account and the same single-use token as a
// typed card. Square hands back a token from `applePay.tokenize()` exactly as it
// does from `card.tokenize()`, /api/shop-order charges it the same way, and the
// order that comes out the other end is indistinguishable. Nothing about the
// money moves anywhere new.
//
// What it replaces is the typing. On a phone the card fields are sixteen digits,
// an expiry and a CVC entered one-handed, usually while standing up; Apple Pay
// is a look at a screen. That is the entire feature.
//
// ——— ⚠️ It appears only when it is genuinely going to work ———
//
// `payments.applePay()` throws when Apple Pay cannot be offered: not Safari, no
// card in the Wallet, an unverified domain, plain HTTP. This treats every one
// of those as "not available" and renders nothing at all, which is the only
// safe default — a wallet button that opens no sheet, or opens one that cannot
// complete, is worse on a payment step than no button, because the customer has
// already decided how they are paying by the time it fails.
//
// So there is no configuration flag to turn this on. It is on when Square says
// it is on, in the browser that is asking, and off everywhere else.
//
// ——— ⚠️ The domain has to be verified before any of this happens ———
//
// Apple will not let a site summon its sheet until the domain is registered
// and serving Apple's association file. Square issues the file; this app
// serves it at /.well-known/apple-developer-merchantid-domain-association from
// SQUARE_APPLE_PAY_DOMAIN_ASSOCIATION. Until that is in place `applePay()`
// throws and this hook stays quiet — which is correct, and is also why nobody
// will see a button appear merely because this code shipped.
//
// ——— The amount is baked into the sheet ———
//
// Apple's sheet shows a total, and that total is fixed when the payment request
// is built rather than when the sheet opens. A tip changes the total, so the
// request has to be rebuilt when it does — hence `amountCents` in the
// dependencies below. Getting this wrong is not cosmetic: the sheet would
// authorise one number while the order charged another.

export type ApplePayEntry = {
  /** Square said yes, in this browser, for this amount. Nothing renders
   *  otherwise. */
  available: boolean;
  /** Open Apple's sheet and take back a token.
   *
   *  ⚠️ Must be called from the tap itself. Safari only opens the sheet inside
   *  a user gesture, and an `await` before this one would spend it — which is
   *  why the payment method is built ahead of time in the effect below rather
   *  than on demand.
   *
   *  Null when the sheet was dismissed or the token was refused: an ordinary
   *  outcome, not an error, and the caller must not place the order. */
  tokenize: () => Promise<{ token: string; card: TokenizedCard } | null>;
};

const UNAVAILABLE: ApplePayEntry = {
  available: false,
  tokenize: async () => null,
};

export function useApplePay({
  amountCents,
  label,
  enabled,
}: {
  /** What the sheet will show, and what will be charged. */
  amountCents: number;
  /** The name beside the total on Apple's sheet. The shop, not the items. */
  label: string;
  /** False on a surface that is not asking to pay right now — there is no
   *  reason to build a payment sheet for a form nobody has reached. */
  enabled: boolean;
}): ApplePayEntry {
  const { config } = useSquareConfig();
  // Whether Square handed back a working payment method. Kept apart from
  // `available` below because there are two different reasons to have no
  // wallet, and only one of them is a fact about the browser: `ready` is
  // Square's answer, and the rest is derived from what this screen is asking
  // for. Deriving rather than storing also keeps the effect free of the
  // synchronous setState that would fire on every amount change.
  const [ready, setReady] = useState(false);
  const walletRef = useRef<SquareWallet | null>(null);
  const paymentsRef = useRef<SquarePayments | null>(null);

  // ⚠️ Zero is not an amount to authorise, and it happens for real: a gift card
  // that covers the whole order leaves nothing due, and Apple's sheet would be
  // a request to pay nothing. Alongside the step gate, because both are reasons
  // not to build a sheet rather than reasons the browser cannot.
  const usable = enabled && config !== null && amountCents > 0;

  useEffect(() => {
    if (!usable || !config) return;

    let cancelled = false;
    let built: SquareWallet | null = null;

    (async () => {
      try {
        const payments = paymentsRef.current ?? (await paymentsFor(config));
        if (cancelled || !payments) return;
        paymentsRef.current = payments;

        const request = payments.paymentRequest({
          countryCode: "US",
          currencyCode: "USD",
          // Square wants a decimal string, not cents. The same conversion the
          // card path does before verifyBuyer.
          total: { amount: (amountCents / 100).toFixed(2), label },
        });

        // ⚠️ The line that decides whether any of this is offered. It throws on
        // an unsupported browser, an empty Wallet, an unverified domain — all
        // ordinary, none of them worth a message.
        built = await payments.applePay(request);
        if (cancelled) {
          await built.destroy?.().catch(() => undefined);
          return;
        }
        walletRef.current = built;
        setReady(true);
      } catch {
        // Deliberately silent. Not being able to offer Apple Pay is the normal
        // case on most of the web's browsers, and a console full of it on every
        // Android checkout would bury the errors that do matter. The card
        // fields are right there and unaffected.
        if (!cancelled) setReady(false);
      }
    })();

    return () => {
      cancelled = true;
      walletRef.current = null;
      setReady(false);
      // Rebuilt on every amount change, so the old one has to go or the page
      // accumulates a payment method per tip tap.
      void built?.destroy?.().catch(() => undefined);
    };
  }, [config, amountCents, label, usable]);

  const tokenize = useCallback<ApplePayEntry["tokenize"]>(async () => {
    const wallet = walletRef.current;
    if (!wallet) return null;
    try {
      const result = await wallet.tokenize();
      if (result.status !== "OK" || !result.token) return null;
      // ⚠️ No verifyBuyer here, and that is not an omission. 3-D Secure is a
      // challenge for a card number typed by somebody who may not be holding
      // the card; Apple Pay has already authenticated the person with the
      // device, and the token carries that. Putting a second challenge in front
      // of a Face ID scan is asking twice.
      return {
        token: result.token,
        card: {
          brand: result.details?.card?.brand ?? null,
          last4: result.details?.card?.last4 ?? null,
        },
      };
    } catch {
      // Dismissing the sheet lands here, and dismissing is a decision rather
      // than a failure.
      return null;
    }
  }, []);

  // ⚠️ Both halves, every render. `ready` alone would keep saying yes for the
  // moment between a tip changing and the rebuilt sheet arriving — the window
  // in which the button would open a sheet for the old total.
  return ready && usable ? { available: true, tokenize } : UNAVAILABLE;
}
