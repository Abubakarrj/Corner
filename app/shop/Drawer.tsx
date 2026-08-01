"use client";

import { useEffect, useRef } from "react";

// The slide-over shell shared by the shop's menu (left) and basket (right)
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
  // The menu's category list stays comfortable at a narrow width; the
  // basket needs more room so its rows (image, name, price, stepper,
  // remove) stop crowding each other — see CartDrawer's use of "wide".
  width = "narrow",
}: {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
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

  return (
    // overflow-hidden so the closed panel — parked just outside the viewport
    // — doesn't leak its box shadow back onto the screen edge.
    <div
      className={`fixed inset-0 z-[220] overflow-hidden ${open ? "" : "pointer-events-none"}`}
      inert={!open}
      style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
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
        className={`absolute top-0 flex h-full flex-col bg-[#FAF8F0] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          width === "wide" ? "w-[92vw] max-w-lg" : "w-[85vw] max-w-sm"
        } ${
          side === "left"
            ? `left-0 shadow-[8px_0_40px_rgba(0,0,0,0.12)] ${
                open ? "translate-x-0" : "-translate-x-full"
              }`
            : `right-0 shadow-[-8px_0_40px_rgba(0,0,0,0.12)] ${
                open ? "translate-x-0" : "translate-x-full"
              }`
        }`}
      >
        {children}
      </aside>
    </div>
  );
}
