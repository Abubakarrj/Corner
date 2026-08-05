"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "cb-cookie-consent-v1";
const BRAND_RED = "#BE1923";

// Dispatched whenever consent is acknowledged, so other components that
// care (the shop's ChatWidget, which repositions to clear this banner while
// it's visible) can react without importing this module's internals — see
// the comment on ChatWidget's own copy of STORAGE_KEY for why.
export const COOKIE_CONSENT_CHANGED_EVENT = "cb-cookie-consent-changed";

// useSyncExternalStore rather than useState + an effect that reads
// localStorage — same reasoning as app/shop/CartContext.tsx: it's the
// hydration-safe way to read an external synchronous store like localStorage
// without a setState-inside-an-effect render loop. getServerSnapshot always
// reports "consented" (hidden), so the server-rendered HTML and the client's
// first paint agree; React swaps in the real answer right after hydration.
export function hasConsented(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    // Private browsing or blocked storage — show it every visit rather
    // than not at all.
    return false;
  }
}

// Subscribes to the window event above, for components that need to know
// whether this banner is currently on screen. The module-local `listeners`
// set below only serves this component's own instance; anything outside it
// has to go through the event. DropListModal uses this to hold its timer
// until the banner is gone, so a first-time visitor never gets a marketing
// pop-up stacked on top of a consent bar.
export function subscribeConsentChanged(callback: () => void) {
  window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, callback);
  return () => window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, callback);
}

const listeners = new Set<() => void>();
function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
function getSnapshot() {
  return hasConsented();
}
function getServerSnapshot() {
  return true;
}

function acknowledge() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "acknowledged");
  } catch {
    // Nothing to persist to — it'll just show again next visit, which is
    // better than the button appearing to do nothing.
  }
  listeners.forEach((listener) => listener());
  window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGED_EVENT));
}

// Site-wide (mounted in the true root layout, not the marketing route
// group), since cookies get set on the shop subdomain too — the cart uses
// localStorage there just like the drop-list modal does here.
export default function CookieConsent() {
  const consented = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (consented) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      // The extra bottom padding is inert (env() resolves to 0) everywhere
      // except the shop, which opts into viewport-fit=cover — there, it
      // keeps this bar clear of the home-indicator gesture area instead of
      // sitting flush against it.
      className="fixed inset-x-0 bottom-0 z-[200] flex flex-col items-center justify-between gap-3 border-t border-[#E2E2E2] bg-[#F7F7F7] px-5 pt-4 sm:flex-row sm:px-8"
      style={{
        fontFamily: "var(--font-geist-sans), sans-serif",
        paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
      }}
    >
      <p className="m-0 text-center text-[13px] text-[#575757] sm:text-left">
        By continuing to use this site, you{" "}
        {/* "consent" was already painted brand red, which reads as a link
            whether or not it is one. It now is one: it opens the cookie
            policy. proxy.ts passes /cookie-policy through unrewritten so
            this still resolves on the shop subdomain, where this banner
            also renders. */}
        <Link
          href="/cookie-policy"
          style={{ color: BRAND_RED }}
          className="cursor-pointer underline underline-offset-2 transition-opacity hover:opacity-70"
        >
          consent
        </Link>{" "}
        to our use of cookies.
      </p>
      <button
        type="button"
        onClick={acknowledge}
        style={{ backgroundColor: BRAND_RED }}
        className="shrink-0 cursor-pointer px-6 py-2 text-[13px] font-medium uppercase tracking-[0.06em] text-white transition-opacity hover:opacity-90"
      >
        OK
      </button>
    </div>
  );
}
