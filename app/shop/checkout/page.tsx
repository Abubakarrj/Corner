"use client";

import { useLocale, useT } from "../../i18n";
import { localeById } from "../../localeScript";
import { useMenu } from "../../i18n/menu";
import Link from "next/link";
import { formatPrice } from "../products";
import { useOpening } from "../../useOpening";
import { CLOSE_HOUR, clockLabel, weekdayLabel } from "../../shopFacts";
import { useCapabilities } from "../../capabilities";
import { PREP_MINUTES } from "../../account";
import { Button } from "../../ui/Button";
import { DISPLAY_FONT } from "../shopControls";
import { Check, Disclosure, Field, Money, Section } from "./CheckoutSections";
import { useCheckout } from "./useCheckout";
import PurchaseComplete from "./PurchaseComplete";
import PaymentSection from "./PaymentSection";
import TipPicker from "./TipPicker";

// Checkout, in the order the reference asks for it: who you are, where it's
// going, what's in it, how you're paying, what you're adding, what it comes
// to. One column on a phone — a two-column checkout on a 430px screen is two
// half-width columns.

function readyAt(minutes: number): string {
  const when = new Date(Date.now() + minutes * 60_000);
  return when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function CheckoutPage() {
  const t = useT();
  const menu = useMenu();
  const tag = localeById(useLocale()).tag;
  const opening = useOpening();
  const { payments } = useCapabilities();

  // Everything this page *is* lives in useCheckout — the courier quote, the
  // validation, the submit, the order record. The chat panel's sheet runs the
  // same hook, which is the only thing keeping the two from quietly becoming
  // two different transactions. See the note at the top of useCheckout.ts.
  const checkout = useCheckout();
  const {
    rows,
    itemCount,
    subtotalCents,
    totals,
    incomplete,
    unavailable,
    where,
    isDelivery,
    quote,
    quoteError,
    fulfillment,
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
    status,
    error,
    placed,
  } = checkout;

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    void checkout.submit();
  }

  if (status === "placed") {
    // The recorded order's own totals, not the live ones. `totals` is derived
    // from the cart, and placing the order clears the cart — so reading it
    // here printed a $0.00 subtotal and a $0.00 tax under the tip, on the one
    // screen whose entire job is telling somebody what they owe. A
    // confirmation has to describe what happened, not recompute from state
    // that has since moved on.
    return <PurchaseComplete order={placed} where={where} tender={tender} />;
  }

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
        <p className="text-[14px] text-muted">{t("checkout.emptyBasket")}</p>
        <Link href="/shop" className="mt-3 inline-block cursor-pointer text-[14px] underline">
          {t("common.browseMenu")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-lg px-4 pb-10 pt-6 sm:px-6">
      <h1
        className="m-0 mb-6 text-[20px] font-medium text-ink"
        style={{ fontFamily: DISPLAY_FONT }}
      >
        Checkout
      </h1>

      <Section title={t("checkout.contact")}>
        <div className="flex flex-col gap-3">
          <Field
            label={t("checkout.email")}
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={setEmail}
            error={emailError}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={t("checkout.firstName")}
              autoComplete="given-name"
              required
              value={firstName}
              onChange={setFirstName}
              error={firstNameError}
            />
            <Field
              label={t("checkout.lastName")}
              autoComplete="family-name"
              value={lastName}
              onChange={setLastName}
            />
          </div>
          <Field
            label={t("checkout.phone")}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={setPhone}
          />
          <p className="m-0 text-[11px] leading-[1.5] text-quiet">
            We use these to reach you about this order. Nothing else.
          </p>
        </div>
      </Section>

      <Section
        title={isDelivery ? t("checkout.deliveryDetails") : t("checkout.pickupDetails")}
        aside={
          <Link
            href="/locations"
            className="cursor-pointer text-[13px] text-ink underline underline-offset-2"
          >
            {isDelivery ? t("checkout.switchToPickup") : t("checkout.switchToDelivery")}
          </Link>
        }
      >
        <div className="rounded-xl border border-line-soft">
          <div className="flex items-start gap-3 border-b border-line-faint p-4">
            <ClockIcon />
            <div className="min-w-0">
              <p className="m-0 text-[14px] text-ink">
                {/* On a delivery, the time is Uber's — it's their courier and
                    their estimate of the drive. On a pickup it's the
                    kitchen's prep time and nothing else. */}
                {isDelivery ? "Delivery" : "Pickup"} around{" "}
                {readyAt(isDelivery ? (quote?.etaMinutes ?? PREP_MINUTES) : PREP_MINUTES)}
              </p>
              {/* "Estimated" is doing real work here: nothing in this app can
                  see the kitchen, so this is arithmetic on the clock, and
                  saying otherwise would be a promise the shop didn't make. */}
              <p className="m-0 text-[12px] text-muted">
                {isDelivery && quote
                  ? t("checkout.estimatedCourier")
                  : t("checkout.estimatedShop")}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4">
            <PinIcon />
            <div className="min-w-0">
              <p className="m-0 text-[14px] text-ink">{where?.where ?? "Corner Bagel"}</p>
              {fulfillment && fulfillment.mode !== "delivery" ? (
                <p className="m-0 text-[12px] text-muted">{fulfillment.detail}</p>
              ) : null}
            </div>
          </div>

          {!isDelivery ? (
            <div className="border-t border-line-faint p-4">
              <Check
                checked={curbside}
                onChange={setCurbside}
                label={t("checkout.curbsidePickup")}
                hint={t("checkout.curbsideHint")}
              />
            </div>
          ) : null}
        </div>
      </Section>

      <Section title={t("checkout.orderDetails")}>
        <Disclosure
          summary={
            itemCount === 1
              ? t("checkout.itemCountOne")
              : t("checkout.itemCount", { count: itemCount })
          }
        >
          <div className="flex flex-col divide-y divide-line-faint">
            {rows.map(({ line, product, key, lineCents, chosen }) => (
              <div key={key} className="flex items-start justify-between gap-3 py-2.5">
                <span className="min-w-0 text-[14px] text-ink">
                  {menu.name(product)}{" "}
                  <span className="text-quiet">×{line.quantity}</span>
                  {chosen.length > 0 ? (
                    <span className="mt-0.5 block text-[12px] text-muted">
                      {menu.options(product, line.options).join(" · ")}
                    </span>
                  ) : null}
                </span>
                <span className="whitespace-nowrap text-[14px] text-ink">
                  {formatPrice(lineCents)}
                </span>
              </div>
            ))}
          </div>
          <Link
            href="/shop/cart"
            className="mt-3 inline-block cursor-pointer text-[13px] text-muted underline hover:text-ink"
          >
            {t("checkout.editBasket")}
          </Link>
        </Disclosure>

        {unavailable.length > 0 ? (
          <p role="alert" className="m-0 mt-3 text-[12px] text-brand-red">
            {t("checkout.soldOutLine", { name: menu.name(unavailable[0].product) })}{" "}
            <Link href="/shop/cart" className="cursor-pointer underline">
              {t("checkout.takeItOut")}
            </Link>
            .
          </p>
        ) : null}

        {incomplete.length > 0 ? (
          <p role="alert" className="m-0 mt-3 text-[12px] text-brand-red">
            {t("checkout.needsOptionsLine", { name: menu.name(incomplete[0].product) })}{" "}
            <Link href="/shop/cart" className="cursor-pointer underline">
              {t("checkout.chooseInBasket")}
            </Link>
            .
          </p>
        ) : null}
      </Section>

      {!opening.acceptingOrders ? (
        <div className="mb-6 rounded-2xl border border-line-soft bg-sun-soft px-4 py-3">
          <p className="m-0 text-[14px] font-medium text-sun-ink">
            {opening.open ? t("checkout.closingSoon") : t("checkout.closedNow")}
          </p>
          <p className="m-0 mt-1 text-[13px] leading-[1.5] text-sun-ink">
            {opening.open
              ? t("checkout.noTimeBefore", { time: clockLabel(CLOSE_HOUR, tag) })
              : opening.next
                ? t(
                    opening.next.when === "today"
                      ? "checkout.opensToday"
                      : opening.next.when === "tomorrow"
                        ? "checkout.opensTomorrow"
                        : "checkout.opensDay",
                    {
                      time: clockLabel(opening.next.hour, tag),
                      day: weekdayLabel(opening.next.day, tag),
                    },
                  )
                : t("checkout.basketKeeps")}
          </p>
        </div>
      ) : null}

      <Section title={t("checkout.payment")}>
        <PaymentSection tender={tender} onTender={setTender} cardEnabled={payments} />
      </Section>

      <Section title={t("checkout.addTip")}>
        <TipPicker subtotalCents={subtotalCents} tipCents={tipCents} onTip={setTipCents} />
      </Section>

      <Section title={t("checkout.anythingElse")}>
        <div className="flex flex-col gap-4">
          <Check
            checked={utensils}
            onChange={setUtensils}
            label={t("checkout.utensilsLabel")}
            hint={t("checkout.utensilsHint")}
          />
          <div>
            <label htmlFor="order-note" className="mb-1 block text-[12px] text-muted">
              {t("checkout.noteForKitchen")}
            </label>
            <textarea
              id="order-note"
              rows={2}
              maxLength={255}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("checkout.notePlaceholder")}
              className="w-full resize-none rounded-xl border border-line-soft bg-surface px-4 py-3 text-[16px] text-ink outline-none transition-colors placeholder:text-quieter focus:border-ink"
            />
          </div>
        </div>
      </Section>

      <div className="border-t border-line pt-5">
        <Money label={t("common.subtotal")} amount={formatPrice(totals.subtotalCents)} />
        <Money label={t("checkout.tax")} amount={formatPrice(totals.taxCents)} />
        {isDelivery ? (
          <Money
            label={t("checkout.delivery")}
            amount={quote ? formatPrice(totals.deliveryCents) : "—"}
          />
        ) : null}
        {totals.tipCents > 0 ? <Money label={t("checkout.tip")} amount={formatPrice(totals.tipCents)} /> : null}
        <div className="mt-1 border-t border-line pt-2">
          <Money label={t("common.total")} amount={formatPrice(totals.totalCents)} strong />
        </div>
      </div>

      {/* A courier that can't take the job is not an error the customer
          caused, and it has a way out that isn't "try again" — so it says
          what happened and points at pickup. */}
      {quoteError ? (
        <p role="alert" className="m-0 mt-4 text-[13px] text-brand-red">
          {quoteError}{" "}
          <Link href="/locations" className="cursor-pointer underline">
            Switch to pickup
          </Link>
          .
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="m-0 mt-4 text-[13px] text-brand-red">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        block
        disabled={
          status === "sending" ||
          incomplete.length > 0 ||
          unavailable.length > 0 ||
          !opening.acceptingOrders ||
          (isDelivery && quote === null)
        }
        className="mt-5"
      >
        {status === "sending"
          ? t("checkout.placingOrder")
          : !opening.acceptingOrders
            ? t("shop.closed")
            : isDelivery && quote === null
              ? quoteError
                ? t("checkout.deliveryUnavailable")
                : t("checkout.pricingDelivery")
              : t("checkout.placeOrderWith", {
                  total: formatPrice(totals.totalCents),
                })}
      </Button>

      {/* Says what actually happens, which depends on how the shop is set up
          rather than on a hardcoded apology. Getting this wrong in the
          reassuring direction — telling somebody they've paid when they
          haven't — is the one failure mode worth designing against. */}
      <p className="m-0 mt-3 text-center text-[11px] leading-[1.6] text-quiet">
        {tender === "card"
          ? t("checkout.cardCharged")
          : t("checkout.payAtWindow")}
      </p>
    </form>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className="mt-0.5 shrink-0">
      <circle cx="9" cy="9" r="7" stroke="var(--cb-muted)" strokeWidth="1.5" />
      <path d="M9 5v4.2l2.6 1.6" stroke="var(--cb-muted)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className="mt-0.5 shrink-0">
      <path
        d="M9 16s5.2-5 5.2-8.2A5.2 5.2 0 0 0 3.8 7.8C3.8 11 9 16 9 16Z"
        stroke="var(--cb-muted)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="7.6" r="1.9" stroke="var(--cb-muted)" strokeWidth="1.5" />
    </svg>
  );
}
