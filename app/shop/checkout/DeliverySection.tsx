"use client";

import Link from "next/link";
import { useId } from "react";
import { useT } from "../../i18n";
import { useOpening } from "../../useOpening";
import { formatPrice } from "../products";
import { Section } from "./CheckoutSections";
import DeliveryFeeInfo from "./DeliveryFeeInfo";
import UberDirectMark from "./UberDirectMark";
import type { Checkout, Handoff } from "./useCheckout";

// Everything a delivery needs that a pickup does not.
//
// ——— What was missing ———
//
// Delivery used to share the pickup card: a time, an address, done. Three
// things a courier actually needs had nowhere to go, and each of them is a bag
// left in the wrong place:
//
//   the unit      the geocoder resolves a building. "Apt 4B" is the part of an
//                 address it cannot know and a driver cannot guess, and there
//                 was no field for it anywhere in the checkout.
//   the handoff   handed over, or left at the door. A real choice with real
//                 consequences — a bag on a doorstep in Koreatown at 8am is a
//                 different decision from one in a lobby — and it was ours to
//                 make rather than the customer's.
//   the driver    the note field said "Note for the kitchen" and was sent to
//                 both the kitchen and the courier. "No onions" is no use to a
//                 driver and "gate code 4432" is no use to a baker.
//
// ——— And the time ———
//
// A window rather than a single minute. Uber returns one dropoff_eta and the
// old copy printed it as "Delivery around 11:37", which reads as a promise
// nobody made — a courier is a person in traffic. The reference app shows
// 11:37–11:47, and the range is the honest shape of the same estimate.
const WINDOW_MINUTES = 10;

