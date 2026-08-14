"use client";

import { useState } from "react";
import Modal from "../../ui/Modal";
import { useT } from "../../i18n";
import { formatPrice } from "../products";
import { DELIVERY_BANDS } from "../deliveryPricing";
import UberDirectMark from "./UberDirectMark";

// The (i) beside the delivery fee, and what it opens.
//
// ——— Why a line on a bill needs a footnote at all ———
//
// "Delivery $12.99" is the number people are most suspicious of on a food
// order, and they are right to be: it is the line the industry pads. On this
// shop it is Uber's own quote passed through untouched, and there is no way to
// tell that by looking at it. So this shows the rate card the number came off,
// and says the shop adds nothing.
//
// No row is highlighted, and the reasons are in deliveryPricing.ts — worth
// reading before anybody wires one back in. Briefly: a quoted fee cannot be
// matched to a band it does not equal, and a distance from Google is a second
// opinion about a drive Uber already priced. The customer's own fee sits above
// the table instead, larger, and nothing claims the two are the same thing.
//
// The mileage line under that fee is the only thing here that needs Google,
// and it is decoration: absent, this still works.
//
// ——— And almost nothing else ———
//
// This started with a heading, a paragraph explaining distance pricing, and a
// footnote breaking out California's driver fee. All three were cut. A sheet
// opened from an (i) beside a delivery fee does not need a heading about
// delivery fees; the paragraph said in prose what the table says in four rows;
// and the rates below are flat, so there is no surcharge to break out.
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

  const priced = typeof feeCents === "number" && feeCents > 0;
  const known = typeof miles === "number" && Number.isFinite(miles);

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

      {/* The title lives on the dialog rather than in it. A sheet opened from
          an (i) beside a delivery fee does not need a heading announcing that
          it is about the delivery fee, and the paragraph that explained
          distance pricing was saying in three lines what the table underneath
          says in four rows. What is left is the mark, the money, and the two
          sentences that are actually news. Screen readers still get the
          title — that is what `label` is. */}
      <Modal open={open} onClose={() => setOpen(false)} label={t("deliveryFee.title")}>
        <UberDirectMark className="text-[13px] text-muted" />

        {/* What this particular order is being charged, above the table that
            explains it. Somebody opening this has a number in mind and wants
            to find it — leading with the abstract rate card makes them hunt. */}
        {priced ? (
          <div className="mt-4 rounded-xl bg-raise px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-muted">{t("deliveryFee.yourAddress")}</span>
              <span className="text-[15px] font-medium tabular-nums text-ink">
                {formatPrice(feeCents as number)}
              </span>
            </div>
            {/* The distance, when Routes answered. It used to gate this whole
                block, which meant a shop with a broken maps key showed no
                price at all here — hiding the number somebody opened the
                sheet to see, because a nice-to-have line was missing. */}
            {known ? (
              <p className="m-0 mt-0.5 text-[12px] text-muted">
                {t("deliveryFee.milesAway", { miles: (miles as number).toFixed(1) })}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* The last row drops its underline. With the surcharge row gone the
            table ends on a rule, and the paragraph below opens with one — two
            hairlines a few pixels apart, which reads as a mistake rather than
            as a divider. */}
        <table className="mt-4 w-full border-collapse text-[14px] [&_tbody_tr:last-child_td]:border-b-0">
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
            {DELIVERY_BANDS.map((band) => (
              <tr key={band.toMiles}>
                <td className="border-b border-line-faint py-2 text-muted">
                  {t("deliveryFee.band", { from: band.fromMiles, to: band.toMiles })}
                </td>
                <td className="border-b border-line-faint py-2 text-right tabular-nums text-muted">
                  {formatPrice(band.feeCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* No surcharge footnote. These are Uber's flat rates, so there is
            nothing to break out — and the customer pays one delivery fee
            either way, which is printed above. */}
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
