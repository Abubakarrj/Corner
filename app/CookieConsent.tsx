"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Button } from "./ui/Button";

const STORAGE_KEY = "cb-cookie-consent-v1";
const BRAND_RED = "var(--cb-red)";

// Dispatched whenever consent is acknowledged, so components that care can
// react without importing this module's internals. DropListModal uses it to
// hold its timer until the banner is gone.
//
// Getting out of the banner's way is *not* what this is for any more. That's
// --cb-consent-h, the measured height published below: anything docked to the
// bottom of the screen adds it to its own offset, in CSS, with no subscription
// and no second copy of the storage key. ChatWidget used to do it this way and
// carried two hardcoded pixel heights to guess at the banner's size.
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
// The banner's height, published on <html> as --cb-consent-h so everything
// else can get out of its way.
//
// This exists because the banner is `position: fixed`, which means it takes no
// space and nothing knows it's there. On a phone that was survivable; in an
// Instagram or X in-app browser it isn't, because the host app's own chrome
// takes the top and bottom and the page is left with a viewport around 560px
// tall. A 120px banner is more than a fifth of that, and it was landing on
// the Order button on the map — the one control the entire app exists to
// reach — on a screen that can't be scrolled to get out from under it.
//
// Measured rather than hardcoded: the copy wraps to a different number of
// lines at 320px than at 400px, and a constant would be wrong at one of them.
// A ResizeObserver keeps it right through rotation and font scaling.
const CONSENT_HEIGHT_VAR = "--cb-consent-h";

function useConsentHeight(visible: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      root.style.setProperty(CONSENT_HEIGHT_VAR, "0px");
      return;
    }
    const element = ref.current;
    if (!element) return;

    const publish = () => {
      root.style.setProperty(CONSENT_HEIGHT_VAR, `${element.offsetHeight}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => {
      observer.disconnect();
      // Back to nothing on the way out, or every page keeps padding the
      // bottom of itself for a bar that isn't there any more.
      root.style.setProperty(CONSENT_HEIGHT_VAR, "0px");
    };
  }, [visible]);

  return ref;
}

export default function CookieConsent() {
  const consented = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ref = useConsentHeight(!consented);
  if (consented) return null;

  return (
    <div
      ref={ref}
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
      // One row, always — it used to stack the button under the text below
      // the `sm` breakpoint, which is what made it 120px tall on exactly the
      // screens with the least room. Side by side it's around 60px, and the
      // text simply wraps beside the button.
      //
      // Flush to the bottom on every route now, tab bar or not. It used to
      // lift itself above the tab bar, which meant two different geometries
      // to reason about and left the map's card rail sandwiched between them.
      // Sitting at the floor and having the page shorten itself by
      // --cb-consent-h is one rule instead of two.
      className="fixed inset-x-0 bottom-0 z-[1000] border-t border-line-grey bg-raise"
      style={{
        fontFamily: "var(--font-geist-sans), sans-serif",
        paddingBottom: "calc(0.875rem + env(safe-area-inset-bottom))",
      }}
    >
      {/* Capped and centred so this doesn't become a 1400px-wide sentence
          with a button marooned at the far end of a desktop screen. */}
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 pt-[0.875rem] sm:px-8">
        <p className="m-0 text-[13px] leading-[1.45] text-body">
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
    </div>
  );
}