function at(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DeliverySection({ checkout }: { checkout: Checkout }) {
  const t = useT();
  const opening = useOpening();
  const {
    where,
    quote,
    quoting,
    deliveryDetail,
    setDeliveryDetail,
    handoff,
    setHandoff,
    courierNote,
    setCourierNote,
  } = checkout;

  const aptId = useId();
  const noteId = useId();
  const eta = quote?.etaMinutes ?? null;

  return (
    <Section
      title={t("checkout.deliveryDetails")}
      aside={
        <Link
          href="/locations"
          className="cursor-pointer text-[13px] text-ink underline underline-offset-2"
        >
          {t("checkout.switchToPickup")}
        </Link>
      }
    >
      <div className="rounded-xl border border-line-soft">
        {/* Who is driving. Said once, at the top of the block that is about
            them, so the Uber Direct mark on the fee line downstairs is a
            reminder rather than the first anybody hears of it. */}
        <div className="flex items-center justify-between gap-3 border-b border-line-faint px-4 py-2.5">
          <span className="text-[12px] text-muted">{t("delivery.carriedBy")}</span>
          <UberDirectMark className="text-[13px] text-ink" />
        </div>

        {/* No clock while the counter is shut. Uber will happily quote a
            courier at 9pm — its own network is open — and the window that
            comes back is a real answer to the wrong question: nobody is going
            to make the food. An arrival time under a banner reading "we open
            tomorrow at 7am" is the same contradiction the pickup card had. */}
        {opening.acceptingOrders ? (
          <div className="flex items-start gap-3 border-b border-line-faint p-4">
            <ClockIcon />
            <div className="min-w-0">
              {/* No quote, no time. The obvious filler here is the kitchen's
                  prep minutes, and it would be a lie of exactly the wrong
                  kind: 12 minutes is how long the food takes, not how long the
                  drive takes, and printing it as an arrival sends somebody to
                  the window at the wrong moment. */}
              <p className="m-0 text-[14px] text-ink">
                {eta === null
                  ? t("delivery.awaitingEta")
                  : t("delivery.arrivingBetween", {
                      from: at(eta),
                      to: at(eta + WINDOW_MINUTES),
                    })}
              </p>
              <p className="m-0 text-[12px] text-muted">
                {eta === null ? t("delivery.etaPending") : t("delivery.etaCourier")}
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex items-start gap-3 p-4">
          <PinIcon />
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[14px] leading-[1.4] text-ink">
              {where?.where ?? ""}
            </p>
            {/* The unit, under the street it belongs to rather than in a
                separate section — it is one address, and splitting it across
                two blocks is how it gets left blank. */}
            <label htmlFor={aptId} className="mb-1 mt-3 block text-[12px] text-muted">
              {t("delivery.unit")}
            </label>
            <input
              id={aptId}
              value={deliveryDetail}
              onChange={(event) => setDeliveryDetail(event.target.value)}
              maxLength={60}
              autoComplete="address-line2"
              placeholder={t("delivery.unitPlaceholder")}
              className="w-full rounded-xl border border-line-soft bg-surface px-4 py-2.5 text-[16px] text-ink outline-none transition-colors placeholder:text-quieter focus:border-ink"
            />
          </div>
        </div>

        {/* Handed over or left. A pair of buttons rather than a checkbox,
            because neither is the obvious default and a checkbox would make
            one of them look like it. */}
        <fieldset className="m-0 border-0 border-t border-line-faint p-4">
          <legend className="mb-2 p-0 text-[12px] text-muted">{t("delivery.handoff")}</legend>
          <div className="grid grid-cols-2 gap-2">
            <HandoffChoice
              value="hand"
              chosen={handoff}
              onChoose={setHandoff}
              label={t("delivery.handToMe")}
              hint={t("delivery.handToMeHint")}
            />
            <HandoffChoice
              value="door"
              chosen={handoff}
              onChoose={setHandoff}
              label={t("delivery.leaveAtDoor")}
              hint={t("delivery.leaveAtDoorHint")}
            />
          </div>
        </fieldset>

        <div className="border-t border-line-faint p-4">
          <label htmlFor={noteId} className="mb-1 block text-[12px] text-muted">
            {t("delivery.forTheDriver")}
          </label>
          <textarea
            id={noteId}
            rows={2}
            maxLength={200}
            value={courierNote}
            onChange={(event) => setCourierNote(event.target.value)}
            placeholder={t("delivery.forTheDriverPlaceholder")}
            className="w-full resize-none rounded-xl border border-line-soft bg-surface px-4 py-3 text-[16px] text-ink outline-none transition-colors placeholder:text-quieter focus:border-ink"
          />
          <p className="m-0 mt-1 text-[11px] leading-[1.5] text-quiet">
            {t("delivery.forTheDriverHint")}
          </p>
        </div>

        {/* The fee, on the screen that is about the delivery, rather than only
            inside a collapsed summary. It is the number somebody wants before
            they agree to any of the above. */}
        <div className="flex items-center justify-between gap-3 border-t border-line-faint px-4 py-3">
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            {t("checkout.delivery")}
            <DeliveryFeeInfo miles={quote?.miles} feeCents={quote?.feeCents} />
          </span>
          <span className="text-[14px] tabular-nums text-ink">
            {quote ? formatPrice(quote.feeCents) : quoting ? t("delivery.pricing") : "—"}
          </span>
        </div>
      </div>
    </Section>
  );
}

function HandoffChoice({
  value,
  chosen,
  onChoose,
  label,
  hint,
}: {
  value: Handoff;
  chosen: Handoff;
  onChoose: (value: Handoff) => void;
  label: string;
  hint: string;
}) {
  const on = chosen === value;
  return (
    <button
      type="button"
      onClick={() => onChoose(value)}
      aria-pressed={on}
      className={`cb-press cursor-pointer rounded-xl border p-3 text-left transition-colors ${
        on ? "border-ink bg-raise" : "border-line-soft hover:bg-raise"
      }`}
    >
      <span className={`block text-[13px] ${on ? "font-medium text-ink" : "text-ink"}`}>
        {label}
      </span>
      <span className="mt-0.5 block text-[11px] leading-[1.4] text-muted">{hint}</span>
    </button>
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
