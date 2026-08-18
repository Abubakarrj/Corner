"use client";

import { useT } from "../i18n";
import { useMenu } from "../i18n/menu";
import { useCart, useCartRows, MAX_PER_LINE } from "./CartContext";
import { formatPrice } from "./products";
import ProductImage from "./ProductImage";
import OptionPicker from "./OptionPicker";
import { Button } from "../ui/Button";

// The basket, inside the chat panel.
//
// The same rows the drawer and /shop/cart show, at the panel's scale. It is a
// separate component rather than the drawer reused because the drawer is a
// full-height sheet with its own header, cross-sell rail and gift progress
// bar — none of which fits in a 344px column that also has a conversation in
// it. What it shares is the data: useCartRows, so a quantity changed here is
// the same line the checkout prices.
function BagIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M4.4 6.6h11.2l-.9 9a1.6 1.6 0 0 1-1.6 1.4H6.9a1.6 1.6 0 0 1-1.6-1.4l-.9-9Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M7.4 8.2V5.9a2.6 2.6 0 0 1 5.2 0v2.3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ChatCart({ onCheckout }: { onCheckout: () => void }) {
  const t = useT();
  const menu = useMenu();
  const rows = useCartRows();
  const { setQuantity, removeItem, setLineOptions, subtotalCents } = useCart();

  // Reachable now that the tabs are there from the start, so it's a screen
  // rather than a state nobody could get to: a mark, a line saying what's
  // true, and a line saying what to do about it.
  if (rows.length === 0) {
    return (
      <div className="flex min-h-[188px] flex-col items-center justify-center px-6 py-10 text-center">
        <span
          aria-hidden
          className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-raise text-ink"
        >
          <BagIcon />
        </span>
        <p className="m-0 text-[15px] font-medium leading-tight text-ink">
          {t("chat.bagEmptyTitle")}
        </p>
        <p className="m-0 mt-1.5 max-w-[15rem] text-[12px] leading-[1.5] text-muted">
          {t("chat.bagEmptyBody")}
        </p>
      </div>
    );
  }

  // Held back for the same reason the basket page holds it back: a line
  // missing its bagel can't be made, and the endpoint refuses it. Better to
  // say so next to the picker than at the end of a form.
  const blocked = rows.some((row) => !row.complete || row.gone || row.elsewhere);

  return (
    <div className="flex flex-col">
      <div className="flex flex-col divide-y divide-line-faint px-3.5">
        {rows.map(({ line, product, key, unitCents, lineCents, chosen, complete, gone }) => (
          <div key={key} className="flex gap-3 py-3">
            <ProductImage
              swatch={product.swatch}
              category={product.category}
              name={menu.name(product)}
              className="h-12 w-12 shrink-0 rounded-lg"
            />

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 text-[13px] leading-[1.3] text-ink">
                  {menu.name(product)}
                </span>
                <span className="shrink-0 text-[13px] tabular-nums text-ink">
                  {formatPrice(lineCents)}
                </span>
              </div>

              {chosen.length > 0 ? (
                <span className="mt-0.5 text-[11px] leading-[1.4] text-muted">
                  {menu.options(product, line.options).join(" · ")}
                </span>
              ) : null}

              <span className="mt-0.5 text-[11px] text-quiet">
                {t("product.eachPrice", { price: formatPrice(unitCents) })}
              </span>

              {gone ? (
                <span className="mt-1 w-fit rounded-full bg-sun-soft px-2 py-[3px] text-[10px] font-medium leading-none text-sun-ink">
                  {t("common.soldOutToday")}
                </span>
              ) : null}

              {/* A line that came in without its choices — from a basket saved
                  before the item had any, or one Riley filled without asking.
                  Answering it here is the only way out that isn't deleting it. */}
              {!complete ? (
                <div className="mt-1.5">
                  <p className="mb-1 text-[10px]" style={{ color: "var(--cb-red)" }}>
                    {t("cart.chooseBefore")}
                  </p>
                  <OptionPicker
                    product={product}
                    selected={line.options}
                    onChange={(next) => setLineOptions(key, next)}
                    idPrefix={`chat-${key}`}
                  />
                </div>
              ) : null}

              <div className="mt-2 flex items-center gap-2.5">
                <div className="flex items-center rounded-full border border-line-soft">
                  <button
                    type="button"
                    aria-label={t("cart.decreaseOf", { name: menu.name(product) })}
                    onClick={() => setQuantity(key, line.quantity - 1)}
                    className="h-7 w-7 cursor-pointer rounded-full text-[13px] text-ink transition-opacity hover:opacity-60"
                  >
                    −
                  </button>
                  <span className="w-5 text-center text-[12px] tabular-nums text-ink">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label={t("cart.increaseOf", { name: menu.name(product) })}
                    onClick={() => setQuantity(key, line.quantity + 1)}
                    disabled={line.quantity >= MAX_PER_LINE}
                    className="h-7 w-7 cursor-pointer rounded-full text-[13px] text-ink transition-opacity hover:opacity-60 disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(key)}
                  className="cursor-pointer text-[11px] text-quiet underline transition-opacity hover:opacity-70"
                >
                  {t("common.remove")}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-line-faint px-3.5 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink">{t("common.subtotal")}</span>
          <span className="text-[14px] font-medium tabular-nums text-ink">
            {formatPrice(subtotalCents)}
          </span>
        </div>
        <Button block className="mt-3" disabled={blocked} onClick={onCheckout}>
          {t("common.checkout")}
        </Button>
      </div>
    </div>
  );
}
