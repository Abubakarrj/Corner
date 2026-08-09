"use client";

import Link from "next/link";
import { useT } from "../i18n";
import { useEffect, useState } from "react";
import { activeOrder, progressFor, useOrders } from "../account";
import { useLiveStatus } from "./useLiveStatus";
import { PALETTE } from "./shopControls";

const { skySoft, skyInk } = PALETTE;

// The live-order bar, in the shape a delivery app puts at the top of its home
// screen: what's happening, when it's expected, and a way through to the
// tracker. Sits under the shop header while an order is in flight and
// disappears once its estimate has run out — a bar that sits there for a week
// saying "Ready around 8:24am" is worse than no bar.
export default function OrderStatusBar() {
  const t = useT();
  const orders = useOrders();

  // Same 15s heartbeat as the tracker, for the same reason: the stage and the
  // ETA are functions of the clock, so without one the bar freezes at whatever
  // it said when the page loaded.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const order = activeOrder(orders);
  // Before the early return: a hook cannot be called conditionally, and this
  // one is written to take undefined for exactly that reason.
  const live = useLiveStatus(order ?? undefined);
  if (!order) return null;

  const progress = progressFor(order, "en-US", undefined, live);
  const stage = progress.stages[progress.current];

  return (
    <Link
      href={`/shop/order/${order.id}`}
      // Sky, because this bar is the app telling you something rather than
      // asking you for something. It used to be a filled ink slab, which is
      // the same weight as a primary button and read as one — the loudest
      // thing on the screen, above a menu you are trying to read.
      style={{ backgroundColor: skySoft, color: skyInk }}
      className="block cursor-pointer transition-opacity hover:opacity-95"
    >
      <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-on-ink/70 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-on-ink" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {t(stage.label)}
          {progress.eta ? (
            <span className="font-normal opacity-80">
              {" "}
              · {t(progress.eta.key, { time: progress.eta.time })}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-[12px] font-medium uppercase tracking-[0.06em] underline underline-offset-2">
          {t("common.trackOrder")}
        </span>
      </div>
    </Link>
  );
}
