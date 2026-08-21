"use client";

import { useEffect, useState } from "react";

// Square's Web Payments SDK: the parts every payment method needs.
//
// ——— Why this was pulled out of useSquareCard ———
//
// The card fields and Apple Pay are two payment methods on one SDK. Both need
// the same three things — the shop's configuration, the script, and a
// `payments` instance built from the application and location ids — and only
// after that do they diverge into "mount two iframes" and "open a sheet".
//
// They were all inside useSquareCard, reachable only from the effect that
// mounts the card container. That container exists only once somebody selects
// the card tender, so an Apple Pay button would have had to wait for a form it
// is an alternative to. Hence this file: the shared half, with no opinion about
// what is being paid with.
//
// ⚠️ Nothing here touches a card number, and there is no shape in this file
// that could hold one. See the note at the top of useSquareCard.ts for why the
// number lives in Square's own iframes and what that buys.

export type SquareConfig = {
  provider: "square" | null;
  applicationId?: string;
  locationId?: string;
  environment?: "sandbox" | "production";
};

/** What `Square.payments()` hands back. Only the parts this app calls. */
export type SquarePayments = {
  card: (options?: { style?: Record<string, Record<string, string>> }) => Promise<SquareCard>;
  /** The amount and currency a wallet sheet shows. Built before the sheet is
   *  opened, because Apple's sheet is summoned by a tap and cannot go away and
   *  ask a server what the total is. */
  paymentRequest: (details: PaymentRequestDetails) => PaymentRequest;
  /** Throws when Apple Pay cannot be offered — the wrong browser, no card in
   *  the Wallet, an unverified domain. Callers treat a throw as "not
   *  available" rather than as an error worth showing. */
  applePay: (request: PaymentRequest) => Promise<SquareWallet>;
  verifyBuyer: (token: string, details: unknown) => Promise<{ token?: string } | null>;
};

export type PaymentRequestDetails = {
  countryCode: string;
  currencyCode: string;
  total: { amount: string; label: string };
};

export type PaymentRequest = object;

/** A wallet payment method. No `attach` — Apple requires its own button, drawn
 *  to Apple's rules, and `tokenize()` is what opens the sheet. */
export type SquareWallet = {
  tokenize: () => Promise<TokenizeResult>;
  destroy?: () => Promise<void>;
};

export type TokenizeResult = {
  status: string;
  token?: string;
  errors?: { message?: string }[];
  details?: { card?: { brand?: string; last4?: string } };
};

export type SquareCard = {
  attach: (selector: string | HTMLElement) => Promise<void>;
  tokenize: () => Promise<TokenizeResult>;
  destroy?: () => Promise<void>;
};

declare global {
  interface Window {
    Square?: { payments: (appId: string, locationId: string) => SquarePayments };
  }
}

export function scriptFor(environment: "sandbox" | "production"): string {
  return environment === "production"
    ? "https://web.squarecdn.com/v1/square.js"
    : "https://sandbox.web.squarecdn.com/v1/square.js";
}

/** Load Square's SDK once per page, however many times this is called. */
export function loadSdk(src: string): Promise<void> {
  if (window.Square) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("square-sdk-failed")));
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("square-sdk-failed"));
    document.head.appendChild(script);
  });
}

/** Whether this shop charges cards, and with what.
 *
 *  `error` is a broken page rather than "no card payments": an unreachable
 *  config must not silently become a checkout that takes an order without
 *  taking the money. */
export function useSquareConfig(): { config: SquareConfig | null; error: string | null } {
  const [config, setConfig] = useState<SquareConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/payments-config")
      .then((response) => (response.ok ? response.json() : { provider: null }))
      .then((answer: SquareConfig) => {
        if (!cancelled) setConfig(answer);
      })
      .catch(() => {
        if (!cancelled) setError("config");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { config, error };
}

/** The `payments` instance, or null when this shop has no processor.
 *
 *  ⚠️ Throws on a mismatched application and location id — they must come from
 *  the same Square account — which is the same misconfiguration that makes the
 *  server's calls come back FORBIDDEN. Callers catch and say so out loud; from
 *  the outside every failure here looks like an empty box. */
export async function paymentsFor(config: SquareConfig): Promise<SquarePayments | null> {
  if (config.provider !== "square" || !config.applicationId || !config.locationId) return null;
  await loadSdk(scriptFor(config.environment ?? "sandbox"));
  if (!window.Square) return null;
  return window.Square.payments(config.applicationId, config.locationId);
}
