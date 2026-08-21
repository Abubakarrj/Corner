"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  paymentsFor,
  useSquareConfig,
  type SquareGooglePay,
  type SquarePayments,
  type SquareWallet,
} from "./squareSdk";
import type { TokenizedCard } from "./useSquareCard";

// Apple Pay and Google Pay, through Square's Web Payments SDK.
//
// ——— What these are and are not ———
//
// The same processor, the same account and the same single-use token as a typed
// card. Square hands one back from `applePay.tokenize()` and
// `googlePay.tokenize()` exactly as it does from `card.tokenize()`,
// /api/shop-order charges it the same way, and the order that comes out the
// other end is indistinguishable. Nothing about the money moves anywhere new.
//
// What they replace is the typing. On a phone the card fields are sixteen
// digits, an expiry and a CVC entered one-handed, usually while standing up;
// a wallet is a look at a screen. That is the entire feature, and it is why
// both sit above the card fields rather than instead of them — whoever has
// neither wallet types their number exactly as before.
//
// ——— One hook, because the hard part is identical ———
//
// The two differ in about four lines. What they share is everything that is
// easy to get wrong: rebuilding the payment request when the amount moves,
// tearing the old one down, refusing to be available during the rebuild, and
// staying silent when the browser cannot offer them. Two copies of that would
// be two places for the tip bug to live.
//
// ⚠️ Where they genuinely differ is the button, and it is not a detail:
//
//   · Apple forbid us drawing their sheet's trigger any way but theirs, and
//     Square's applePay has no `attach` — the merchant supplies the button.
//   · Google do the opposite: `googlePay.attach(node)` renders Google's own
//     button into a node this app provides.
//
// So the hook returns an `attach` that Google uses and Apple ignores, and
// WalletButtons.tsx renders the right shape for each.
//
// ——— ⚠️ They appear only when they are genuinely going to work ———
//
// `payments.applePay()` and `payments.googlePay()` throw when the wallet cannot
// be offered: the wrong browser, no card provisioned, an unverified domain,
// plain HTTP. Every one of those renders nothing at all, which is the only safe
// default — a wallet button that opens no sheet is worse on a payment step than
// no button, because by the time it fails the customer has already decided how
// they are paying.
//
// So there is no flag to force either on. They are on when Square says they are
// on, in the browser that is asking, and off everywhere else.
//
// ——— ⚠️ Apple Pay needs the domain verified first ———
//
// Apple will not summon their sheet until the domain is registered and serving
// Apple's association file. Square issues it; this app serves it at
// /.well-known/apple-developer-merchantid-domain-association from
// SQUARE_APPLE_PAY_DOMAIN_ASSOCIATION. Until that is in place `applePay()`
// throws and Apple's button stays away — correctly, and silently, which is why
// the reason is written down in that route rather than left to be rediscovered.
//
// Google Pay has no equivalent step through Square: the same Square
// application id covers it, so it turns up on Chrome as soon as the shop has a
// processor.
//
// ——— The amount is baked into the sheet ———
//
// A wallet sheet shows a total, and that total is fixed when the payment
// request is built rather than when the sheet opens. A tip changes the total,
// so the request has to be rebuilt when it does. Getting this wrong is not
// cosmetic: the sheet would authorise one number while the order charged
// another.

export type WalletKind = "apple" | "google";

export type WalletEntry = {
  /** Square said yes, in this browser, for this amount. Nothing renders
   *  otherwise. */
  available: boolean;
  /** Where Google draws its button. A no-op for Apple Pay, whose button is
   *  ours to render — see the note above.
   *
   *  Named `attach` rather than `mountRef`, which is what it was: React's lint
   *  rules read a `*Ref` property as a ref object and then refuse every value
   *  destructured beside it as "accessed during render". `attach` is also what
   *  Square call the same idea on their own payment methods. */
  attach: (node: HTMLDivElement | null) => void;
  /** Open the wallet's sheet and take back a token.
   *
   *  ⚠️ Must be called from the tap itself. Both wallets only open inside a
   *  user gesture, and an `await` before this one would spend it — which is why
   *  the payment method is built ahead of time in the effect below rather than
   *  on demand.
   *
   *  Null when the sheet was dismissed or the token was refused: an ordinary
   *  outcome, not an error, and the caller must not place the order. */
  tokenize: () => Promise<{ token: string; card: TokenizedCard } | null>;
};

