"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useCart } from "../CartContext";
import PickupPicker from "./PickupPicker";
import AdjustPinModal from "./AdjustPinModal";
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
// nobody made — a courier is a person in traffic. A range is the honest shape
// of the same estimate.
//
// ——— Five minutes, down from ten ———
//
// The window trails the estimate rather than straddling it: it runs from
// Uber's number upward, never below. So its midpoint — the time somebody
// actually reads off a range — sat five minutes past what Uber said, and the
// top sat ten past. That was a systematic pessimism on top of an estimate
// that already includes the kitchen, and it is the reason a twenty-five
// minute delivery advertised itself as thirty-five.
//
// Half of it goes. Five keeps the range honest about a courier in traffic
// while putting the number somebody reads within a couple of minutes of the
// one Uber gave us.
//
// The rest of the wait is not padding and is not adjustable from here.
// PREP_MINUTES is how long the kitchen takes and it is sent to Uber as the
// ready time, so the courier is scheduled against it rather than kept
// waiting; shortening it here would not make a bagel faster, it would just
// send a driver to stand at the counter. That number belongs to the kitchen.
const WINDOW_MINUTES = 5;

// ——— The window, from the instant rather than from a stopwatch ———
//
// This read `Date.now() + minutes`, where `minutes` was measured when the
// quote came back. Every re-render moved the window later: quote at 11:12
// saying 11:42, then a name typed, a box ticked, a card entered, and six
// minutes later the same quote printed 11:48. The estimate got longer the
// longer somebody looked at it, which is the opposite of what a clock does
// and made every delivery read as slower than Uber had actually promised.
//
// So the instant Uber gave is what is rendered, and it stays put.
function clockAt(iso: string, addMinutes = 0): string {
  return new Date(Date.parse(iso) + addMinutes * 60_000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DeliverySection({ checkout }: { checkout: Checkout }) {
  const t = useT();
  const opening = useOpening();
  const { lines } = useCart();
  const [picking, setPicking] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
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
    fulfillment,
    totals,
  } = checkout;

  // Whether this destination carries a point the customer placed, rather than
  // only words for something to geocode later. See PinPicker.tsx.
  const pinned =
    fulfillment?.mode === "delivery" &&
    typeof fulfillment.lat === "number" &&
    typeof fulfillment.lng === "number";

  const aptId = useId();
  const noteId = useId();
  // ——— And a window that has already been and gone ———
  //
  // Now that the instant is fixed rather than recomputed, a checkout left
  // open long enough will reach it. Printing "arriving 11:42" at 11:58 is
  // worse than the drift it replaced: the drift was late, this is a time that
  // has already happened. Past its own top end, the quote has stopped
  // describing anything and the pending line is the honest thing to show —
  // the endpoint re-quotes at order time regardless, so nothing downstream
  // depends on this number.
  const quotedAt = quote?.etaAt ?? null;
  // Which quote has outlived its own window. Held as the instant rather than
  // as a boolean, so a fresh quote is live again without anything having to
  // remember to clear a flag.
  const [lapsed, setLapsed] = useState<string | null>(null);
  useEffect(() => {
    if (!quotedAt) return;
    // One timer that fires at the moment it matters, rather than a poll
    // asking every minute whether the moment has arrived. Date.now() belongs
    // here and not in the render: reading the clock while rendering makes the
    // same component produce different output from the same props.
    const ms = Date.parse(quotedAt) + WINDOW_MINUTES * 60_000 - Date.now();
    const timer = window.setTimeout(() => setLapsed(quotedAt), Math.max(0, ms));
    return () => window.clearTimeout(timer);
  }, [quotedAt]);
  const etaAt = quotedAt && lapsed !== quotedAt ? quotedAt : null;

  return (
    <>
    {picking ? (
      <PickupPicker
        slugs={lines.map((line) => line.slug)}
        onClose={() => setPicking(false)}
      />
    ) : null}
    {/* Narrowed here rather than inside the modal: there is no pin to adjust
        on a pickup, and the component should not have to defend against being
        handed one. */}
    {adjusting && pinned && fulfillment?.mode === "delivery" ? (
      <AdjustPinModal
        fulfillment={fulfillment}
        start={[fulfillment.lat as number, fulfillment.lng as number]}
        onClose={() => setAdjusting(false)}
      />
    ) : null}
    <Section
      title={t("checkout.deliveryDetails")}
      aside={
        /* A button, not a link to /locations. Somebody in a half-filled
           checkout who decides to walk instead should not lose the form and
           land on a map of the United States to answer a question with two
           answers. The picker opens over this screen and closes back onto it.

           The basket rides along so a row can say what that counter cannot
           make — the one fact that would change the choice, and the one it is
           too late to learn afterwards. */
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="cb-press cursor-pointer text-[13px] text-ink underline underline-offset-2"
        >
          {t("checkout.switchToPickup")}
        </button>
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
                {etaAt === null
                  ? t("delivery.awaitingEta")
                  : t("delivery.arrivingBetween", {
                      from: clockAt(etaAt),
                      to: clockAt(etaAt, WINDOW_MINUTES),
                    })}
              </p>
              <p className="m-0 text-[12px] text-muted">
                {etaAt === null ? t("delivery.etaPending") : t("delivery.etaCourier")}
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
            {/* Whether the courier is going to a point somebody placed or to
                whatever a geocoder makes of those words, said plainly.

                It is one line and it is worth the room. This address is the
                most expensive thing on the screen to get wrong — a card can be
                re-entered, a wrong doorway is a bag on somebody else's step —
                and this is the last place before payment where it can be
                fixed. A delivery set up before the picker existed has no pin,
                and that is a real difference in how accurate it will be, so it
                is not glossed over.

                "Adjust" goes to /locations rather than opening a map here.
                The picker is a full screen and this is a card inside a form;
                the finder is where a destination is chosen, and sending
                somebody there keeps one answer to "where does this go". */}
            <p className="m-0 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
              <span>{pinned ? t("pin.pinned") : t("delivery.noPinYet")}</span>
              {/* Opens the picker over this screen rather than navigating to
                  the finder. Correcting a pin is not choosing a destination:
                  somebody reading their own address back before paying has
                  spotted that the point is on the wrong side of the building,
                  and the fix for that used to be leaving a half-filled form
                  and re-entering the finder through its search and its tabs
                  to reach the same map. */}
              {pinned ? (
                <button
                  type="button"
                  onClick={() => setAdjusting(true)}
                  className="cb-press cursor-pointer text-ink underline underline-offset-2"
                >
                  {t("pin.adjust")}
                </button>
              ) : (
                /* Still a link, and it has to be. Adjusting a pin needs a pin
                   to open the map over; placing a first one needs the address
                   resolved to coordinates before a map can be shown at all,
                   and resolving an address is what the finder is for. Only a
                   delivery set up before the pin step existed lands here. */
                <Link
                  href="/locations?for=menu"
                  className="cursor-pointer text-ink underline underline-offset-2"
                >
                  {t("pin.title")}
                </Link>
              )}
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
        {/* The rule belongs to the wrapper, not to the fieldset.
            A <legend> is not an ordinary child: the browser lifts it into the
            fieldset's top border and cuts a gap in that border to make room.
            Usually invisible, because a fieldset with a full box still reads
            as a box. Here the top border was the *only* border, so the legend
            punched a hole in it and "Handing it over" sat in the middle of a
            rule that stopped either side of the words — the one row in this
            card whose divider was broken, on a card made of dividers.
            Borderless fieldset inside a bordered div, and the rule is whole. */}
        <div className="border-t border-line-faint p-4">
          <fieldset className="m-0 border-0 p-0">
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
        </div>

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
            they agree to any of the above.
            Which means it has to say the same thing the summary says. Reading
            quote.feeCents straight, it went on charging $10.99 for a delivery
            the summary two sections down had already waived, and the number a
            customer sees while agreeing to the terms of the drop-off is not
            the one to be wrong about. `totals` is the answer totalsFor()
            already worked out, not a second opinion formed here. */}
        <div className="flex items-center justify-between gap-3 border-t border-line-faint px-4 py-3">
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            {t("checkout.delivery")}
            <DeliveryFeeInfo
              miles={quote?.miles}
              feeCents={quote?.feeCents}
              chargedCents={totals.deliveryCents}
            />
          </span>
          <span className="text-[14px] tabular-nums text-ink">
            {quote
              ? totals.deliveryWaived
                ? t("checkout.deliveryWaived")
                : formatPrice(totals.deliveryCents)
              : quoting
                ? t("delivery.pricing")
                : "—"}
          </span>
        </div>
      </div>
    </Section>
    </>
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
