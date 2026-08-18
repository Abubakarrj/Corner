"use client";

import { useState } from "react";

import { useLocale, useT } from "../../i18n";
import { localeById } from "../../localeScript";
import { useMenu } from "../../i18n/menu";
import Link from "next/link";
import { formatPrice } from "../products";
import { useOpening } from "../../useOpening";
import { clockLabel, closeHour, weekdayLabel } from "../../shopFacts";
import { useCapabilities } from "../../capabilities";
import { PREP_MINUTES } from "../../account";
import { Button } from "../../ui/Button";
import { DISPLAY_FONT } from "../shopControls";
import StepSlide from "./StepSlide";
import { useCart } from "../CartContext";
import { useDeliverSwitch } from "./DeliverSwitch";
import PickupPicker from "./PickupPicker";
import DroppedNotice from "../DroppedNotice";
import MergingDots from "../../ui/MergingDots";
import { Check, Disclosure, Field, Section } from "./CheckoutSections";
import { useCheckout } from "./useCheckout";
import DeliverySection from "./DeliverySection";
import OrderSummary from "./OrderSummary";
import SecureNote from "./SecureNote";
import PurchaseComplete from "./PurchaseComplete";
import PaymentSection from "./PaymentSection";
import TipPicker from "./TipPicker";
import SoldOutNotice from "./SoldOutNotice";

// Checkout, in two steps: who you are and where it's going, then how you're
// paying.
//
// It used to be one column of six sections, which put the tip picker, the
// kerbside checkbox and the order note between the fields and the money. The
// reference splits it, and the split is right for reasons beyond looking like
// the reference: payment is the one screen where somebody should be looking at
// a total and a single button, and contact details validated on the way in
// means nobody reaches a card field and then gets sent back up for a missing
// email.
//
// It is also the same two steps the chat sheet walks, running off the same
// hook, sharing the same summary and the same fine print — so ordering through
// Riley and ordering through this page cannot come out differently.

