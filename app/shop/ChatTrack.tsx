"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useT } from "../i18n";
import { localeById } from "../localeScript";
import { findOrder, progressFor, useOrders } from "../account";
import { useLiveStatus } from "./useLiveStatus";

// Where the order is, without leaving the conversation.
//
// The panel could already *link* to the tracker, and that was the gap: the
// whole point of ordering in here is not being sent to a page for each step,
// and the last step was a page. This is the same reading of the same record —
// progressFor, the one function that decides what stage an order is in — drawn
// at the panel's scale.
//
// Deliberately not the page component reused. That screen is a headline set in
// the display face, a receipt, a phone number and a route back to the menu, in
// a 2xl column. Squeezing it into 344px would mean overriding most of it, and
// the two would drift the first time either changed. What they share is the
// only thing that matters: neither of them decides anything, they both ask
// account.ts.
//
// ⚠️ The stage is an ESTIMATE derived from the clock. Nothing reports real
// progress yet (see the warning on OrderStatus in app/account.ts), so this says
// "estimated" and never claims the order was handed over. Only the counter
// knows that.
export default function ChatTrack({
  id,
  onBack,
  onLeave,
}: {
  id: string;
  onBack: () => void;
  /** Called on the way out to the full page, so the panel can close behind. */
  onLeave: () => void;
}) {
  const t = useT();
  const tag = localeById(useLocale()).tag;
  const orders = useOrders();
  const order = findOrder(orders, id);
  // Above the early return below, because hooks cannot be conditional. Shared
  // with the tracker and the strip, so all three say the same thing.
  const live = useLiveStatus(order);

  // Re-render on a timer so the bar creeps while the panel is open, the same
  // 15s the page uses: the stages are minutes apart, and a per-second repaint
  // of something nobody is touching is a waste of a phone's battery.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!order) {
    return (
      <div className="flex min-h-[188px] flex-col items-center justify-center px-6 py-10 text-center">
        <p className="m-0 text-[14px] font-medium text-ink">{t("order.notFound")}</p>
        <p className="m-0 mt-1.5 max-w-[15rem] text-[12px] leading-[1.5] text-muted">
          {t("order.keptOnDevice")}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="cb-press mt-4 cursor-pointer text-[12px] text-muted underline transition-opacity hover:opacity-70"
        >
          {t("chat.backToChat")}
        </button>
      </div>
    );
  }

  const progress = progressFor(order, tag, undefined, live);
  const stage = progress.stages[progress.current];

  return (
    <div className="flex flex-col gap-3.5 px-3.5 py-3.5">
      <div>
        <p className="m-0 text-[11px] uppercase tracking-[0.07em] text-hint">
          {t("checkout.orderNumber", { id: order.id })}
        </p>
        <p className="m-0 mt-1 text-[15px] font-medium leading-tight text-ink">
          {t(stage.label)}
        </p>
        <p className="m-0 mt-1 text-[12px] leading-[1.5] text-muted">
          {t(stage.detail, stage.detailVars)}
        </p>
      </div>

      {/* The bar. Its width is the estimate's progress, not a measurement —
          the line under it says which. */}
      <div
        className="h-1.5 overflow-hidden rounded-full bg-raise"
        role="progressbar"
        aria-valuenow={Math.round(progress.fraction * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("order.progress")}
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${Math.max(6, progress.fraction * 100)}%`,
            backgroundColor: "var(--cb-chat-accent)",
          }}
        />
      </div>

      {progress.eta ? (
        <p className="m-0 text-[11px] text-quiet">
          {t("order.estimated", {
            eta: t(progress.eta.key, { time: progress.eta.time }),
          })}
        </p>
      ) : (
        <p className="m-0 text-[11px] leading-[1.5] text-quiet">{t("order.shopConfirms")}</p>
      )}

      {/* The stages, stacked. Four labels across 344px either truncate or
          shrink below reading size, which is the same reason the page stacks
          them on a phone. */}
      <ol className="m-0 flex list-none flex-col gap-0 p-0">
        {progress.stages.map((entry, index) => {
          const done = index < progress.current;
          const active = index === progress.current;
          const last = index === progress.stages.length - 1;
          return (
            <li key={entry.status} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                <span
                  aria-hidden
                  className="mt-[3px] h-3 w-3 shrink-0 rounded-full border-2"
                  style={{
                    borderColor: done || active ? "var(--cb-chat-accent)" : "var(--cb-line-mute)",
                    // Done is filled because it is a fact; the stage in flight
                    // is hollow because it is the thing still happening.
                    backgroundColor: done ? "var(--cb-chat-accent)" : "transparent",
                  }}
                />
                {last ? null : (
                  <span
                    aria-hidden
                    className="my-0.5 w-[2px] flex-1 rounded-full"
                    style={{
                      backgroundColor: done ? "var(--cb-chat-accent)" : "var(--cb-line-mute)",
                    }}
                  />
                )}
              </div>
              <span
                className={`pb-3 text-[12px] leading-[1.35] ${
                  done || active ? "text-ink" : "text-quiet"
                }`}
              >
                {t(entry.label)}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Uber's own view of the courier, when there is one. Linked rather than
          rebuilt: a worse map of somebody else's driver helps nobody. */}
      {order.trackingUrl ? (
        <a
          href={order.trackingUrl}
          target="_blank"
          rel="noreferrer"
          className="cb-press cursor-pointer text-center text-[12px] text-link underline"
        >
          {t("order.followCourier")}
        </a>
      ) : null}

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="cb-press cursor-pointer text-[12px] text-muted underline transition-opacity hover:opacity-70"
        >
          {t("chat.backToChat")}
        </button>
        <Link
          href={`/shop/order/${order.id}`}
          onClick={onLeave}
          className="cb-press cursor-pointer text-[12px] text-muted underline transition-opacity hover:opacity-70"
        >
          {t("order.fullDetails")}
        </Link>
      </div>
    </div>
  );
}
