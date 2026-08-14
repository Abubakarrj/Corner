"use client";

import { useRouter } from "next/navigation";
import { useT } from "../../i18n";
import { DELIVERY_RADIUS_MILES } from "../locations/locations";

// The heading, the one line under it, and the way out.
//
// ——— One line, and it used to be three ———
//
// It said the radius, then that the shaded area was measured on real roads
// rather than being a circle, then that you should check your address below.
// Two of those three were notes to ourselves: how the shape is computed is
// our problem, and a field with a Check button beside it does not need a
// sentence announcing that it can be used. What is left is the rule.
//
// ——— And why the way out is an X ———
//
// It was "← Back to the menu", which is a guess about where somebody came
// from, and usually a wrong one: this page is reached from the (i) beside the
// delivery fee, mid-checkout, with a full basket. Sending them to the catalog
// means finding their way back to a cart they had already filled.
//
// An X closes. router.back() returns them to the exact screen they left,
// whichever one it was — and falls back to the shop for anyone who arrived
// here from a link, where there is nothing behind them to go back to.
export default function DeliveryAreaCopy() {
  const t = useT();
  const router = useRouter();

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] font-medium leading-tight text-ink">
            {t("deliveryArea.title")}
          </h1>
          <p className="m-0 mt-2 text-[15px] leading-[1.55] text-muted">
            {t("deliveryArea.lead", { miles: String(DELIVERY_RADIUS_MILES) })}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            // history.length is 1 on a tab opened straight onto this URL.
            // Anything above that means there is a real screen behind us,
            // and it is the one somebody wants back.
            if (window.history.length > 1) router.back();
            else router.push("/shop");
          }}
          aria-label={t("common.close")}
          className="cb-press -mt-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-ink hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path
              d="M2 2l10 10M12 2L2 12"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </>
  );
}
