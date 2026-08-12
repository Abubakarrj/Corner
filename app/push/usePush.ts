"use client";

import { useCallback, useEffect, useState } from "react";

// Turning notifications on, from the device.
//
// ——— The iOS rule that shapes all of this ———
//
// Safari has supported Web Push since 16.4, and only for a site the customer
// has added to their Home Screen. In a normal Safari tab the API is missing
// entirely — not denied, absent — so on most iPhones the honest state is not
// "off", it is "install the app first". A screen that shows a dead toggle to
// everybody on iOS is worse than one that says what to do, which is why
// `state` distinguishes them.
//
// ——— And the rule that shapes the rest ———
//
// Permission has to be requested inside a user gesture. Asking on page load
// gets refused by the browser on some platforms and, worse, gets refused by
// the person on all of them: a prompt that arrives before there is anything to
// be notified about is a prompt that gets denied permanently. So this is only
// ever called from a press, on a screen where an order is already in progress.

export type PushState =
  /** The browser has no push at all, or the service worker is unavailable. */
  | "unsupported"
  /** iOS in a tab: it will work, once the app is on the Home Screen. */
  | "needs-install"
  /** The server has no keys or no database yet. */
  | "unconfigured"
  /** Available and not yet asked. */
  | "off"
  /** Subscribed on this device for this order. */
  | "on"
  /** The person said no. Only their browser settings can undo it. */
  | "denied"
  | "working";

/** iOS gives Safari-in-a-tab no push, and an installed PWA full push. */
function installedToHomeScreen(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // The old iOS-only flag, still the reliable one on older versions.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isApple(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/** base64url to the Uint8Array the subscription API wants. */
function toKey(base64url: string): ArrayBuffer {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  // Returned as a plain ArrayBuffer: applicationServerKey is typed BufferSource,
  // and a Uint8Array over a generic ArrayBufferLike stopped satisfying that.
  const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
  return bytes.buffer.slice(0, bytes.length) as ArrayBuffer;
}

export type PushOrder = {
  id: string;
  toastGuid?: string;
  deliveryId?: string;
};

export function usePush(order: PushOrder | null, locale: string) {
  const [state, setState] = useState<PushState>("working");

  // What the situation is before anybody presses anything. Deliberately does
  // not ask for permission — see the note above.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        // On iOS the API is genuinely absent until the app is installed, so
        // "unsupported" would be a lie to an iPhone that can do this.
        if (alive) setState(isApple() && !installedToHomeScreen() ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (alive) setState("denied");
        return;
      }
      let enabled = false;
      try {
        const response = await fetch("/api/push/subscribe", { cache: "no-store" });
        enabled = Boolean(((await response.json()) as { enabled?: boolean }).enabled);
      } catch {
        enabled = false;
      }
      if (!alive) return;
      if (!enabled) {
        setState("unconfigured");
        return;
      }
      // Already subscribed on this device? Then it is on, and the button
      // should say so rather than offering to turn on what is already on.
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const existing = await registration?.pushManager.getSubscription();
        if (alive) setState(existing ? "on" : "off");
      } catch {
        if (alive) setState("off");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /** Call this from a press, never from an effect. */
  const enable = useCallback(async () => {
    if (!order) return;
    setState("working");
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const { key } = (await (await fetch("/api/push/subscribe")).json()) as { key?: string };
      if (!key) {
        setState("unconfigured");
        return;
      }

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          // Required to be true by every browser: a push that shows no
          // notification is not allowed, which is the rule that stops this
          // channel being used for silent tracking.
          userVisibleOnly: true,
          applicationServerKey: toKey(key),
        }));

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...subscription.toJSON(),
          orderId: order.id,
          toastGuid: order.toastGuid,
          deliveryId: order.deliveryId,
          locale,
        }),
      });
      setState(response.ok ? "on" : "unconfigured");
    } catch (error) {
      console.error("[push] could not subscribe:", error);
      setState("off");
    }
  }, [order, locale]);

  const disable = useCallback(async () => {
    setState("working");
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => {});
        await subscription.unsubscribe();
      }
    } catch {
      // Nothing to undo.
    }
    setState("off");
  }, []);

  return { state, enable, disable };
}
