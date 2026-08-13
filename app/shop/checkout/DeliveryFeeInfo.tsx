"use client";

import { useState } from "react";
import Modal from "../../ui/Modal";
import { useT } from "../../i18n";
import { formatPrice } from "../products";
import { CALIFORNIA_TRIP_CENTS, DELIVERY_BANDS, bandFor, chargedCents } from "../deliveryPricing";
import UberDirectMark from "./UberDirectMark";

// The (i) beside the delivery fee, and what it opens.
//
// ——— Why a line on a bill needs a footnote at all ———
//
// "Delivery $10.99" is the number people are most suspicious of on a food
// order, and they are right to be: it is the line the industry pads. On this
// shop it is Uber's own quote passed through untouched, and there is no way to
// tell that by looking at it. So this says it, with the rate card that
// produced the number and the surcharge that explains why an $7.99 band shows
// up as $10.99 on a Los Angeles bill.
//
// The distance is the part that makes it land. A table of bands is abstract;
// "2.4 miles from the shop" with that row lit up is somebody checking our
// arithmetic and finding it holds.
//
// The quote stays the source of truth — see app/shop/deliveryPricing.ts. If
// the card and the fee ever disagree, the fee is right and the card is stale,
// which is why nothing here recomputes the total.
export default function DeliveryFeeInfo({
  miles,
  feeCents,
}: {
  miles?: number | null;
  feeCents?: number | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const known = typeof miles === "number" && Number.isFinite(miles);
  const yourBand = known ? bandFor(miles as number) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("deliveryFee.title")}
        className="cb-press inline-flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-full border border-line text-[11px] font-medium leading-none text-muted transition-colors hover:border-ink hover:text-ink"
      >
        <span aria-hidden>i</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} label={t("deliveryFee.title")}>
        <UberDirectMark className="text-[13px] text-muted" />
        <h2 className="m-0 mt-2 text-[19px] font-medium leading-[1.25] text-ink">
          {t("deliveryFee.title")}
        </h2>
        <p className="m-0 mt-2 text-[14px] leading-[1.55] text-muted">
          {t("deliveryFee.lead")}
        </p>

        {/* What this particular order is being charged, before the table that
            explains it. Somebody opening this has a number in mind and wants
            to find it — leading with the abstract rate card makes them hunt. */}
        {known && typeof feeCents === "number" ? (
          <div className="mt-4 rounded-xl bg-raise px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-muted">{t("deliveryFee.yourAddress")}</span>
              <span className="text-[15px] font-medium tabular-nums text-ink">
                {formatPrice(feeCents)}
              </span>
            </div>
            <p className="m-0 mt-0.5 text-[12px] text-muted">
              {t("deliveryFee.milesAway", { miles: (miles as number).toFixed(1) })}
            </p>
          </div>
        ) : null}

        <table className="mt-4 w-full border-collapse text-[14px]">
          <thead>
            <tr>
              <th className="border-b border-line pb-1.5 text-left text-[12px] font-normal text-muted">
                {t("deliveryFee.distance")}
              </th>
              <th className="border-b border-line pb-1.5 text-right text-[12px] font-normal text-muted">
                {t("deliveryFee.fee")}
              </th>
            </tr>
          </thead>
          <tbody>
            {DELIVERY_BANDS.map((band) => {
              const yours = yourBand === band;
              return (
                <tr key={band.toMiles}>
                  <td
                    className={`border-b border-line-faint py-2 ${
                      yours ? "font-medium text-ink" : "text-muted"
                    }`}
                  >
                    {t("deliveryFee.band", { from: band.fromMiles, to: band.toMiles })}
                    {/* Named rather than only shaded, so the row that applies
                        survives a screen reader and a colourblind reader
                        both. */}
                    {yours ? (
                      <span className="ml-2 text-[11px] font-normal text-muted">
                        {t("deliveryFee.yours")}
                      </span>
                    ) : null}
                  </td>
                  <td
                    className={`border-b border-line-faint py-2 text-right tabular-nums ${
                      yours ? "font-medium text-ink" : "text-muted"
                    }`}
                  >
                    {/* What is charged, not what the rate card says. Uber's
                        quote already carries the trip fee, so a table of bare
                        band rates would have no row matching the line on the
                        bill — see chargedCents(). */}
                    {formatPrice(chargedCents(band))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className="m-0 mt-2 text-[12px] leading-[1.5] text-muted">
          {t("deliveryFee.includesTrip", { amount: formatPrice(CALIFORNIA_TRIP_CENTS) })}
        </p>

        <p className="m-0 mt-4 border-t border-line pt-4 text-[13px] leading-[1.55] text-ink">
          {t("deliveryFee.passthrough")}
        </p>
        <p className="m-0 mt-2 text-[12px] leading-[1.5] text-muted">
          {t("deliveryFee.quotedFresh")}
        </p>
      </Modal>
    </>
  );
}
