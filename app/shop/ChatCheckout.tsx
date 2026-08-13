"use client";

import { useT } from "../i18n";
import { useMenu } from "../i18n/menu";
import { useCapabilities } from "../capabilities";
import { formatPrice } from "./products";
import { Button } from "../ui/Button";
import { Check, Disclosure, Field } from "./checkout/CheckoutSections";
import OrderSummary from "./checkout/OrderSummary";
import SecureNote from "./checkout/SecureNote";
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
// come out differently. Both surfaces now walk the same two steps, too.
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
    step,
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
        if (step === "details") checkout.continueToPayment();
        else void checkout.submit();
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

      <OrderSummary checkout={checkout} />

      {/* The rows the endpoint would refuse. Said on the first step, because
          the fix is in the basket and this is the last screen that can point
          at it. */}
      {step === "details" && unavailable.length > 0 ? (
        <p role="alert" className="m-0 text-[11px] text-brand-red">
          {t("checkout.soldOutLine", { name: menu.name(unavailable[0].product) })}
        </p>
      ) : null}
      {step === "details" && incomplete.length > 0 ? (
        <p role="alert" className="m-0 text-[11px] text-brand-red">
          {t("checkout.needsOptionsLine", { name: menu.name(incomplete[0].product) })}
        </p>
      ) : null}

      {step === "details" ? (
        <>
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
              label={t("checkout.phone")}
              value={phone}
              onChange={setPhone}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
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
          </div>

          {/* What the courier needs, at the sheet's scale. Present rather than
              left to the page, because the two surfaces run the same hook and
              submit the same body: if only the page asked for the unit, an
              order placed through Riley would reach a forty-unit block with a
              street number and nothing else. The driver's free-text note is
              the page's alone — this is the half that decides whether the bag
              arrives at all. */}
          {isDelivery ? (
            <div className="flex flex-col gap-2.5">
              <Field
                label={t("delivery.unit")}
                value={checkout.deliveryDetail}
                onChange={checkout.setDeliveryDetail}
                autoComplete="address-line2"
              />
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["hand", "delivery.handToMe"],
                    ["door", "delivery.leaveAtDoor"],
                  ] as const
                ).map(([value, key]) => {
                  const on = checkout.handoff === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => checkout.setHandoff(value)}
                      aria-pressed={on}
                      className={`cb-press cursor-pointer rounded-xl border px-3 py-2 text-[12px] transition-colors ${
                        on
                          ? "border-ink bg-raise font-medium text-ink"
                          : "border-line-soft text-ink hover:bg-raise"
                      }`}
                    >
                      {t(key)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* The note, the utensils and the kerbside pickup. Folded away
              because most orders want none of them, but present — Riley tells
              people to put "no onion" in the note, and a sheet without one
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

          <Button type="submit" block>
            {t("checkout.continue")}
          </Button>
        </>
      ) : (
        <>
          {/* Payment, then the tip. The order matters: the tip changes the
              number on the button, so it has to come after the thing that
              number is for — and it's the last decision, not one made on the
              way past the card fields. Same order as the page. */}
          <div className="flex flex-col gap-2.5">
            <p className="m-0 text-[12px] text-muted">{t("checkout.payment")}</p>
            <PaymentSection
              tender={tender}
              onTender={setTender}
              cardEnabled={payments}
              card={checkout.card}
            />
            <SecureNote />
          </div>

          <div>
            <p className="mb-2 text-[12px] text-muted">{t("checkout.addTip")}</p>
            <TipPicker subtotalCents={subtotalCents} tipCents={tipCents} onTip={setTipCents} />
          </div>

          {/* A delivery can't be placed until the courier has priced it —
              placing it anyway promises a delivery nobody agreed to make. */}
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
                : t("checkout.placeOrderWith", {
                    total: formatPrice(totals.totalCents),
                  })}
          </Button>
        </>
      )}

      {/* One way back, and where it goes depends on how deep you are. From
          payment it's the details you just filled in; from details it's the
          conversation. A single "back to chat" from the payment step would
          throw away a filled form to answer one question. */}
      <button
        type="button"
        onClick={step === "payment" ? checkout.backToDetails : onBack}
        className="cb-press mx-auto cursor-pointer text-[12px] text-muted underline transition-opacity hover:opacity-70"
      >
        {step === "payment" ? t("common.back") : t("chat.backToChat")}
      </button>
    </form>
  );
}
