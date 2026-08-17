"use client";

import Link from "next/link";
import { useT, type StringKey } from "../../i18n";
import { formatPrice } from "../products";
import { orderTotals, type PlacedOrder } from "../../account";
import { Button, ButtonLink } from "../../ui/Button";
import Confetti from "../../ui/Confetti";
import { DISPLAY_FONT } from "../shopControls";
import { Money } from "./CheckoutSections";
import DeliveryFeeInfo from "./DeliveryFeeInfo";
import QueuePlace from "./QueuePlace";
import UberDirectMark from "./UberDirectMark";
import type { Tender } from "./PaymentSection";

// What both surfaces show once the endpoint has said yes.
//
// One component because the page and the chat sheet are confirming the same
// thing, and a confirmation that words itself two ways is a confirmation
// somebody has to check twice.
//
// ——— On what this is allowed to say ———
//
// It renders only after /api/shop-order returned 200, and it describes what
// that means and nothing more. The reference this is modelled on ends with
// "this was a demo checkout, so nothing was charged", which is true of a demo
// and would be a lie here. What actually happens next depends on the tender:
// pay at the window and no money has moved yet; pay by card and it moves when
// the shop confirms. So the line under the tick is chosen from the tender
// rather than written once and hoped over.
//
// Riley never renders this by deciding to. She can open the sheet; the sheet
// runs useCheckout, and useCheckout is what gets a 200. See the note there.
export default function PurchaseComplete({
  order,
  where,
  tender,
  // The sheet passes this and shows a Done button; the page leaves it out and
  // shows Track order + Back to the menu, because a page has somewhere to go
  // back to and a sheet has to be dismissed.
  onDone,
  // Dismissing and leaving are different acts, and the sheet needs them to be:
  // Done puts you back in the conversation, while a link out of the panel
  // should take the panel with it. Falls back to onDone, so a surface that
  // doesn't care passes one thing.
  onLeave,
  // Track the order *here*, without going anywhere.
  //
  // The chat panel has a tracker of its own now, and until this existed the
  // button under a confirmation still linked out to /shop/order/… — so the one
  // screen at the end of ordering-inside-the-chat threw you out of the chat.
  // When this is passed the button stops being a link and becomes a button,
  // because it no longer navigates. The page passes nothing and keeps the link,
  // which is right there: a page has somewhere to go.
  onTrack,
}: {
  order: PlacedOrder | null;
  where: { mode: StringKey; where: string } | null;
  tender: Tender;
  onDone?: () => void;
  onLeave?: () => void;
  onTrack?: () => void;
}) {
  const t = useT();
  const bill = order ? orderTotals(order) : null;

  return (
    // relative, because the confetti canvas fills this box rather than the
    // viewport. A full-screen canvas behind a sheet would burst somewhere off
    // the top of the panel, where nobody is looking.
    <div className="cb-rise relative mx-auto max-w-lg px-4 py-10 text-center sm:px-6">
      <Confetti />

      {/* Everything above the canvas in the stacking order, so a piece of
          confetti can't land on top of the order number. */}
      <div className="relative">
        <span
          aria-hidden
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--cb-good-bg)" }}
        >
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <path
              d="M6 13.4l4.6 4.6L20 8.6"
              stroke="var(--cb-ink)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <p
          className="mt-4 text-[22px] font-medium leading-tight text-ink"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          {t("checkout.purchaseComplete")}
        </p>

        {order ? (
          <p className="mt-1 text-[13px] tabular-nums text-muted">
            {t("checkout.orderNumber", { id: order.id })}
          </p>
        ) : null}

        <p className="mx-auto mt-2 max-w-xs text-[14px] leading-[1.5] text-muted">
          {where ? (
            <>
              {t("checkout.fromWhere", { mode: t(where.mode), where: where.where })}{" "}
              {t("checkout.weWillHaveItReady")}
            </>
          ) : (
            <>{t("checkout.weWillHaveItReady")}</>
          )}
        </p>

        {/* Where this order sits in the line. Under the timing sentence and
            above the money, because it belongs with "when", and because the
            number people came back to this screen for is how long — not what
            they already know they spent. Renders nothing when the queue
            cannot say, which includes every deployment without a database. */}
        <QueuePlace queueId={order?.queueId} />

        {bill ? (
          <div className="mx-auto mt-6 max-w-[280px] rounded-2xl border border-line-soft bg-surface p-4 text-left">
            <Money label={t("common.subtotal")} amount={formatPrice(bill.subtotalCents)} />
            <Money label={t("checkout.tax")} amount={formatPrice(bill.taxCents)} />
            {bill.deliveryQuotedCents > 0 ? (
              // The receipt carries no distance — the order record keeps what
              // was charged, not how far it went — so the explainer opens
              // without the "your address" line and shows the rate card alone.
              <Money
                label={t("checkout.delivery")}
                amount={
                  bill.deliveryWaived
                    ? t("checkout.deliveryWaived")
                    : formatPrice(bill.deliveryCents)
                }
                after={
                  <>
                    <UberDirectMark className="text-[11px] text-quiet" />
                    <DeliveryFeeInfo
                      feeCents={bill.deliveryQuotedCents}
                      chargedCents={bill.deliveryCents}
                    />
                  </>
                }
              />
            ) : null}
            {bill.tipCents > 0 ? (
              <Money label={t("checkout.tip")} amount={formatPrice(bill.tipCents)} />
            ) : null}
            <div className="mt-1 border-t border-line pt-2">
              <Money label={t("common.total")} amount={formatPrice(bill.totalCents)} strong />
            </div>
            {/* "Visa ending 4242", the way a receipt names a card. This is the
                only place the card is described at all, it comes from the
                order record on this device, and it is four digits and a brand
                — the full number was never stored anywhere to print. */}
            {order?.cardLast4 ? (
              <p className="m-0 mt-2 text-[12px] text-muted">
                {t("checkout.cardEnding", {
                  brand: order.cardBrand ?? "Card",
                  last4: order.cardLast4,
                })}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* The money sentence, chosen from the tender rather than assumed.
            Getting this wrong in the reassuring direction — telling somebody
            they've paid when they haven't — is the one failure this screen
            has to avoid. */}
        <p className="mx-auto mt-3 max-w-xs text-[12px] leading-[1.5] text-quiet">
          {tender === "card" ? t("checkout.cardCharged") : t("checkout.payAtWindow")}
        </p>

        {order && onTrack ? (
          <Button onClick={onTrack} className="mt-6 w-full max-w-[280px]">
            {t("common.trackOrder")}
          </Button>
        ) : order ? (
          <ButtonLink
            href={`/shop/order/${order.id}`}
            className="mt-6 w-full max-w-[280px]"
            onClick={onLeave ?? onDone}
          >
            {t("common.trackOrder")}
          </ButtonLink>
        ) : null}

        {onDone ? (
          // quiet, not secondary: Track order is the primary here and two
          // full-width pills of similar weight under it read as a choice
          // rather than a hierarchy. Dismissing is the tertiary action.
          <Button variant="quiet" onClick={onDone} className="mt-2 w-full max-w-[280px]">
            {t("checkout.done")}
          </Button>
        ) : (
          <Link
            href="/shop"
            className="cb-press mt-4 block cursor-pointer text-[14px] text-muted underline hover:text-ink"
          >
            {t("common.backToMenu")}
          </Link>
        )}
      </div>
    </div>
  );
}
