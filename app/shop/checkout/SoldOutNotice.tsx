"use client";

import Modal from "../../ui/Modal";
import { Button } from "../../ui/Button";
import { useT } from "../../i18n";

// What happened when the endpoint refused an order for items that went off the
// board while the basket was open.
//
// ——— Why this interrupts ———
//
// Almost nothing in this app should. This does, because the basket the
// customer is looking at is no longer the basket they are about to pay for,
// and the alternative is worse in both directions: leave the lines in and Pay
// fails again on every press, take them out quietly and somebody pays for a
// shorter order than the one they read.
//
// So the removal has already happened by the time this appears — the hook
// does it — and this says what went, in the customer's own language, naming
// the items rather than counting them. "2 items were removed" makes somebody
// go and work out which two.
//
// One button, and it does nothing but dismiss. The order is not re-sent
// automatically: the basket changed, the total changed, and re-submitting on
// their behalf would be charging a different amount than the one they last
// agreed to.
export default function SoldOutNotice({
  names,
  onClose,
}: {
  names: string[];
  onClose: () => void;
}) {
  const t = useT();
  // Joined with the locale's own list format where the browser has one, so
  // "A, B and C" does not come out as "A, B, C" in English or with the wrong
  // conjunction in Spanish.
  const list =
    typeof Intl !== "undefined" && "ListFormat" in Intl
      ? new Intl.ListFormat(undefined, { style: "long", type: "conjunction" }).format(names)
      : names.join(", ");

  return (
    <Modal open={names.length > 0} onClose={onClose} label={t("checkout.soldOutRemoved", { names: list })}>
      <p className="m-0 text-[16px] font-medium leading-snug text-ink">
        {t("checkout.soldOutRemoved", { names: list })}
      </p>
      <p className="m-0 mt-2 text-[14px] leading-[1.55] text-muted">
        {t("checkout.soldOutRemovedBody")}
      </p>
      {/* type="button", explicitly. Both surfaces render this inside their
          <form>, and a button with no type submits — so the control that
          dismisses "your order was refused" would have re-submitted the order
          it was telling you about. */}
      <Button type="button" onClick={onClose} className="mt-5 w-full">
        {t("common.dismiss")}
      </Button>
    </Modal>
  );
}
