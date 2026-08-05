"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { hasTabBar } from "./(marketing)/TabBar";
import { Button } from "./ui/Button";

const STORAGE_KEY = "cb-cookie-consent-v1";
const BRAND_RED = "var(--cb-red)";

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
  const onTabBarRoute = hasTabBar(usePathname());
  if (consented) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      // z-[1000] rather than the 200 this used to carry. Map libraries hand
      // their own panes, canvases and controls z-indexes in the hundreds
      // without setting one on the container — so nothing creates a stacking
      // context, those panes compete in the root one, and a bar at 200
      // renders *underneath the map*. On an installed PWA that looked like
      // the banner was cut off at the bottom of the screen; it wasn't
      // clipped, the map was painted over it. Still true of MapLibre, which
      // is why the number stayed after the map changed libraries.
      className="fixed inset-x-0 z-[1000] flex flex-col items-center justify-between gap-3 border-t border-line-grey bg-raise px-5 pt-4 sm:flex-row sm:px-8"
      style={{
        fontFamily: "var(--font-geist-sans), sans-serif",
        // Above the tab bar on the screens that have one, rather than over
        // the top of it — a consent bar that hides the navigation is a
        // consent bar people dismiss without reading, if they can find it.
        // The tab bar already sits above the home indicator on those routes,
        // so only the other case needs the safe-area padding.
        bottom: onTabBarRoute
          ? "calc(var(--cb-tab-bar-h) + env(safe-area-inset-bottom))"
          : 0,
        paddingBottom: onTabBarRoute
          ? "1rem"
          : "calc(1rem + env(safe-area-inset-bottom))",
      }}
    >
      <p className="m-0 text-center text-[13px] text-body sm:text-left">
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
      {/* The app's own primary button, not a square of brand red. The red
          version was the last hand-rolled button left after the design pass,
          and in dark mode — where the brand red lifts to a pink tint so it
          can be read as text — a filled block of it came out hot pink over
          an olive page. As a link colour the tint is right; as a fill it
          never was. */}
      <Button size="sm" className="shrink-0" onClick={acknowledge}>
        OK
      </Button>
    </div>
  );
}
