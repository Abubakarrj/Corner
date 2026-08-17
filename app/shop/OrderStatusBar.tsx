"use client";

import Link from "next/link";
import { useT } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { activeOrder, progressFor, useOrders } from "../account";
import { useLiveStatus } from "./useLiveStatus";
import { SHOP_FONT } from "./shopControls";

// Docked height, published on <html> so a fixed element at the same edge can
// lift itself clear. Same arrangement as --cb-consent-h in CookieConsent, and
// for the same reason: a fixed bar takes no space, so nothing knows it's there.
const BAR_HEIGHT_VAR = "--cb-orderbar-h";

function usePublishedHeight(active: boolean) {
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const clear = () => root.style.setProperty(BAR_HEIGHT_VAR, "0px");
    if (!active) {
      clear();
      return;
    }
    const element = ref.current;
    if (!element) return;

    const publish = () => {
      root.style.setProperty(BAR_HEIGHT_VAR, `${element.offsetHeight}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => {
      observer.disconnect();
      clear();
    };
  }, [active]);

  return ref;
}

// The live-order bar, in the shape a delivery app puts at the top of its home
// screen: what's happening, when it's expected, and a way through to the
// tracker. Sits under the shop header while an order is in flight and
// disappears once its estimate has run out — a bar that sits there for a week
// saying "Ready around 8:24am" is worse than no bar.
//
// `dock` fixes it to the floor instead of leaving it in the flow, for the
// landing page, which has no column to sit at the bottom of.
export default function OrderStatusBar({ dock = false }: { dock?: boolean }) {
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
  // Before the early return: a hook cannot be called conditionally, and both
  // of these are written to take the absent case for exactly that reason.
  const live = useLiveStatus(order ?? undefined);
  const ref = usePublishedHeight(dock && order !== null);
  if (!order) return null;

  const progress = progressFor(order, "en-US", undefined, live);
  // progress.headline, not stage.label: these two read one status and drew two
  // conclusions from it, the tracker saying the delivery was canceled while
  // this strip, an inch above it, still said "On the way" with a pulsing dot
  // beside it. One computed answer, both consumers.

  return (
    <Link
      ref={ref}
      href={`/shop/order/${order.id}`}
      // ——— Why this isn't sky any more ———
      //
      // It was: a soft sky slab, chosen so the bar reads as the app telling
      // you something rather than as a primary button. That worked on the
      // shop's cream page and failed on the one screen people actually wait
      // on. This bar sits directly under Google's map, and Google's map is
      // blue — pale blue ocean in light mode, navy in dark. Soft sky landed
      // in the same family as the water in both, so the bar dissolved into
      // the coastline and the pulsing dot, which is the whole live signal,
      // was the lowest-contrast thing in the row.
      //
      // The ground is the app's own surface now, matching the tab bar below
      // it, so the two read as one block of chrome docked over the map
      // instead of a tinted strip floating in it. Nothing is lost by that:
      // sky moved to the dot and the action, where it is a small amount of
      // saturated colour on a neutral field rather than a large amount of
      // unsaturated colour on a coloured one, and it carries further.
      style={{
        fontFamily: SHOP_FONT,
        ...(dock
          ? {
              // Above the cookie banner, which docks to the same floor.
              bottom: "var(--cb-consent-h, 0px)",
              // ——— Why there is a constant here and not just env() ———
              //
              // On the app-shell routes this bar is followed by the tab bar,
              // and the tab bar is what carries the clearance at the floor.
              // Docked, this bar *is* the floor, and it inherited a rule
              // written for a component that never had to be.
              //
              // env(safe-area-inset-bottom) is only non-zero under
              // viewport-fit=cover, which /shop sets and the marketing tree
              // does not — and `dock` is used on exactly one screen, the
              // marketing landing page. So on the only route this rule runs
              // on, the env() term is always zero and the constant is the
              // whole clearance.
              //
              // 0.5rem was not enough of one. With the row's own py-2.5 that
              // put the text 18px off the floor, and an iPhone's home
              // indicator pill starts about 21px up — so the status line was
              // sitting under it. 1.25rem clears the pill by roughly 9px,
              // which is enough to read as deliberate space and not so much
              // that it reads as a gap on a device with no indicator at all.
              //
              // max(), not +. On a route that does report a real inset the
              // second term already wins and this must not add to it: 34px of
              // device inset plus 20px of ours is a band, not a margin.
              paddingBottom:
                "max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))",
            }
          : null),
      }}
      className={
        "block cursor-pointer border-y border-line bg-surface text-ink" +
        " transition-colors hover:bg-raise" +
        // Under the banner's z-[1000] on purpose: the banner has to be
        // reachable, and this has somewhere else to be read from.
        (dock ? " fixed inset-x-0 z-[900] border-b-0" : "")
      }
    >
      <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
        {/* The dot pulses because something is happening. On a canceled
            delivery nothing is, so it holds still — the animation is the
            strip's whole claim to being live, and a claim is what this one
            has stopped being entitled to. The dot itself stays: the order is
            still worth a row, it is just not in motion. */}
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
          {progress.canceled ? null : (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky opacity-70 motion-reduce:animate-none" />
          )}
          <span
            className={
              "relative inline-flex h-2 w-2 rounded-full" +
              (progress.canceled ? " bg-muted" : " bg-sky")
            }
          />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {t(progress.headline)}
          {/* Same order of precedence as the tracker: Uber saying the courier
              is about to arrive outranks any clock time, including Uber's own.
              Without this the strip read "On the way · Arriving around 8:42"
              directly above a page that said "Arriving now", which is two
              answers to one question a thumb's width apart. */}
          {live?.courierNear ? (
            <span className="font-normal text-muted"> · {t("order.arrivingNow")}</span>
          ) : progress.eta ? (
            <span className="font-normal text-muted">
              {" "}
              · {t(progress.eta.key, { time: progress.eta.time })}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-[12px] font-medium uppercase tracking-[0.06em] text-sky-ink underline underline-offset-2">
          {t("common.trackOrder")}
        </span>
      </div>
    </Link>
  );
}
