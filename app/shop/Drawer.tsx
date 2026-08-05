"use client";

import { useEffect, useRef } from "react";

// The slide-over shell shared by the shop's menu (top) and basket (right)
// drawers. Always mounted so it can animate closed as well as open —
// conditional rendering would snap it away — with `inert` keeping focus and
// clicks out while it's off-screen.
//
// z-[1100] puts the whole surface (backdrop included) above the cookie
// consent bar (z-[1000]): a drawer is a modal surface, and the basket's
// checkout button docks to the drawer's bottom edge, exactly where the
// banner would otherwise sit on top of it. Still under Modal's 1200, which
// is the top of the stack.
export default function Drawer({
  open,
  onClose,
  side,
  label,
  children,
  // The basket needs more room than a sidebar for its rows (image, name,
  // price, stepper, remove) to stop crowding each other — see CartDrawer's
  // use of "wide". Only meaningful for side="left"/"right"; "top" is
  // always full-width.
  width = "narrow",
}: {
  open: boolean;
  onClose: () => void;
  side: "left" | "right" | "top";
  label: string;
  children: React.ReactNode;
  width?: "narrow" | "wide";
}) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;

    // Everything in here is deferred past the first two frames.
    //
    // It used to run synchronously, and that is what made the drawer snap
    // open with no slide at all on a phone: React's render, the style flip
    // that starts the transition, `overflow: hidden` reflowing the whole
    // document, and `focus()` forcing a scroll-into-view on a panel that is
    // still parked off-screen all landed in one task. The browser painted
    // once, at the end of it — by which time a 300ms transition had already
    // run its course in the background. The animation was never dropped; it
    // was finished before anything reached the screen.
    //
    // Two frames is enough for the panel to be on its layer and moving.
    // After that a reflow costs a frame nobody sees.
    let cancelled = false;
    const { body } = document;
    const previousOverflow = body.style.overflow;

    const focusable = () =>
      panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled])',
      );

    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        if (cancelled) return;
        body.style.overflow = "hidden";
        // preventScroll because the thing being focused sits inside a
        // scrollable panel: without it the browser scrolls that panel — and
        // the page under it — to "reveal" a control that is already where it
        // should be.
        focusable()?.[0]?.focus({ preventScroll: true });
      });
    });

    // Tab cycling stays inside while the drawer is up — same trap as
    // DropListModal. Bound immediately; only the layout-touching work waits.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const elements = focusable();
      if (!elements || elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
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
      cancelled = true;
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  const panelShapeClass =
    side === "top"
      ? // Full-width, sized to its content up to a cap rather than the
        // sidebars' h-full — a panel that drops down over the page rather
        // than a rail running its whole height.
        "left-0 right-0 top-0 max-h-[80dvh] w-full rounded-b-3xl"
      : side === "left"
        ? `top-0 left-0 h-full ${
            width === "wide" ? "w-[92vw] max-w-lg" : "w-[85vw] max-w-sm"
          }`
        : `top-0 right-0 h-full ${
            width === "wide" ? "w-[92vw] max-w-lg" : "w-[85vw] max-w-sm"
          }`;

  // The shadow is constant now, and the closed panel is parked its own width
  // *plus the blur radius* outside the viewport so the shadow has nowhere to
  // reach back into.
  //
  // It used to be applied only while open, to stop a 40px blur bleeding a
  // dark band across the edge of every page — the container's
  // overflow-hidden clips at the viewport box, so it stops the outward half
  // and leaves the inward half fully visible. But switching a 40px shadow on
  // at the same instant the panel starts moving means it paints at full
  // strength while the panel is still off-screen: a dark edge flashes, then
  // the drawer catches up with it. Parking further out fixes the band
  // without the flash, and lets the shadow stay on one layer for the whole
  // slide instead of being added mid-transition.
  const panelShadowClass =
    side === "top"
      ? "shadow-[0_16px_40px_rgba(0,0,0,0.14)]"
      : side === "left"
        ? "shadow-[8px_0_40px_rgba(0,0,0,0.12)]"
        : "shadow-[-8px_0_40px_rgba(0,0,0,0.12)]";

  const panelTransformClass =
    side === "top"
      ? open
        ? "translate-y-0"
        : "-translate-y-[calc(100%+48px)]"
      : side === "left"
        ? open
          ? "translate-x-0"
          : "-translate-x-[calc(100%+48px)]"
        : open
          ? "translate-x-0"
          : "translate-x-[calc(100%+48px)]";

  return (
    // overflow-hidden keeps the closed panel, parked outside the viewport,
    // from extending the scrollable area. It does not contain the panel's
    // shadow — see panelShadowClass above for that.
    <div
      className={`fixed inset-0 z-[1100] overflow-hidden ${open ? "" : "pointer-events-none"}`}
      inert={!open}
    >
      {/* A plain dim, not a blur. backdrop-filter over the whole viewport is
          recomputed every frame, and cross-fading one while a panel slides in
          front of it is the single most expensive thing this component could
          be asked to do — on a phone it drops the slide to a crawl. The dim
          reads the same and costs a composite. */}
      <div
        onClick={onClose}
        aria-hidden
        className={`absolute inset-0 bg-black/30 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        // Same reasoning as ShopHeader's inset: every variant is anchored to
        // the viewport's top edge, which extends under the notch, so the
        // panel carries the inset itself to keep its first row clear.
        //
        // overscroll-contain stops a flick inside the basket from chaining to
        // the page underneath once the list hits its end — on iOS that
        // chaining is what makes a drawer feel like it's fighting back.
        // overflow-hidden for the side rails, not overflow-y-auto.
        //
        // A side drawer is a column: a fixed header, a scrolling middle, a
        // docked footer. The middle does its own scrolling, so a scroller here
        // as well meant two nested ones — and because the middle is `flex-1`
        // in a flex column, whose default `min-height: auto` refuses to shrink
        // below its content, the inner one never actually engaged. The panel
        // scrolled instead, dragging the header and the checkout button off
        // with it and leaving rows sliced in half at the fold. The top drawer
        // is genuinely one scrolling sheet, so it keeps its scroller.
        className={`absolute flex touch-pan-y flex-col overscroll-contain bg-panel pt-[env(safe-area-inset-top)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          side === "top" ? "overflow-y-auto" : "overflow-hidden"
        } ${panelShapeClass} ${panelShadowClass} ${panelTransformClass}`}
        // Always on, not just while open.
        //
        // will-change is a hint about what is *about to* change, so applying
        // it in the same commit that moves the panel is applying it too late
        // — the browser gets told after the fact, and the first frames run
        // un-promoted. Dropping it the moment the drawer closes has the same
        // problem in reverse, on the way out. The cost is one composited
        // layer for one drawer, which is a fair price for both slides being
        // smooth.
        style={{ willChange: "transform" }}
      >
        {children}
      </aside>
    </div>
  );
}
