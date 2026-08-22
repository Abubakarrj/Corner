"use client";

import { useEffect } from "react";
import { activeOrder, useOrders } from "../account";

// The count on the installed app's icon, while an order is in flight.
//
// ——— ⚠️ Renders nothing, and is mounted once at the root ———
//
// The badge belongs to the *app*, not to a page, so it has to be set from
// somewhere that is mounted whether or not somebody is looking at the tracker.
// That is the whole reason this is a component in app/layout.tsx rather than an
// effect inside OrderStatusBar: the bar unmounts when you navigate to a page
// that does not show it, and a badge that clears itself because somebody opened
// the menu is worse than no badge.
//
// ——— Where it shows up ———
//
// An installed PWA on iOS 16.4 and later, an installed app on Android, and the
// dock or taskbar on desktop Chromium. In an ordinary browser tab it does
// nothing at all — there is no icon to draw on — and that is the common case,
// so this has to be silent rather than clever about it.
//
// ——— ⚠️ Every call is wrapped, and that is not defensive habit ———
//
// setAppBadge is not merely absent on browsers that do not have it. Where it
// exists it returns a promise that can reject — an installed app whose
// permission was revoked, a platform that has the method but no surface to draw
// on — and an unhandled rejection in a component mounted on every page of the
// site is an error report from every visitor using that browser.

/** Whether the badge was last seen set, so an unmount only clears what it set.
 *
 *  ⚠️ Module scope rather than a ref. React can mount a second copy of this
 *  during a development double-render, and two components each clearing on
 *  cleanup would race to wipe a badge the other one had just set. */
let showing = false;

function setBadge(count: number): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) {
      if (!nav.setAppBadge) return;
      showing = true;
      void nav.setAppBadge(count).catch(() => {});
      return;
    }
    if (!showing || !nav.clearAppBadge) return;
    showing = false;
    void nav.clearAppBadge().catch(() => {});
  } catch {
    // A platform that throws synchronously — an embedded webview with the
    // method present and the surface missing. The app is unaffected.
  }
}

export default function AppBadge() {
  const orders = useOrders();
  // ⚠️ Recomputed on every render rather than memoised on the order list.
  // Whether an order is still live is a function of the clock as much as of the
  // list — see progressFor — so a memo keyed on the orders would hold a badge
  // up long after the last one settled, until something unrelated re-rendered.
  const live = activeOrder(orders) !== null;

  useEffect(() => {
    setBadge(live ? 1 : 0);
  }, [live]);

  // ——— ⚠️ Cleared when the app is closed, not left behind ———
  //
  // An order that settles while nothing is open would otherwise leave the badge
  // up until the next visit. There is no way to clear it from a page that is
  // not running, so the next best thing is to not leave one behind on the way
  // out: pagehide fires when the app is backgrounded or closed, including the
  // bfcache case where unload does not.
  //
  // It costs a badge that disappears when you switch apps mid-order, which is
  // the wrong trade for a live order — so it only clears what is already
  // settled. A live one is set again by the effect above on the next open.
  useEffect(() => {
    const onHide = () => {
      if (!live) setBadge(0);
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [live]);

  return null;
}
