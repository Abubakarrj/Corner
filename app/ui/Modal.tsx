"use client";

import { useEffect, useRef } from "react";
import { useT } from "../i18n";

// The shell every modal in the app shares.
//
// It exists because of a rendering bug worth writing down. The modals used to
// be full-viewport `fixed inset-0` elements that stayed mounted at
// `opacity-0`, and one of them carried `backdrop-blur-md`. Both halves are
// problems:
//
//   A backdrop-filter over the whole viewport is recomputed against
//   everything behind it, every frame, and cross-fading one while a panel
//   slides in front of it is the most expensive thing a phone can be asked to
//   do here. That's the flicker — the compositor dropping frames and the blur
//   snapping between resolutions as it catches up.
//
//   An `opacity-0` element is still composited. The browser doesn't know it's
//   invisible in any useful sense, so a full-screen layer sits over the page
//   at all times.
//
// So: no blur, and `visibility` is toggled with a transition delay so the
// layer is genuinely gone between uses without losing the closing animation
// (visibility flips at the end of the fade out, immediately on the way in).
export default function Modal({
  open,
  onClose,
  label,
  children,
  // Above Leaflet, whose panes and controls sit in the 400–800 band. A modal
  // opened from the map renders under it otherwise.
  z = 1200,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  z?: number;
}) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // Keep Tab inside the sheet. Focus was moved in on open, but nothing
      // stopped it walking straight back out — three tabs and you're on the
      // page behind, operating a screen you can't see, with the dim still
      // over it. Wrapping is what makes "modal" true for a keyboard.
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) {
        // Nothing to land on, so the panel itself keeps it.
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    // Focus moves into the sheet so a keyboard or screen reader lands on it
    // rather than staying behind on whatever opened it.
    panelRef.current?.focus();

    // The page behind must not scroll under the sheet — on iOS that scroll
    // continues under your finger and makes the modal feel like it's floating
    // over a moving background.
    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = previous;
    };
  }, [open, onClose]);

  return (
    <div
      inert={!open}
      className="fixed inset-0 flex items-end justify-center sm:items-center"
      style={{
        // A bottom sheet on a phone reaches the floor, which is where the
        // cookie banner is. The modal has the higher z-index, so it painted
        // over the banner rather than the other way round — no control was
        // lost, but the banner was buried under a sheet and its OK button
        // couldn't be reached until the sheet was closed. Sitting the sheet
        // on top of the banner instead means both are usable, and it costs
        // nothing once consent is given (the variable goes to 0). Centred
        // dialogs on a wider screen are nowhere near the bottom, so this is
        // inert there too.
        paddingBottom: "var(--cb-consent-h, 0px)",
        zIndex: z,
        opacity: open ? 1 : 0,
        visibility: open ? "visible" : "hidden",
        pointerEvents: open ? "auto" : "none",
        // Tokens, not literals — see the motion block in globals.css. The
        // values are what this already did; naming them is what stops the
        // next dialog picking its own 200ms.
        //
        // Exit is one step faster than entry, and that asymmetry is the whole
        // trick: arriving should settle, leaving should get out of the way.
        transition: open
          ? "opacity var(--motion-base) var(--cb-ease-enter)"
          : "opacity var(--motion-fast) var(--cb-ease-exit), visibility 0s linear var(--motion-fast)",
      }}
    >
      {/* A dim, not a blur — see the note above. */}
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="relative max-h-[92dvh] w-full max-w-[420px] overflow-y-auto overscroll-contain rounded-t-3xl bg-surface px-6 pb-[calc(24px+env(safe-area-inset-bottom))] pt-6 outline-none sm:rounded-3xl sm:pb-7"
        style={{
          transform: open ? "none" : "translateY(14px)",
          // 14px and a fade, never a scale from zero: a sheet that grows out
          // of nothing reads as a pop-up, and at this size the eye cannot
          // tell a scale from a slide anyway.
          transition: open
            ? "transform var(--motion-base) var(--cb-ease-enter)"
            : "transform var(--motion-fast) var(--cb-ease-exit)",
          boxShadow: "0 -8px 40px rgba(0, 0, 0, 0.16)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="cb-press absolute right-3 top-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-raise hover:text-ink"
        >
          <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path
              d="M4.5 4.5l9 9M13.5 4.5l-9 9"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {children}
      </div>
    </div>
  );
}
