"use client";

import { useEffect, useRef } from "react";

// The slide-over shell shared by the shop's menu (top) and basket (right)
// drawers. Always mounted so it can animate closed as well as open —
// conditional rendering would snap it away — with `inert` keeping focus and
// clicks out while it's off-screen.
//
// z-[220] puts the whole surface (backdrop included) above the cookie
// consent bar (z-[200]): a drawer is a modal surface, and the basket's
// checkout button docks to the drawer's bottom edge, exactly where the
// banner would otherwise sit on top of it.
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

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    // Land focus on the drawer's first control (its close button), and keep
    // Tab cycling inside while it's up — same trap as DropListModal.
    const focusable = () =>
      panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled])',
      );
    focusable()?.[0]?.focus();

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

  // Only painted while the panel is actually on screen. A closed panel is
  // parked just outside the viewport, and a 40px blur reaches back across
  // that edge — which rendered as a dark band along the top (or side) of
  // every page. The container's overflow-hidden does not save us here: it
  // clips at the viewport box, so it stops the shadow spilling outward
  // while leaving the half that falls inward fully visible.
  const panelShadowClass = !open
    ? ""
    : side === "top"
      ? "shadow-[0_16px_40px_rgba(0,0,0,0.14)]"
      : side === "left"
        ? "shadow-[8px_0_40px_rgba(0,0,0,0.12)]"
        : "shadow-[-8px_0_40px_rgba(0,0,0,0.12)]";

  const panelTransformClass =
    side === "top"
      ? open
        ? "translate-y-0"
        : "-translate-y-full"
      : side === "left"
        ? open
          ? "translate-x-0"
          : "-translate-x-full"
        : open
          ? "translate-x-0"
          : "translate-x-full";

  return (
    // overflow-hidden keeps the closed panel, parked outside the viewport,
    // from extending the scrollable area. It does not contain the panel's
    // shadow — see panelShadowClass above for that.
    <div
      className={`fixed inset-0 z-[220] overflow-hidden ${open ? "" : "pointer-events-none"}`}
      inert={!open}
    >
      <div
        onClick={onClose}
        aria-hidden
        className={`absolute inset-0 bg-black/30 backdrop-blur-[2px] transition-opacity duration-300 ${
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
        className={`absolute flex flex-col overflow-y-auto bg-[#FAF8F0] pt-[env(safe-area-inset-top)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${panelShapeClass} ${panelShadowClass} ${panelTransformClass}`}
      >
        {children}
      </aside>
    </div>
  );
}
