"use client";

import { useLocale, useT, type StringKey } from "../../../i18n";
import { useMenu } from "../../../i18n/menu";
import { localeById } from "../../../localeScript";
import { fulfillmentModeKey } from "../../../fulfillment";
import { useEffect, useState } from "react";
import {
  findOrder,
  formatOrderDate,
  amountOwing,
  orderTotals,
  progressFor,
  useOrders,
  type PlacedOrder,
} from "../../../account";
import { SHOP_PHONE } from "../../../shopFacts";
import { useLiveStatus } from "../../useLiveStatus";
import { handedToCourier } from "../../../orderStages";
import PushToggle from "../../../push/PushToggle";
import { ButtonLink } from "../../../ui/Button";
import { formatPrice, getProduct } from "../../products";
import DeliveryFeeInfo from "../../checkout/DeliveryFeeInfo";
import UberDirectMark from "../../checkout/UberDirectMark";
import ProductImage from "../../ProductImage";
import { DISPLAY_FONT, PALETTE } from "../../shopControls";
import TextSwap from "../../../ui/TextSwap";

const { ink, muted, faint, border, surface, controlBorder, sky } = PALETTE;

// The order-tracking screen, in the shape a food-delivery app uses: a headline
// that says where the order is, a bar that fills, the stages under it, then
// the receipt.
//
// The stage is real when the shop has said so, and an estimate when it hasn't.
//
// /api/order-status is asked every 20 seconds for as long as this screen is
// open. It answers from Toast — moved by somebody pressing Order Ready in
// Orders Hub — and, on a delivery, from Uber. When it knows nothing, which is
// every order placed before this existed and every order the kitchen has not
// touched, the clock estimate carries on exactly as it always did.
//
// See progressFor in app/account.ts for how the two are reconciled. The short
// version: a real "ready" is stated whatever the clock thinks, and a real
// "still cooking" stops the clock from claiming ready — but never holds the
// bar back below the kitchen, because a shop without a KDS fires nothing at
// all until the moment it is done.
export default function OrderTracker({ id }: { id: string }) {
  const t = useT();
  const tag = localeById(useLocale()).tag;
  const orders = useOrders();
  const order = findOrder(orders, id);

  // Re-render on a timer so the bar creeps and the stage advances while the
  // screen is open, the way a delivery app's does. 15s rather than 1s: the
  // stages are minutes apart, and a per-second repaint of a page nobody is
  // interacting with is a waste of a phone's battery.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  // One poll for the whole app — see app/shop/useLiveStatus.ts. This screen
  // used to run its own, which is how the strip above it ended up counting
  // down while the headline already said Ready.
  const live = useLiveStatus(order);
  // The courier link waits for the handover. Uber mints a tracking URL when
  // the delivery is created, which is while the food is still being made;
  // opening it then shows a courier who has nothing of ours yet. Unknown
  // stays visible — see handedToCourier.
  const followable = handedToCourier(live?.courier) ?? true;
  const vehicle = vehicleKey(live?.courierVehicle);

  if (!order) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-12 text-center sm:px-6">
        <p className="text-[16px] font-medium" style={{ color: ink }}>
          {t("order.notFound")}
        </p>
        <p className="mx-auto mt-2 max-w-xs text-[14px] leading-[1.5]" style={{ color: muted }}>
          {t("order.keptOnDevice")}
        </p>
        <ButtonLink href="/shop" className="mt-6">
          {t("common.backToMenu")}
        </ButtonLink>
      </div>
    );
  }

  // `undefined` for the clock, not Date.now(): progressFor defaults it, and
  // reading the clock in a render body is the impurity the lint rule is for.
  // The 15s tick above is what makes this recompute.
  const progress = progressFor(order, tag, undefined, live);
  const stage = progress.stages[progress.current];

  return (
    <div className="cb-rise mx-auto max-w-2xl px-5 py-6 sm:px-6 sm:py-8">
      {/* The "← Back to the menu" link that used to sit here is gone, for the
          same reason it went from the product page: the header above carries a
          back control on every shop page, and this put a second one within a
          hundred pixels of it — under a status strip that already offers TRACK
          ORDER, on a screen whose whole job is to be glanceable.

          It also went somewhere slightly wrong. It always meant the catalog,
          so arriving here from the basket or from a push notification and
          pressing it threw away wherever you actually were. The header's goes
          back where you came from, and up a level only when there is nothing
          of ours behind. See BackButton.

          The not-found branch above keeps its button, and that is not the same
          thing: there is no content on that screen to go back *from*, so the
          button is the only action rather than a second way to do one. */}

      {/* The stage, and the sentence under it, on 04-text-states-swap.md.
          Both change while somebody is looking at this page — a webhook lands,
          or the estimate rolls over — and they used to change between one
          frame and the next, which on a screen you are watching for news reads
          as a page that reloaded rather than an order that moved. */}
      <h1
        className="mt-5 text-[26px] font-medium leading-[1.15] tracking-[-0.02em]"
        style={{ color: ink, fontFamily: DISPLAY_FONT }}
      >
        <TextSwap value={t(progress.headline)} />
      </h1>
      <p className="mt-1.5 text-[15px] leading-[1.5]" style={{ color: muted }}>
        <TextSwap
          value={
            progress.canceled
              ? t("order.deliveryCanceledDetail")
              : t(stage.detail, stage.detailVars)
          }
        />
      </p>

      {/* The bar. Its width is the estimate's progress, not a measurement —
          the line under it says which.
          Hidden once Uber has canceled: a bar filling towards a delivery
          nobody is making is the page insisting on a story it has just been
          told is over. */}
      {progress.canceled ? null : (
        <div
          className="mt-5 h-2 overflow-hidden rounded-full"
          style={{ backgroundColor: "var(--cb-line-faint)" }}
          role="progressbar"
          aria-valuenow={Math.round(progress.fraction * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("order.progress")}
        >
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out"
            style={{ width: `${Math.max(6, progress.fraction * 100)}%`, backgroundColor: sky }}
          />
        </div>
      )}

      {/* "· estimated" is a disclaimer, and it is only honest while the time
          is one. Once Uber reports its own arrival time this is no longer
          our arithmetic, and hedging a courier's number as though it were a
          guess of ours undersells the one piece of real information on the
          page. */}
      <p className="mt-2 text-[13px]" style={{ color: faint }}>
        {/* Uber's "about to arrive" outranks any clock time, including Uber's
            own. An arrival time is a plan; this is a reason to stand up, and
            once it is true the minute on the line stops being the useful part.
            Only ever shown because Uber said so — courierNear is never false,
            only absent, so this cannot claim he is *not* nearly here. */}
        {progress.canceled
          ? // Uber has said this one is not happening. Every sentence this line
            // can produce is about when it will get here.
            null
          : live?.courierNear
          ? t("order.arrivingNow")
          : progress.eta
            ? progress.eta.reported
              ? t(progress.eta.key, { time: progress.eta.time })
              : t("order.estimated", {
                  eta: t(progress.eta.key, { time: progress.eta.time }),
                })
            : // No time left to show, and two very different reasons for it.
              //
              // If nothing has reported this stage, "the shop will confirm
              // when it's ready, we can't see the counter from here" is
              // exactly true and it is the most useful thing on the screen.
              //
              // If something *has* reported it, both halves of that sentence
              // are false: the counter is precisely what we can see, and it
              // has already confirmed. The stage and its detail above are the
              // report; adding a line that contradicts them was the page
              // arguing with itself. So there is no line.
              progress.reported
              ? null
              : t("order.shopConfirms")}
      </p>

      {/* The time Uber has committed to, under the one it expects. Uber puts
          both on its own tracker for a reason: an estimate moves and a
          customer watching it move learns nothing, while "latest arrival by
          12:50" is a statement they can decide against. Only ever Uber's
          number — there is no version of this we compute. */}
      {progress.deadline ? (
        <p className="mt-1 text-[13px]" style={{ color: faint }}>
          {t("order.latestArrival", { time: progress.deadline })}
        </p>
      ) : null}

      {/* Who has the bag, once somebody does. Uber hands us a first name and
          a vehicle type, and both are worth showing: a name makes the person
          on the doorstep expected rather than a stranger, and the vehicle is
          what you look for out of the window. Absent until a courier is
          assigned, and absent entirely on a pickup order — this renders
          nothing rather than a row saying nobody.

          The number beside it is Uber's when Uber gives one. It is the answer
          to the one question this screen could not previously help with: a
          courier is outside, or is not, and the person who knows is the one
          holding the bag. No number, no button — never a dead one. */}
      {live?.courierName ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="m-0 text-[14px]" style={{ color: ink }}>
            {vehicle
              ? t("order.courierWith", { name: live.courierName, vehicle: t(vehicle) })
              : t("order.courier", { name: live.courierName })}
          </p>
          {live.courierPhone ? (
            <a
              href={`tel:${live.courierPhone}`}
              className="cb-press shrink-0 cursor-pointer rounded-full border px-3 py-1 text-[13px] font-medium transition-colors hover:bg-raise"
              style={{ borderColor: ink, color: ink }}
            >
              {t("order.callCourier")}
            </a>
          ) : null}
        </div>
      ) : null}

      {/* The stages, as a list rather than a horizontal stepper: four labels
          across a phone either truncate or shrink below reading size.
          Gone on a canceled delivery, along with the bar: every row of it
          describes a journey towards a doorstep, and Uber has said there
          isn't one. What replaces it is the headline above and the phone
          number below, which are the two things still true. */}
      {progress.canceled ? null : (
        <ol className="cb-stagger mt-7 flex list-none flex-col gap-0 p-0">
          {progress.stages.map((entry, index) => {
            const done = index < progress.current;
            const active = index === progress.current;
            const last = index === progress.stages.length - 1;
            return (
              <li key={entry.status} className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <span
                    aria-hidden
                    className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
                    style={{
                      borderColor: done || active ? ink : controlBorder,
                      // Done is ink because it is a fact; the stage in flight is sky
                      // because it is the thing still happening.
                      backgroundColor: done ? ink : active ? sky : "transparent",
                    }}
                  />
                  {last ? null : (
                    <span
                      aria-hidden
                      className="my-1 w-[2px] flex-1 rounded-full"
                      style={{ backgroundColor: done ? ink : controlBorder }}
                    />
                )}
              </div>
              <div className={last ? "pb-0" : "pb-5"}>
                <p
                  className="m-0 text-[14px]"
                  style={{
                    color: done || active ? ink : faint,
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  {t(entry.label)}
                </p>
                {active ? (
                  <p className="m-0 mt-0.5 text-[13px] leading-[1.45]" style={{ color: muted }}>
                    {/* Translated, like every other string. This rendered the
                        key itself — a customer watching their order saw the
                        literal text "order.placedDetail" under the first
                        stage. The headline above uses the same field and did
                        translate it, which is why it read correctly there and
                        was easy to miss here. */}
                    {t(entry.detail, entry.detailVars)}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      )}

      {/* Under the progress and above the receipt: it is about the thing
          being waited for, and it asks at the one moment somebody wants the
          answer it offers. */}
      <PushToggle
        order={{ id: order.id, toastGuid: order.toastGuid, deliveryId: order.deliveryId }}
      />

      <Receipt order={order} followable={followable} />

      {/* Call, not email. Something wrong with an order is a now problem —
          the food is being made, or it isn't, or it's at the wrong door — and
          an inbox answers tomorrow. The number is a tel: link so a phone
          dials it; on a desktop it hands off to whatever handles calls, and
          the number is legible either way rather than hidden behind a
          label. */}
      <p className="mt-6 text-[13px] leading-[1.5]" style={{ color: muted }}>
        {t("order.somethingWrong")}{" "}
        <a
          href={`tel:${SHOP_PHONE}`}
          className="cursor-pointer underline underline-offset-2"
          style={{ color: ink }}
        >
          {/* The label no longer prints the number. It is still a tel: link,
              so tapping dials it — the number just isn't set in the page as
              text to be scraped or read over somebody's shoulder. */}
          {t("order.callShop")}
        </a>
        .
      </p>
    </div>
  );
}

// Uber's vehicle_type, turned into a word this app can say in ten languages.
//
// Unrecognised types return null rather than falling through to the raw
// token, and the sentence above drops to the courier's name alone. That
// matters more than the completeness of this list: Uber can add a vehicle
// tomorrow, and the failure has to be a shorter sentence rather than the
// English word "moped" in the middle of a Burmese one.
function vehicleKey(type: string | undefined): StringKey | null {
  switch (type?.toLowerCase()) {
    case "car":
      return "vehicle.car";
    case "bicycle":
    case "bike":
      return "vehicle.bicycle";
    case "motorcycle":
    case "moped":
      return "vehicle.motorcycle";
    case "scooter":
      return "vehicle.scooter";
    case "van":
      return "vehicle.van";
    case "truck":
      return "vehicle.truck";
    case "walker":
    case "walking":
      return "vehicle.onFoot";
    default:
      return null;
  }
}

function Receipt({
  order,
  /** Whether the courier actually has the bag yet — see handedToCourier. The
   *  live status is polled by the screen above, so it is passed down rather
   *  than polled a second time here. */
  followable,
}: {
  order: PlacedOrder;
  followable: boolean;
}) {
  const t = useT();
  const menu = useMenu();
  const tag = localeById(useLocale()).tag;
  const bill = orderTotals(order);
  const owing = amountOwing(order);
  return (
    <div
      className="mt-8 rounded-2xl border p-5"
      style={{ borderColor: border, backgroundColor: surface }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-medium" style={{ color: ink }}>
          {order.id}
        </span>
        <span className="text-[13px]" style={{ color: faint }}>
          {formatOrderDate(order.placedAt, tag)}
        </span>
      </div>
      <p className="mt-0.5 text-[13px]" style={{ color: muted }}>
        {t(fulfillmentModeKey(order.fulfillmentMode))} · {order.fulfillmentWhere}
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {order.items.map((item, index) => (
          <div key={`${item.slug}-${index}`} className="flex items-center gap-3">
            <ProductImage
              swatch={getProduct(item.slug)?.swatch ?? "var(--cb-faint)"}
              category={getProduct(item.slug)?.category}
              name={menu.recorded(item).name}
              className="h-10 w-10 shrink-0 rounded-lg"
            />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[14px]" style={{ color: ink }}>
                {item.quantity}× {menu.recorded(item).name}
              </p>
              {menu.recorded(item).options ? (
                <p className="m-0 text-[12px]" style={{ color: muted }}>
                  {menu.recorded(item).options}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 text-[14px]" style={{ color: ink }}>
              {formatPrice(item.unitCents * item.quantity)}
            </span>
          </div>
        ))}
      </div>

      {/* The bill as it was charged. This used to be one row reading "Total"
          against order.subtotalCents, which is not the total — checkout adds
          tax and whatever tip was left, so the same order showed one number on
          the confirmation and a smaller one here. */}
      <div className="mt-4 border-t pt-3" style={{ borderColor: border }}>
        <Line label={t("common.subtotal")} amount={formatPrice(bill.subtotalCents)} />
        <Line label={t("checkout.tax")} amount={formatPrice(bill.taxCents)} />
        {/* On the quoted fee, so a waived delivery still shows its line and
            the receipt says what the shop covered. */}
        {bill.deliveryQuotedCents > 0 ? (
          <Line
            label={t("checkout.delivery")}
            amount={
              bill.deliveryWaived
                ? t("checkout.deliveryWaived")
                : formatPrice(bill.deliveryCents)
            }
            after={
              <>
                <UberDirectMark className="text-[11px]" />
                <DeliveryFeeInfo
                  feeCents={bill.deliveryQuotedCents}
                  chargedCents={bill.deliveryCents}
                />
              </>
            }
          />
        ) : null}
        {bill.tipCents > 0 ? <Line label={t("checkout.tip")} amount={formatPrice(bill.tipCents)} /> : null}
        <div className="mt-1.5 border-t pt-2" style={{ borderColor: border }}>
          <Line label={t("common.total")} amount={formatPrice(bill.totalCents)} strong />
        </div>
      </div>
      {/* ——— ⚠️ What is left to pay, which is not the same as how it arrives ———

          This line used to be chosen from the fulfillment alone: a delivery
          said "pay the courier", anything else said "pay at the window". That
          was right while every order was settled at a counter. It stopped
          being right when the checkout learned to charge a card and to spend a
          gift card, and it has been telling people who already paid to pay
          again — on the one screen they open to check.

          Three states, and the third is why owing is nullable: an order placed
          before the record carried this cannot be asked what it settled, and
          the honest thing to print about money we cannot account for is
          nothing. */}
      {owing === null ? null : (
        <p className="mt-1.5 text-[12px]" style={{ color: muted }}>
          {owing === 0
            ? t("order.paidInFull")
            : bill.deliveryQuotedCents > 0
              ? t("order.payCourier")
              : t("order.payAtWindow")}
        </p>
      )}

      {/* Uber's own tracking page. Linked rather than embedded, and rather
          than rebuilt: the courier is theirs, the live position is theirs,
          and a worse copy of a page that already exists is not worth
          building. Only ever present on a delivery that got a courier. */}
      {order.trackingUrl && followable ? (
        <a
          href={order.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="cb-press mt-3 flex w-full cursor-pointer items-center justify-center rounded-full border px-4 py-2.5 text-[13px] font-medium transition-colors hover:bg-raise"
          style={{ borderColor: ink, color: ink }}
        >
          {t("order.followCourier")}
        </a>
      ) : null}
    </div>
  );
}

function Line({
  label,
  amount,
  strong,
  after,
}: {
  label: string;
  amount: string;
  strong?: boolean;
  after?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      {/* items-baseline for the same reason as Money in CheckoutSections.tsx:
          the receipt's delivery row carries the same 11px mark beside 13px
          text, and centring the boxes leaves the mark floating above the line. */}
      <span
        className={`flex min-w-0 items-baseline gap-1.5 ${
          strong ? "text-[14px] font-medium" : "text-[13px]"
        }`}
        style={{ color: strong ? ink : muted }}
      >
        <span className="truncate">{label}</span>
        {after}
      </span>
      <span
        className={strong ? "text-[15px] font-medium" : "text-[13px]"}
        style={{ color: ink }}
      >
        {amount}
      </span>
    </div>
  );
}
