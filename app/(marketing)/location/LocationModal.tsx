"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { hasConsented, subscribeConsentChanged } from "../../CookieConsent";
import { LOCATIONS } from "./locations";

// Server snapshot reports "consented" so the server-rendered HTML and the
// client's first paint agree — same as everywhere else this store is read.
function getConsentServerSnapshot() {
  return true;
}

const BRAND_RED = "#BE1923";

// The location picker, modeled on Middle Child's: a pop-up over the site
// holding a stacked list of storefront drawings, each captioned with its
// neighbourhood.
//
// The list scrolls inside the card rather than the card growing with it, so
// the modal stays the same size at one location or at eight — the header and
// its close button stay put while the list moves under them. That's the
// whole reason the card is a flex column with a fixed max height: the
// scrolling has to happen in the list, not in the page behind the overlay.
//
// Closing navigates home, because this modal *is* the /location route — it
// has a shareable URL rather than being a piece of transient state on the
// homepage. If it ever needs to open from a button instead, lift `onClose`
// to a prop and render it from wherever that button lives.
export default function LocationModal() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const consented = useSyncExternalStore(
    subscribeConsentChanged,
    hasConsented,
    getConsentServerSnapshot,
  );

  function close() {
    router.push("/");
  }

  // Lock the page behind the overlay, move focus into the dialog, close on
  // Escape, and keep Tab inside it — the same handling as the drop-list
  // modal, since this is the same kind of thing.
  useEffect(() => {
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    // Focus lands on the dialog itself, not the close button: aria-labelledby
    // means a screen reader announces the picker's title on arrival, and Tab
    // still reaches the close button first. Focusing the button instead put a
    // browser default outline around the ✕ the moment the modal opened.
    dialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        router.push("/");
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = previousOverflow;
    };
  }, [router]);

  const many = LOCATIONS.length > 1;

  return (
    <div
      // The cookie banner is docked to the bottom of this same viewport at a
      // higher z-index, so without the extra bottom padding it covers the
      // foot of the card — and with a scrolling list, the part it hides is
      // content. Padding the overlay shrinks the space the card centres in,
      // lifting it clear; it drops back to the even inset once consent is
      // answered. Same measured heights the chat widget clears (~100px on a
      // phone, ~69px on desktop), plus the safe-area inset the banner adds.
      className={`fixed inset-0 z-[100] flex items-center justify-center px-5 pt-5 transition-[padding] duration-200 ${
        consented
          ? "pb-5"
          : "pb-[calc(120px+env(safe-area-inset-bottom))] sm:pb-[calc(92px+env(safe-area-inset-bottom))]"
      } bg-black/40`}
      // A click on the backdrop closes; clicks inside the card bubble up to
      // here too, so only a hit on the backdrop itself counts.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-title"
        // Focusable only programmatically, so opening the modal can move
        // focus here without adding the card to the tab order.
        tabIndex={-1}
        // max-h-full + flex-col is what makes the list scroll instead of the
        // card growing past the viewport once there are more locations.
        // Measured against the overlay's padded box rather than a fixed vh,
        // so the banner clearance above is accounted for automatically and a
        // mobile browser's collapsing toolbars can't push the card's bottom
        // out of reach.
        className="relative flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none"
        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
      >
        <div className="relative shrink-0 px-6 pb-4 pt-6">
          <h2
            id="location-title"
            className="pr-8 text-center text-[15px] font-bold uppercase text-[#2D2D2D] sm:text-[17px]"
            style={{ letterSpacing: "0.08em" }}
          >
            {many ? "Choose your location" : "Our location"}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-5 top-5 cursor-pointer text-[#575757] transition-opacity hover:opacity-60"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path
                d="M4 4l12 12M16 4L4 16"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* The scroll region. overscroll-contain stops a flick past the end
            of this list from scrolling the page behind the overlay. */}
        <ul className="m-0 list-none overflow-y-auto overscroll-contain px-6 pb-6">
          {LOCATIONS.map((location, index) => (
            <li
              key={location.name}
              // Rule between entries rather than under every one, so a single
              // location doesn't get a stray line beneath it.
              className={index > 0 ? "mt-8 border-t border-[#E5E5E5] pt-8" : ""}
            >
              {/* The asset is transparent line art — ink in the alpha
                  channel, no paper behind it. The source scan's paper was
                  252-254 rather than pure white, and even clipped to 255 the
                  lossy WebP the image optimizer serves renders it back as
                  254, which reads as a faint grey panel against the card.
                  With no background at all there's nothing to mismatch.
                  Don't flatten it onto white. */}
              <Image
                src={location.image}
                alt={location.alt}
                width={831}
                height={900}
                className="h-auto w-full"
                priority={index === 0}
              />
              <p
                className="mt-3 text-center text-[24px] leading-tight sm:text-[28px]"
                style={{ color: BRAND_RED, letterSpacing: "-0.02em" }}
              >
                {location.name}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
