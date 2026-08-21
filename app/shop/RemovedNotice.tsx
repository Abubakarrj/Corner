"use client";

import { useT } from "../i18n";
import { useMenu } from "../i18n/menu";
import { useCart, useRemovedLine } from "./CartContext";
import { getProduct } from "./products";

// The way back from a deletion that was a mis-tap.
//
// ——— Why it follows the basket rather than sitting on one screen ———
//
// The stepper that deletes at a quantity of one is in three places — the cart
// page, the drawer, and the basket tab inside the chat — and all three share
// one store. A notice living on the cart page would leave the two smallest,
// most crowded versions of the control without a way back, which is where the
// mis-tap is likeliest.
//
// ——— It does not time out ———
//
// The usual shape for this is a toast that fades after five seconds. Fading is
// what makes an undo useless here: the mistake is noticed when somebody looks
// back at the basket and sees a row missing, and that can be a scroll and a
// re-read away. Nothing is broken by an offer that stays; what ends it is a
// real change to the basket, which is the moment putting the line back stops
// meaning what it said.
//
// ⚠️ role="status", not an alert. It is announced after whatever the screen
// reader is already saying rather than interrupting it — the deletion has
// happened and the stepper has already reported the change.
export default function RemovedNotice({ className = "" }: { className?: string }) {
  const t = useT();
  const menu = useMenu();
  const { undoRemove } = useCart();
  const line = useRemovedLine();
  if (!line) return null;

  const product = getProduct(line.slug);
  if (!product) return null;

  return (
    <div
      role="status"
      className={`flex items-center justify-between gap-3 rounded-xl border border-line-soft bg-surface px-4 py-2.5 ${className}`}
    >
      <span className="min-w-0 flex-1 text-[13px] leading-[1.45] text-muted">
        {t("cart.removedOne", { name: menu.name(product) })}
      </span>
      {/* Named for what it puts back, not just "Undo". Read out of context —
          which is how a screen reader reaches it, jumping by control — a bare
          "Undo" is a button whose effect is a guess. */}
      <button
        type="button"
        onClick={undoRemove}
        aria-label={t("cart.undoRemoveOf", { name: menu.name(product) })}
        className="cb-tap cb-press shrink-0 cursor-pointer text-[13px] font-medium text-ink underline transition-opacity hover:opacity-70"
      >
        {t("common.undo")}
      </button>
    </div>
  );
}
