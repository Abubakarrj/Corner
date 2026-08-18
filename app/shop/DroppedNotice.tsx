"use client";

import { useT } from "../i18n";
import { useDroppedForCounter } from "./CartContext";

// What choosing a different counter took out of the basket.
//
// ——— Why this is a component and not a line on one screen ———
//
// The counter can be changed from three places now: the finder, the pickup
// picker on the checkout, and the tab bar. Whichever one is used, the basket
// quietly gets shorter — and a basket that gets shorter without saying why is
// the failure that removing the lines was supposed to avoid. Somebody would
// pay for a smaller order than the one they read.
//
// So the notice follows the basket rather than living on one screen. It shows
// wherever the basket is on screen: the cart page, the drawer, the checkout.
//
// It is not dismissible and it does not time out. A message about something
// that has already been taken away has no action attached to it, so a close
// button would only be a way to make it stop being true on screen; and a
// message that fades is one somebody scrolling can miss entirely. It goes
// when the next counter change replaces it, or when the tab does.
export default function DroppedNotice({ className = "" }: { className?: string }) {
  const t = useT();
  const dropped = useDroppedForCounter();
  if (dropped.length === 0) return null;

  return (
    <div
      role="status"
      className={`rounded-xl bg-sun-soft px-4 py-3 text-[13px] leading-[1.45] text-sun-ink ${className}`}
    >
      {t("cart.droppedForCounter", { items: dropped.join(", ") })}
    </div>
  );
}
