"use client";

import { useId } from "react";
import { useT } from "../../i18n";
import { BRAND_LABEL, cvcDigits, type CardBrand } from "./card";
import type { CardEntry } from "./useCard";
import type { SquareCardEntry } from "./useSquareCard";

// Card number, expiry, CVC — the shape from the reference.
//
// The number in these boxes stays in the browser. See the note at the top of
// card.ts for why, and for the one function that would change if a processor
// were wired up.
//
// Everything here is a real card field rather than a text input that looks
// like one: inputMode="numeric" brings up the number pad, the autocomplete
// tokens are the ones browsers and password managers actually recognise
// (cc-number / cc-exp / cc-csc), the spaces appear as you type, and the CVC
// length follows the brand — three digits, four on an Amex. Half-built card
// forms are how people end up typing their number into a field that then
// refuses it.

const FIELD =
  "w-full rounded-xl border bg-surface px-3.5 py-3 text-[16px] tabular-nums text-ink outline-none transition-colors placeholder:text-quieter focus:border-ink";

function CardIcon({ brand }: { brand: CardBrand }) {
  // The stripe takes the brand's colour once there is one to take. Not a logo:
  // card marks are trademarked artwork with usage rules, and this only has to
  // say "we know what you're typing".
  const stripe =
    brand === "visa"
      ? "#1a1f71"
      : brand === "mastercard"
        ? "#eb001b"
        : brand === "amex"
          ? "#2e77bc"
          : brand === "discover"
            ? "#f76b1c"
            : "currentColor";
  return (
    <svg width="22" height="15" viewBox="0 0 22 15" fill="none" aria-hidden>
      <rect
        x="0.7"
        y="0.7"
        width="20.6"
        height="13.6"
        rx="2.4"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.45"
      />
      <rect x="0.7" y="3.9" width="20.6" height="2.6" fill={stripe} opacity="0.9" />
    </svg>
  );
}

function Line({
  label,
  error,
  children,
  htmlFor,
  className = "",
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  /** Absent for Square's hosted fields, whose input lives in an iframe this
   *  document cannot address. A <label for> pointing at an id that is not in
   *  the page is worse than no association at all: a screen reader follows it
   *  and lands nowhere. So the label is rendered as plain text in that case,
   *  and the field inside carries its own labelling from Square. */
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="mb-1 block text-[12px] text-muted">
          {label}
        </label>
      ) : (
        <span className="mb-1 block text-[12px] text-muted">{label}</span>
      )}
      {children}
      {error ? (
        <p role="alert" className="m-0 mt-1 text-[12px] text-brand-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function CardFields({
  card,
  hosted,
}: {
  card: CardEntry;
  hosted?: SquareCardEntry;
}) {
  const t = useT();
  const base = useId();
  const numberId = `${base}-number`;
  const expiryId = `${base}-expiry`;
  const cvcId = `${base}-cvc`;

  // ——— Square's fields, when this shop charges cards ———
  //
  // Returned before the local inputs rather than alongside them, and that is
  // the point: when a real charge is going to happen there must be exactly one
  // place on the page a card number can be typed, and it must not be ours. The
  // boxes below are Square's own document inside iframes. This page cannot read
  // what is typed into them, which is a stronger guarantee than our promise not
  // to, and it is what keeps a PAN out of this deployment altogether.
  // Pulled apart rather than read through `hosted` in the JSX below, so the two
  // state values that drive this render are plainly state and the mount is
  // plainly a callback ref. `hostedMount` is called by React when the container
  // attaches, which is what starts Square mounting its fields — this component
  // renders only once the card tender is selected, so that attach happens long
  // after the config arrives. See the note on mountRef in useSquareCard.ts.
  const hostedReady = hosted?.ready ?? false;
  const hostedError = hosted?.error ?? null;
  const hostedMount = hosted?.mountRef;

  if (hosted?.enabled) {
    return (
      <div className="flex flex-col gap-3">
        <Line label={t("checkout.cardNumber")} error={undefined}>
          {/* No border and no background of our own. Square draws the field's
              frame itself, from this page's own tokens — see fieldStyle() in
              useSquareCard.ts — and a wrapper with its own border would put a
              second box around the first, which is exactly what it used to do.
              The min height holds the space while the iframes load, because a
              form that jumps as it finishes loading is a form somebody taps the
              wrong part of. */}
          <div ref={hostedMount} className="min-h-[52px]" />
        </Line>

        {/* Loading and broken are different, and the difference matters: one
            resolves on its own and the other never will. Saying "just a moment"
            about a field that failed to load is how somebody waits at a
            checkout that is never going to work. */}
        {hostedError ? (
          <p className="m-0 text-[11px] text-brand-red">{t("checkout.cardNotAccepted")}</p>
        ) : !hostedReady ? (
          <p className="m-0 text-[11px] text-quiet">{t("checkout.cardLoading")}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Line label={t("checkout.cardNumber")} error={card.numberError} htmlFor={numberId}>
        <div className="relative">
          <input
            id={numberId}
            type="text"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="4242 4242 4242 4242"
            value={card.number}
            aria-invalid={card.numberError ? true : undefined}
            onChange={(event) => card.setNumber(event.target.value)}
            className={`${FIELD} pr-11 ${card.numberError ? "border-brand-red" : "border-line-soft"}`}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-muted">
            <CardIcon brand={card.brand} />
          </span>
        </div>
      </Line>

      <div className="grid grid-cols-2 gap-3">
        <Line label={t("checkout.cardExpiry")} error={card.expiryError} htmlFor={expiryId}>
          <input
            id={expiryId}
            type="text"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="12/28"
            value={card.expiry}
            aria-invalid={card.expiryError ? true : undefined}
            onChange={(event) => card.setExpiry(event.target.value)}
            className={`${FIELD} ${card.expiryError ? "border-brand-red" : "border-line-soft"}`}
          />
        </Line>

        <Line label={t("checkout.cardCvc")} error={card.cvcError} htmlFor={cvcId}>
          <input
            id={cvcId}
            type="text"
            inputMode="numeric"
            autoComplete="cc-csc"
            // The placeholder is the expected length, which on an Amex is the
            // thing people get wrong.
            placeholder={"1234".slice(0, cvcDigits(card.brand))}
            value={card.cvc}
            aria-invalid={card.cvcError ? true : undefined}
            onChange={(event) => card.setCvc(event.target.value)}
            className={`${FIELD} ${card.cvcError ? "border-brand-red" : "border-line-soft"}`}
          />
        </Line>
      </div>

      {/* The brand, named, once it's known. A stripe that changed colour is a
          detail somebody might not notice; this is the confirmation that the
          form read the number the way they meant it. */}
      {card.brand !== "unknown" ? (
        <p className="m-0 text-[11px] text-quiet">{BRAND_LABEL[card.brand]}</p>
      ) : null}
    </div>
  );
}
