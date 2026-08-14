"use client";

import Link from "next/link";
import { useState } from "react";
import Modal from "../../ui/Modal";
import { useT } from "../../i18n";
import { formatPrice } from "../products";
import { DELIVERY_BANDS, explainFee } from "../deliveryPricing";
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
// ——— The table has to add up to the number above it ———
//
// For a while it didn't, and it was worse than showing nothing: a customer
// 0.9 miles out saw "$10.99" over a card whose first row said 0–5 mi $7.99.
// The rate card is here to answer "am I being padded", and one that disagrees
// with the bill by three dollars answers yes.
//
// It disagreed because the card is the *distance* rate and California's trip
// fee is charged on top of it. That could not be shown before, because
// picking a customer's band needs their distance and Routes was disabled — so
// there was no key, no highlight, and no way to break out a surcharge against
// a band nobody could identify. With Routes answering, all three are possible
// and the arithmetic closes.
//
// So: the customer's band is lit, the trip fee is its own row, and they sum
// to the quote. explainFee() checks that sum against the real quote and
// returns null when it doesn't hold — in which case this falls back to the
// bare card, and the fee stands on its own without a breakdown claiming to
// explain it. The quote is never recomputed from these numbers.
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
  // Null unless the bands and the trip fee actually reconstruct the quote.
  const breakdown = explainFee(miles, feeCents);

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

        {/* The last body row drops its underline, so the table doesn't end on
            a rule a few pixels above the next one — two hairlines that close
            together read as a mistake rather than a divider. The total's own
            rule comes from the tfoot instead, which is only there when there
            is a total to rule off. */}
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
            {DELIVERY_BANDS.map((band) => {
              // The row this order is on. Lit rather than filtered to it: the
              // other three are what make the lit one mean something — a
              // single row saying "0–5 mi $7.99" is a price, four rows with
              // one lit is a rate card you can see yourself on.
              const yours = breakdown?.band === band;
              return (
                <tr key={band.toMiles}>
                  <td
                    className={
                      "border-b border-line-faint py-2 " +
                      (yours ? "font-medium text-ink" : "text-muted")
                    }
                  >
                    {t("deliveryFee.band", { from: band.fromMiles, to: band.toMiles })}
                  </td>
                  <td
                    className={
                      "border-b border-line-faint py-2 text-right tabular-nums " +
                      (yours ? "font-medium text-ink" : "text-muted")
                    }
                  >
                    {formatPrice(band.feeCents)}
                  </td>
                </tr>
              );
            })}
            {/* Charged on every trip in California, on top of the distance
                rate. Without this row the card is three dollars short of the
                bill and reads as the padding it is here to disprove. */}
            {breakdown ? (
              <tr>
                <td className="border-b border-line-faint py-2 text-muted">
                  {t("deliveryFee.tripFee")}
                </td>
                <td className="border-b border-line-faint py-2 text-right tabular-nums text-muted">
                  +{formatPrice(breakdown.tripFeeCents)}
                </td>
              </tr>
            ) : null}
          </tbody>
          {breakdown ? (
            <tfoot>
              <tr>
                <td className="border-t border-line pt-2 font-medium text-ink">
                  {t("deliveryFee.yourFee")}
                </td>
                <td className="border-t border-line pt-2 text-right font-medium tabular-nums text-ink">
                  {formatPrice(breakdown.totalCents)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>

        <p className="m-0 mt-4 border-t border-line pt-4 text-[13px] leading-[1.55] text-ink">
          {t("deliveryFee.passthrough")}
        </p>
        <p className="m-0 mt-2 text-[12px] leading-[1.5] text-muted">
          {t("deliveryFee.quotedFresh")}
        </p>
        {/* The way out to the whole picture. Somebody who opens a fee sheet is
            often really asking "do you even come to me", and until now the
            only way to find out was to finish the checkout. */}
        <Link
          href="/delivery-areas"
          className="cb-press mt-3 inline-block cursor-pointer text-[12px] text-sky-ink underline underline-offset-2"
        >
          {t("deliveryArea.title")}
        </Link>
      </Modal>
    </>
  );
}
