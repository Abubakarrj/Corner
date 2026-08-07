"use client";

import { useT } from "../i18n";
import { useMenu } from "../i18n/menu";
import { useCapabilities } from "../capabilities";
import { formatPrice } from "./products";
import { Button } from "../ui/Button";
import { Check, Disclosure, Field, Money } from "./checkout/CheckoutSections";
import PaymentSection from "./checkout/PaymentSection";
import TipPicker from "./checkout/TipPicker";
import type { Checkout } from "./checkout/useCheckout";

// Checkout, inside the chat panel.
//
// The whole point of this file is what it *doesn't* contain: no totals
// arithmetic, no validation, no fetch, no order record. It takes a Checkout —
// the same object /shop/checkout renders — and draws it at the panel's scale.
// Everything that decides what is owed and whether it can be ordered lives in
// useCheckout, so ordering through Riley and ordering through the page cannot
// come out differently.
//
// Riley does not reach this. She can put things in the basket and offer the
// button that opens this sheet; the submit below is a person pressing a
// button, and what it calls is plain code. See the note at the top of
// useCheckout.ts.
export default function ChatCheckout({
  checkout,
  onBack,
}: {
  checkout: Checkout;
  onBack: () => void;
}) {
  const t = useT();
  const menu = useMenu();
  const { payments } = useCapabilities();

  const {
    rows,
    itemCount,
    totals,
    incomplete,
    unavailable,
    where,
    isDelivery,
    quote,
    quoteError,
    quoting,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    email,
    setEmail,
    phone,
    setPhone,
    firstNameError,
    emailError,
    curbside,
    setCurbside,
    utensils,
    setUtensils,
    note,
    setNote,
    tipCents,
    setTipCents,
    tender,
    setTender,
    subtotalCents,
    status,
    error,
  } = checkout;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void checkout.submit();
      }}
      className="flex flex-col gap-4 px-3.5 py-3.5"
    >
      {/* Where it's going, stated rather than editable. Changing it means
          changing the whole order's shape — pickup counter, delivery address,
          catering kitchen — and that belongs on the map, not in a line of a
          sheet. */}
      {where ? (
        <p className="m-0 text-[11px] uppercase tracking-[0.07em] text-hint">
          {t(where.mode)} · {where.where}
        </p>
      ) : null}

      {/* Collapsed by default, as in the reference: the summary line and the
          total are the two things worth seeing at a glance, and the lines
          underneath are for checking rather than reading. */}
      <Disclosure
        summary={
          <span className="flex w-full items-center justify-between gap-3">
            <span>
              {itemCount === 1
                ? t("checkout.itemCountOne")
                : t("checkout.itemCount", { count: itemCount })}
            </span>
            <span className="font-medium tabular-nums">{formatPrice(totals.totalCents)}</span>
          </span>
        }
      >
        <div className="flex flex-col divide-y divide-line-faint">
          {rows.map(({ line, product, key, lineCents }) => (
            <div key={key} className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0 text-[13px] text-ink">
                {menu.name(product)}{" "}
                <span className="text-quiet">×{line.quantity}</span>
                {menu.options(product, line.options).length > 0 ? (
                  <span className="mt-0.5 block text-[11px] text-muted">
                    {menu.options(product, line.options).join(" · ")}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-[13px] tabular-nums text-ink">
                {formatPrice(lineCents)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-2 border-t border-line pt-2">
          <Money label={t("common.subtotal")} amount={formatPrice(subtotalCents)} />
          <Money label={t("checkout.tax")} amount={formatPrice(totals.taxCents)} />
          {totals.deliveryCents > 0 ? (
            <Money label={t("checkout.delivery")} amount={formatPrice(totals.deliveryCents)} />
          ) : null}
          {totals.tipCents > 0 ? (
            <Money label={t("checkout.tip")} amount={formatPrice(totals.tipCents)} />
          ) : null}
        </div>
      </Disclosure>

      {/* The rows the endpoint would refuse. Said here rather than at the
          button, because the fix is in the basket and this is the last screen
          that can point at it. */}
      {unavailable.length > 0 ? (
        <p role="alert" className="m-0 text-[11px] text-brand-red">
          {t("checkout.soldOutLine", { name: menu.name(unavailable[0].product) })}
        </p>
      ) : null}
      {incomplete.length > 0 ? (
        <p role="alert" className="m-0 text-[11px] text-brand-red">
          {t("checkout.needsOptionsLine", { name: menu.name(incomplete[0].product) })}
        </p>
      ) : null}

      <div className="flex flex-col gap-2.5">
        <Field
          label={t("checkout.firstName")}
          value={firstName}
          onChange={setFirstName}
          autoComplete="given-name"
          required
          error={firstNameError}
        />
        <Field
          label={t("checkout.lastName")}
          value={lastName}
          onChange={setLastName}
          autoComplete="family-name"
        />
        <Field
          label={t("checkout.email")}
          value={email}
          onChange={setEmail}
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          error={emailError}
        />
        <Field
          label={t("checkout.phone")}
          value={phone}
          onChange={setPhone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
        />
      </div>

      {/* The note, the utensils and the kerbside pickup. Folded away because
          most orders don't want any of them, but present — Riley tells people
          to put "no onion" in the note, and a sheet that doesn't have one
          would make a liar of her. */}
      <Disclosure summary={t("checkout.anythingElse")}>
        <div className="flex flex-col gap-2.5">
          <label className="block">
            <span className="mb-1 block text-[12px] text-muted">
              {t("checkout.noteForKitchen")}
            </span>
            <textarea
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("checkout.notePlaceholder")}
              className="w-full resize-none rounded-xl border border-line-soft bg-surface px-3 py-2 text-[16px] text-ink outline-none transition-colors placeholder:text-quieter focus:border-ink sm:text-[13px]"
            />
          </label>

          <Check
            label={t("checkout.utensilsLabel")}
            hint={t("checkout.utensilsHint")}
            checked={utensils}
            onChange={setUtensils}
          />
          {!isDelivery ? (
            <Check
              label={t("checkout.curbsidePickup")}
              hint={t("checkout.curbsideHint")}
              checked={curbside}
              onChange={setCurbside}
            />
          ) : null}
        </div>
      </Disclosure>

      <div>
        <p className="mb-2 text-[12px] text-muted">{t("checkout.addTip")}</p>
        <TipPicker subtotalCents={subtotalCents} tipCents={tipCents} onTip={setTipCents} />
      </div>

      <div>
        <p className="mb-2 text-[12px] text-muted">{t("checkout.payment")}</p>
        <PaymentSection tender={tender} onTender={setTender} cardEnabled={payments} />
      </div>

      {/* A delivery can't be placed until the courier has priced it — placing
          it anyway promises a delivery nobody agreed to make. */}
      {isDelivery && quoting ? (
        <p className="m-0 text-[11px] text-muted">{t("checkout.quotingDelivery")}</p>
      ) : null}
      {quoteError ? (
        <p role="alert" className="m-0 text-[11px] text-brand-red">
          {quoteError}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="m-0 text-[11px] text-brand-red">
          {error}
        </p>
      ) : null}

      <Button type="submit" block disabled={status === "sending"}>
        {status === "sending"
          ? t("checkout.placingOrder")
          : isDelivery && quote === null
            ? quoteError
              ? t("checkout.deliveryUnavailable")
              : t("checkout.pricingDelivery")
            : t("checkout.placeOrderWith", { total: formatPrice(totals.totalCents) })}
      </Button>

      <button
        type="button"
        onClick={onBack}
        className="cb-press mx-auto cursor-pointer text-[12px] text-muted underline transition-opacity hover:opacity-70"
      >
        {t("chat.backToChat")}
      </button>
    </form>
  );
}