const NO_MOUNT = () => {};

export function useSquareWallet(
  kind: WalletKind,
  {
    amountCents,
    label,
    enabled,
  }: {
    /** What the sheet will show, and what will be charged. */
    amountCents: number;
    /** The name beside the total on the sheet. The shop, not the items. */
    label: string;
    /** False on a surface that is not asking to pay right now — there is no
     *  reason to build a payment sheet for a form nobody has reached. */
    enabled: boolean;
  },
): WalletEntry {
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
  // State rather than a ref, so the container appearing re-runs the effect that
  // attaches into it. The same callback-ref lesson useSquareCard documents: the
  // node is created by a render that happens after the config arrives, and an
  // effect that only depends on the config would run once against nothing.
  const [mount, setMount] = useState<HTMLDivElement | null>(null);
  const attach = useCallback((node: HTMLDivElement | null) => setMount(node), []);

  // ⚠️ Zero is not an amount to authorise, and it happens for real: a gift card
  // that covers the whole order leaves nothing due, and a wallet sheet would be
  // a request to pay nothing. Alongside the step gate, because both are reasons
  // not to build a sheet rather than reasons the browser cannot.
  const usable = enabled && config !== null && amountCents > 0;
  // Google cannot be built before there is somewhere to put its button; Apple
  // has no button of Square's to place, so it must not wait for one.
  const waitingForNode = kind === "google" && mount === null;

  useEffect(() => {
    if (!usable || !config || waitingForNode) return;

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
        // an unsupported browser, an empty wallet, an unverified domain — all
        // ordinary, none of them worth a message.
        if (kind === "apple") {
          built = await payments.applePay(request);
        } else {
          const google: SquareGooglePay = await payments.googlePay(request);
          built = google;
          if (mount) {
            // Google draw the button; this only says where and roughly what
            // shape. `fill` so it matches the width of everything else in the
            // payment step rather than sitting at Google's default size.
            await google.attach(mount, {
              buttonColor: "black",
              buttonType: "pay",
              buttonSizeMode: "fill",
            });
          }
        }
        if (cancelled) {
          await built.destroy?.().catch(() => undefined);
          return;
        }
        walletRef.current = built;
        setReady(true);
      } catch {
        // Deliberately silent. Not being able to offer a wallet is the normal
        // case on most of the web's browsers, and a console line on every
        // checkout that cannot would bury the errors that do matter. The card
        // fields are right there and unaffected.
        if (!cancelled) setReady(false);
      }
    })();

    return () => {
      cancelled = true;
      walletRef.current = null;
      setReady(false);
      // Rebuilt on every amount change, so the old one has to go — otherwise
      // the page accumulates a payment method per tip tap, and Google stacks a
      // button per rebuild in the same node.
      void built?.destroy?.().catch(() => undefined);
    };
  }, [config, amountCents, label, usable, kind, mount, waitingForNode]);

  const tokenize = useCallback<WalletEntry["tokenize"]>(async () => {
    const wallet = walletRef.current;
    if (!wallet) return null;
    try {
      const result = await wallet.tokenize();
      if (result.status !== "OK" || !result.token) return null;
      // ⚠️ No verifyBuyer here, and that is not an omission. 3-D Secure is a
      // challenge for a card number typed by somebody who may not be holding
      // the card; a wallet has already authenticated the person with the
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
  //
  // `attach` is handed back either way, because Google's node has to exist
  // before Google can be asked whether it is available at all. That is the one
  // ordering this file cannot avoid: render the container, then find out.
  return ready && usable
    ? { available: true, attach, tokenize }
    : {
        available: false,
        attach: kind === "google" ? attach : NO_MOUNT,
        tokenize: async () => null,
      };
}
