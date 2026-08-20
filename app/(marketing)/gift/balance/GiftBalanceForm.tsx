"use client";

import { useState } from "react";
import Link from "next/link";
import { formatPrice } from "../../../shop/products";
import { ButtonLink, Button } from "../../../ui/Button";
import { PALETTE, SHOP_FONT } from "../../../shop/shopControls";
import { useServerText, useT } from "../../../i18n";

const { cream } = PALETTE;

// Checking what is left on a gift card.
//
// ——— Why this screen exists at all ———
//
// "Redeem now" used to open a sheet asking somebody to sign in and then stop,
// because reading a balance needed a gift card API this app did not have. It
// has one now, and this is the door.
//
// ——— ⚠️ The number is money ———
//
// Everything about how this behaves follows from that:
//
//   · POSTed, never in the URL. A number in a query string is a number in the
//     browser's history, in an access log, and in a referer header on the way
//     to the next page.
//
//   · not remembered. No localStorage, no sessionStorage, no autoComplete —
//     the field is deliberately not a saved-password field or an address one,
//     because a shared phone is exactly how a card gets spent by the wrong
//     person.
//
//   · a wrong number and a number nobody has read identically, and that is the
//     server's doing rather than this screen's. Saying which would tell
//     somebody guessing that they were close.
//
// ——— What this does not do ———
//
// It does not spend anything. Where a card is spent is at the counter, where
// the till reads it, or at the checkout — this screen is the answer to "is
// there anything left on this", which is the question somebody actually holding
// a card asks.

export default function GiftBalanceForm() {
  const t = useT();
  // The API answers with string keys rather than sentences — see serverText().
  const st = useServerText();

  const [gan, setGan] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Digits are what a card is. Everything else is how somebody typed it — the
  // message it arrived in groups them in fours, so they will be typed that way.
  const digits = gan.replace(/\D/g, "");
  const ready = digits.length >= 8 && !checking;

  async function check(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setChecking(true);
    setError(null);
    setBalance(null);
    try {
      const response = await fetch("/api/gift-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gan: digits }),
      });
      const body = (await response.json().catch(() => null)) as
        | { balanceCents?: number; error?: string }
        | null;
      if (!response.ok || typeof body?.balanceCents !== "number") {
        throw new Error(body?.error ?? "gift.cardNotFound");
      }
      setBalance(body.balanceCents);
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "gift.cardNotFound");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div style={{ backgroundColor: cream, fontFamily: SHOP_FONT }}>
      <div className="mx-auto max-w-md px-5 pb-12 pt-6">
        <Link
          href="/gift"
          className="cb-press inline-block cursor-pointer text-[13px] text-muted underline hover:text-ink"
        >
          ← {t("gift.allDesigns")}
        </Link>

        <h1 className="m-0 mt-4 text-center text-[22px] font-medium leading-tight tracking-[-0.01em] text-ink">
          {t("gift.balanceTitle")}
        </h1>
        <p className="m-0 mx-auto mt-2 max-w-xs text-center text-[14px] leading-[1.5] text-muted">
          {t("gift.balanceLede")}
        </p>

        <form onSubmit={check} noValidate className="mt-6">
          <input
            // Numeric, because a gift card is digits and a phone keyboard
            // should say so. Not type="number" — that brings spinners and
            // strips the spacing people type.
            type="text"
            inputMode="numeric"
            // ⚠️ Off. A card number remembered by a shared browser is a card
            // somebody else can spend.
            autoComplete="off"
            aria-label={t("gift.cardNumber")}
            placeholder={t("gift.cardNumberHint")}
            value={gan}
            onChange={(event) => setGan(event.target.value)}
            aria-invalid={error ? true : undefined}
            className={`w-full rounded-xl border bg-surface px-4 py-3 text-[16px] tracking-[0.06em] text-ink outline-none transition-colors placeholder:text-quieter focus:border-ink ${
              error ? "border-brand-red" : "border-line-soft"
            }`}
          />

          <Button type="submit" block className="mt-4" disabled={!ready}>
            {checking ? t("gift.checking") : t("gift.checkBalance")}
          </Button>
        </form>

        {error ? (
          <p role="alert" className="m-0 mt-4 text-center text-[13px] text-brand-red">
            {st(error)}
          </p>
        ) : null}

        {balance !== null ? (
          <div className="cb-rise mt-6 rounded-2xl border border-line-soft p-5 text-center">
            <p className="m-0 text-[12px] uppercase tracking-[0.08em] text-quiet">
              {t("gift.balanceOnCard")}
            </p>
            <p className="m-0 mt-1 text-[30px] font-medium leading-none text-ink">
              {formatPrice(balance)}
            </p>
            {/* A card with nothing on it is not an error and should not read
                like one. It is a card that has been spent, which is what a gift
                card is for. */}
            <p className="m-0 mt-3 text-[12px] leading-[1.6] text-quiet">
              {balance > 0 ? t("gift.spendItAnywhere") : t("gift.balanceSpent")}
            </p>
          </div>
        ) : null}

        {balance !== null && balance > 0 ? (
          <ButtonLink href="/shop" className="mt-5 w-full">
            {t("common.backToMenu")}
          </ButtonLink>
        ) : null}

        <p className="m-0 mt-8 text-center text-[12px] leading-[1.6] text-quiet">
          {t("gift.balancePrivacy")}
        </p>
      </div>
    </div>
  );
}