function readyAt(minutes: number): string {
  const when = new Date(Date.now() + minutes * 60_000);
  return when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function CheckoutPage() {
  const t = useT();
  const menu = useMenu();
  const tag = localeById(useLocale()).tag;
  const opening = useOpening();
  const deliverSwitch = useDeliverSwitch();
  const [pickingCounter, setPickingCounter] = useState(false);
  const { payments } = useCapabilities();

  // Everything this page *is* lives in useCheckout — the courier quote, the
  // validation, the submit, the order record. The chat panel's sheet runs the
  // same hook, which is the only thing keeping the two from quietly becoming
  // two different transactions. See the note at the top of useCheckout.ts.
  const checkout = useCheckout();
  const { lines } = useCart();
  const {
    step,
    rows,
    subtotalCents,
    totals,
    incomplete,
    unavailable,
    soldOutNow,
    dismissSoldOut,
    where,
    isDelivery,
    quote,
    quoteError,
    fulfillment,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    phone,
    setPhone,
    firstNameError,
    phoneError,
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
    // One form, two buttons — which one it is depends on the step. The
    // alternative, two forms, loses the browser's own "press enter in a field
    // to move on", which on a phone is the return key on the keyboard.
    if (step === "details") checkout.continueToPayment();
    else void checkout.submit();
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
        <Link
          href="/shop"
          className="mt-3 inline-block cursor-pointer text-[14px] underline"
        >
          {t("common.browseMenu")}
        </Link>
      </div>
    );
  }

  return (
    <>
    {deliverSwitch.sheet}
    {pickingCounter ? (
      <PickupPicker
        slugs={lines.map((line) => line.slug)}
        onClose={() => setPickingCounter(false)}
      />
    ) : null}
    <form
      onSubmit={onSubmit}
      noValidate
      className="mx-auto max-w-lg px-4 pb-10 pt-6 sm:px-6"
    >
      {/* Refused for something that sold out while this basket was open.
          The hook has already taken those lines out; this says which. */}
      <SoldOutNotice names={soldOutNow} onClose={dismissSoldOut} />

      <h1
        className="m-0 mb-4 text-[20px] font-medium text-ink"
        style={{ fontFamily: DISPLAY_FONT }}
      >
        {t("checkout.title")}
      </h1>

      {/* Said here as well as on the basket page, because the counter can now
          be changed from this screen: the total would otherwise drop while
          somebody was reading it, with nothing to explain the difference. */}
      <DroppedNotice className="mb-5" />

      {/* Where you are, in two words. Not a numbered wizard rail: there are
          two steps, both are named, and the second one is not somewhere you
          can jump to — the way back is the button at the foot. */}
      <ol className="m-0 mb-6 flex list-none items-center gap-2 p-0 text-[12px]">
        {(["details", "payment"] as const).map((id, index) => {
          const active = step === id;
          const done = step === "payment" && id === "details";
          return (
            <li key={id} className="flex items-center gap-2">
              {index > 0 ? (
                <span aria-hidden className="h-px w-5 bg-line" />
              ) : null}
              <span
                aria-current={active ? "step" : undefined}
                className={
                  active
                    ? "font-medium text-ink"
                    : done
                      ? "text-muted"
                      : "text-quiet"
                }
              >
                {t(id === "details" ? "checkout.contact" : "checkout.payment")}
              </span>
            </li>
          );
        })}
      </ol>

      {/* The summary rides both steps, headed by the total. It is the number
          somebody is checking, and the lines under it are for when that
          number surprises them — which is why it's collapsed by default and
          why the thumbnails are in it. Same component as the chat sheet. */}
      <div className="mb-6 rounded-2xl border border-line-soft p-4">
        <OrderSummary checkout={checkout} />
        <Link
          href="/shop/cart"
          className="mt-3 inline-block cursor-pointer text-[13px] text-muted underline hover:text-ink"
        >
          {t("checkout.editBasket")}
        </Link>
      </div>

      {/* The shop being shut stops an order on either step, so it's said on
          both — filling in a card and then being told is worse than being
          told before you start. */}
      {!opening.acceptingOrders ? (
        <div className="mb-6 rounded-2xl border border-line-soft bg-sun-soft px-4 py-3">
          <p className="m-0 text-[14px] font-medium text-sun-ink">
            {opening.open ? t("checkout.closingSoon") : t("checkout.closedNow")}
          </p>
          <p className="m-0 mt-1 text-[13px] leading-[1.5] text-sun-ink">
            {opening.open
              ? t("checkout.noTimeBefore", {
                  time: clockLabel(closeHour() % 24, tag),
                })
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

      {/* The two steps, on 08-page-side-by-side.md. See StepSlide. */}
      <StepSlide
        step={step}
        details={
          <>
            <Section title={t("checkout.contact")}>
              <div className="flex flex-col gap-3">
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
                  required
                  value={phone}
                  onChange={setPhone}
                  error={phoneError}
                />
                <p className="m-0 text-[11px] leading-[1.5] text-quiet">
                  {t("checkout.contactNote")}
                </p>
              </div>
            </Section>

            {/* Delivery gets its own block rather than the pickup card with the
              address swapped in. A courier needs the unit, the handoff and a
              note of his own, and none of those has any meaning for somebody
              walking to the counter — see DeliverySection.tsx. */}
            {isDelivery ? (
              <DeliverySection checkout={checkout} />
            ) : (
              <Section
                title={t("checkout.pickupDetails")}
                aside={
                  // Opens the pin step over this screen. Going the other way
                  // is a choice between two counters and is a list; coming
                  // this way needs a street, a building and a door, and there
                  // is no list of those. See DeliverSwitch.
                  <button
                    type="button"
                    onClick={deliverSwitch.open}
                    className="cb-press cursor-pointer text-[13px] text-ink underline underline-offset-2"
                  >
                    {t("checkout.switchToDelivery")}
                  </button>
                }
              >
                <div className="rounded-xl border border-line-soft">
                  {/* No clock while the counter is shut.
                    readyAt() is now plus twelve minutes and nothing else, so at
                    9:21pm it read "Pickup around 9:32 PM" directly under a
                    banner saying we open tomorrow at 7am. Two boxes on one
                    screen disagreeing about whether the shop is open, and the
                    wrong one is the specific one — a time is far easier to
                    believe than a sentence.
                    Gated on acceptingOrders rather than open, because the last
                    twelve minutes before close are the same problem: the shop
                    is open, the order cannot be made, and a pickup time would
                    be promising otherwise. */}
                  {opening.acceptingOrders ? (
                    <div className="flex items-start gap-3 border-b border-line-faint p-4">
                      <ClockIcon />
                      <div className="min-w-0">
                        <p className="m-0 text-[14px] text-ink">
                          {t("checkout.pickupAround", {
                            time: readyAt(PREP_MINUTES),
                          })}
                        </p>
                        {/* "Estimated" is doing real work here: nothing in this
                          app can see the kitchen, so this is arithmetic on the
                          clock, and saying otherwise would be a promise the
                          shop didn't make. */}
                        <p className="m-0 text-[12px] text-muted">
                          {t("checkout.estimatedShop")}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex items-start gap-3 p-4">
                    <PinIcon />
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-[14px] text-ink">
                        {where?.where ?? "Corner Bagel"}
                      </p>
                      {fulfillment && fulfillment.mode !== "delivery" ? (
                        <p className="m-0 text-[12px] text-muted">
                          {fulfillment.detail}
                        </p>
                      ) : null}
                      {/* Changing which counter, in the same place the
                          delivery card puts "Adjust pin": next to the thing
                          being changed. It used to be the header's "Change",
                          which reopens the finder — a map of the country to
                          pick between two shops half a mile apart, with the
                          form left behind. */}
                      <button
                        type="button"
                        onClick={() => setPickingCounter(true)}
                        className="cb-press mt-1.5 cursor-pointer text-[12px] text-ink underline underline-offset-2"
                      >
                        {t("checkout.choosePickup")}
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-line-faint p-4">
                    <Check
                      checked={curbside}
                      onChange={setCurbside}
                      label={t("checkout.curbsidePickup")}
                      hint={t("checkout.curbsideHint")}
                    />
                  </div>
                </div>
              </Section>
            )}

            {/* The note and the utensils, folded away. Most orders want neither,
              and both are things you'd go looking for rather than things that
              should sit between the address and the button. */}
            <Section title={t("checkout.anythingElse")}>
              <Disclosure summary={t("checkout.addANote")}>
                <div className="flex flex-col gap-4">
                  <Check
                    checked={utensils}
                    onChange={setUtensils}
                    label={t("checkout.utensilsLabel")}
                    hint={t("checkout.utensilsHint")}
                  />
                  <div>
                    <label
                      htmlFor="order-note"
                      className="mb-1 block text-[12px] text-muted"
                    >
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
              </Disclosure>
            </Section>

            {/* Said on this step, because the fix is in the basket and this is
              the last screen that can point at it. */}
            {unavailable.length > 0 ? (
              <p role="alert" className="m-0 mb-4 text-[13px] text-brand-red">
                {t("checkout.soldOutLine", {
                  name: menu.name(unavailable[0].product),
                })}{" "}
                <Link href="/shop/cart" className="cursor-pointer underline">
                  {t("checkout.takeItOut")}
                </Link>
                .
              </p>
            ) : null}

            {incomplete.length > 0 ? (
              <p role="alert" className="m-0 mb-4 text-[13px] text-brand-red">
                {t("checkout.needsOptionsLine", {
                  name: menu.name(incomplete[0].product),
                })}{" "}
                <Link href="/shop/cart" className="cursor-pointer underline">
                  {t("checkout.chooseInBasket")}
                </Link>
                .
              </p>
            ) : null}

            <Button type="submit" block>
              {t("checkout.continue")}
            </Button>
          </>
        }
        payment={
          <>
            <Section title={t("checkout.payment")}>
              <div className="flex flex-col gap-4">
                <PaymentSection
                  tender={tender}
                  onTender={setTender}
                  cardEnabled={payments}
                  card={checkout.card}
                />
                <SecureNote />
              </div>
            </Section>

            <Section title={t("checkout.addTip")}>
              <TipPicker
                subtotalCents={subtotalCents}
                tipCents={tipCents}
                onTip={setTipCents}
              />
            </Section>

            {/* A courier that can't take the job is not an error the customer
              caused, and it has a way out that isn't "try again" — so it says
              what happened and points at pickup. */}
            {quoteError ? (
              <p role="alert" className="m-0 mb-4 text-[13px] text-brand-red">
                {quoteError}{" "}
                <Link href="/locations" className="cursor-pointer underline">
                  {t("checkout.switchToPickup")}
                </Link>
                .
              </p>
            ) : null}

            {error ? (
              <p role="alert" className="m-0 mb-4 text-[13px] text-brand-red">
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
            >
              {/* Placing an order is the one wait on this screen that is not
                  instant — a Toast round trip, and an Uber quote behind it —
                  and the button used to mark it by changing its own text.
                  Text changing is a state; a control that is working is a
                  different claim, and on a button somebody has just pressed
                  and is now watching, the difference is whether the press
                  landed.

                  09-icon-swap.md, cross-fading the shop's own loader into the
                  slot. Both icons stay in the DOM stacked in one grid cell, so
                  the label does not jump sideways when one replaces the other.

                  There is no tick here. The success state of this button is
                  the confirmation screen, which replaces the whole form the
                  moment the order is real — a tick on a button nobody sees
                  again would be a celebration in an empty room. The tick is on
                  Add to basket, where the screen stays put. */}
              <span className="inline-flex items-center gap-2">
                <span
                  className="t-icon-swap"
                  data-state={status === "sending" ? "b" : "a"}
                  aria-hidden
                >
                  <span className="t-icon" data-icon="a" />
                  <span className="t-icon" data-icon="b">
                    <MergingDots label={t("checkout.placingOrder")} />
                  </span>
                </span>
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
              </span>
            </Button>

            {/* Says what actually happens, which depends on how the shop is set
              up rather than on a hardcoded apology. Getting this wrong in the
              reassuring direction — telling somebody they've paid when they
              haven't — is the one failure mode worth designing against. */}
            <p className="m-0 mt-3 text-center text-[11px] leading-[1.6] text-quiet">
              {tender === "card"
                ? t("checkout.cardCharged")
                : t("checkout.payAtWindow")}
            </p>

            <button
              type="button"
              onClick={checkout.backToDetails}
              className="cb-press mx-auto mt-4 block cursor-pointer text-[13px] text-muted underline transition-opacity hover:opacity-70"
            >
              {t("common.back")}
            </button>
          </>
        }
      />
    </form>
    </>
  );
}

function ClockIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
      className="mt-0.5 shrink-0"
    >
      <circle cx="9" cy="9" r="7" stroke="var(--cb-muted)" strokeWidth="1.5" />
      <path
        d="M9 5v4.2l2.6 1.6"
        stroke="var(--cb-muted)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
      className="mt-0.5 shrink-0"
    >
      <path
        d="M9 16s5.2-5 5.2-8.2A5.2 5.2 0 0 0 3.8 7.8C3.8 11 9 16 9 16Z"
        stroke="var(--cb-muted)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle
        cx="9"
        cy="7.6"
        r="1.9"
        stroke="var(--cb-muted)"
        strokeWidth="1.5"
      />
    </svg>
  );
}
