"use client";

import Link from "next/link";
import { useT } from "../i18n";
import { useMenu } from "../i18n/menu";
import Drawer from "./Drawer";
import ProductImage from "./ProductImage";
import FreeDeliveryBar from "./FreeDeliveryBar";
import CrossSellStrip from "./CrossSellStrip";
import DroppedNotice from "./DroppedNotice";
import { useCart, useCartRows, MAX_PER_LINE } from "./CartContext";
import OptionPicker from "./OptionPicker";
import { formatPrice, getCrossSellProducts } from "./products";
import { servesProduct } from "./storeMenu";
import { Button, ButtonLink } from "../ui/Button";
import { DISPLAY_FONT } from "./shopControls";
import { useFulfillment } from "../fulfillment";

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M3.5 3.5l11 11M14.5 3.5l-11 11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Greyed-out twin of ShopHeader's BasketIcon — keep the two in step.
function EmptyBasketIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 8.6 12 4l3 4.6"
        stroke="var(--cb-line-mute)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="3" y="8" width="18" height="3.4" rx="1.7" fill="var(--cb-line-mute)" />
      <path
        d="M5 11.4h14l-.95 7.4a2.2 2.2 0 0 1-2.18 1.9H8.13a2.2 2.2 0 0 1-2.18-1.9L5 11.4Z"
        fill="var(--cb-line-mute)"
      />
      <circle cx="12" cy="5.1" r="0.65" fill="var(--cb-panel)" />
      <rect x="7.55" y="13" width="1.9" height="5.2" rx="0.95" fill="var(--cb-panel)" />
      <rect x="11.05" y="13" width="1.9" height="5.2" rx="0.95" fill="var(--cb-panel)" />
      <rect x="14.55" y="13" width="1.9" height="5.2" rx="0.95" fill="var(--cb-panel)" />
    </svg>
  );
}

// The slide-over basket. Opens from the header's basket button and — via
// OPEN_BASKET_EVENT — whenever an item is added, so the confirmation for
// "add to cart" is seeing the thing sitting in the basket, not a toast.
// Which counter this basket is going to, or null for a delivery and for
// somebody who has not chosen. Same derivation as ShopCatalog's.
function counterOf(fulfillment: ReturnType<typeof useFulfillment>): string | null {
  if (!fulfillment || fulfillment.mode === "delivery") return null;
  return fulfillment.locationId;
}

export default function CartDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const menu = useMenu();
  const fulfillment = useFulfillment();
  const { lines, setQuantity, removeItem, setLineOptions, subtotalCents, itemCount } =
    useCart();

  const rows = useCartRows();
  const at = counterOf(fulfillment);

  return (
    <Drawer open={open} onClose={onClose} side="right" label={t("shop.basket")} width="wide">
      {/* shrink-0 on every band except the list. The panel is a fixed-height
          column now (Drawer stopped scrolling as a second, outer scroller),
          so without this the header, the gift bar, the cross-sell rail and
          the checkout footer all compress to make room for a long basket
          instead of the list scrolling. */}
      <div className="flex shrink-0 items-center justify-between border-b border-line-faint px-6 py-4">
        <h2
          className="text-[15px] font-medium text-ink"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          Your Basket
          {itemCount > 0 ? (
            <span className="ml-2 font-normal text-quiet">({itemCount})</span>
          ) : null}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("cart.closeBasket")}
          className="flex h-9 w-9 cursor-pointer items-center justify-center text-ink transition-opacity hover:opacity-60"
        >
          <CloseIcon />
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <EmptyBasketIcon />
          <div>
            <p className="text-[13px] font-medium text-ink">
              {t("cart.emptyDrawer")}
            </p>
            <p className="mt-1 text-[12px] text-quiet">
              {t("cart.emptyDrawerSub")}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("common.browseMenu")}
          </Button>
        </div>
      ) : (
        <>
          {/* Only where there is a fee to waive. On pickup this bar would be
              counting toward nothing. */}
          {fulfillment?.mode === "delivery" ? (
            <FreeDeliveryBar subtotalCents={subtotalCents} />
          ) : null}

          {/* min-h-0 is what makes this the scroller. `flex-1` alone leaves
              min-height: auto, which refuses to shrink below the height of
              the rows — so the column overflowed and nothing here ever
              scrolled. */}
          <div className="min-h-0 flex-1 divide-y divide-line-faint overflow-y-auto overscroll-contain px-6">
            {rows.map(({ line, product, key, unitCents, chosen, complete }) => (
              <div key={key} className="flex gap-4 py-5">
                {/* aria-hidden and out of the tab order: the name link
                    beside it is the same destination, named. See
                    ProductCard.tsx. */}
                <Link
                  href={`/shop/product/${product.slug}`}
                  onClick={onClose}
                  aria-hidden
                  tabIndex={-1}
                  className="shrink-0 cursor-pointer"
                >
                  <ProductImage
                    swatch={product.swatch}
                    category={product.category}
                    name={menu.name(product)}
                    className="h-20 w-20 rounded-lg"
                  />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/shop/product/${product.slug}`}
                      onClick={onClose}
                      className="cursor-pointer text-[13px] font-medium text-ink hover:underline"
                    >
                      {menu.name(product)}
                    </Link>
                    <span className="whitespace-nowrap text-[13px] text-ink">
                      {formatPrice(unitCents * line.quantity)}
                    </span>
                  </div>
                  {/* What was chosen, so the basket is checkable at a glance
                      — this is where a wrong bagel gets caught. */}
                  {chosen.length > 0 ? (
                    <span className="mt-0.5 text-[12px] text-muted">
                      {menu.options(product, line.options).join(" · ")}
                    </span>
                  ) : null}
                  <span className="mt-0.5 text-[12px] text-quiet">
                    {t("product.eachPrice", { price: formatPrice(unitCents) })}
                  </span>
                  {/* A line that arrived without its choices — from a
                      basket saved before this item had any. Answering here
                      is the only way out that doesn't mean deleting it. */}
                  {!complete ? (
                    <div className="mt-1.5">
                      <p className="mb-1 text-[11px]" style={{ color: "var(--cb-red)" }}>
                        {t("cart.chooseBefore")}
                      </p>
                      <OptionPicker
                        product={product}
                        selected={line.options}
                        onChange={(next) => setLineOptions(key, next)}
                        idPrefix={`basket-${key}`}
                      />
                    </div>
                  ) : null}

                  <div className="mt-auto flex items-center justify-between pt-3">
                    <div className="flex items-center rounded-full border border-line-soft">
                      <button
                        type="button"
                        aria-label={t("cart.decreaseOf", { name: menu.name(product) })}
                        onClick={() => setQuantity(key, line.quantity - 1)}
                        className="cb-tap h-8 w-8 cursor-pointer rounded-full text-[14px] text-ink transition-opacity hover:opacity-60"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-[12px] text-ink">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={t("cart.increaseOf", { name: menu.name(product) })}
                        onClick={() => setQuantity(key, line.quantity + 1)}
                        disabled={line.quantity >= MAX_PER_LINE}
                        className="cb-tap h-8 w-8 cursor-pointer rounded-full text-[14px] text-ink transition-opacity hover:opacity-60"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(key)}
                      className="cb-tap cursor-pointer text-[11px] text-quiet underline transition-opacity hover:opacity-70"
                    >
                      {t("common.remove")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Narrowed to the counter, like the catalog and the tabs. This
              rail was the one surface still offering the whole menu, so the
              outlet's basket suggested a sandwich under "you might also
              like" — a recommendation the counter cannot fill, one tap from
              a basket it would then block. */}
          <DroppedNotice className="mx-6 mb-3" />
          <CrossSellStrip
            products={getCrossSellProducts(
              lines.map((line) => line.slug),
              4,
              (product) => servesProduct(at, product),
            )}
            onNavigate={onClose}
          />

          {/* Extra bottom padding clears the home-indicator gesture area
              under viewport-fit=cover; env() is 0 anywhere that isn't set,
              so it's inert elsewhere. */}
          <div
            className="shrink-0 border-t border-line-faint px-6 pt-4"
            style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-ink">{t("common.subtotal")}</span>
              <span
                className="text-[14px] font-medium text-ink"
                style={{ fontFamily: DISPLAY_FONT }}
              >
                {formatPrice(subtotalCents)}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-quiet">
              {t("cart.paymentConfirmed")}
            </p>
            {/* Held back while a line still needs a choice — the picker for
                it is up in the list, so there's nowhere useful to send
                someone who presses this. */}
            {rows.some((row) => !row.complete || row.gone || row.elsewhere) ? (
              <Button block disabled className="mt-3">
                {t("common.checkout")}
              </Button>
            ) : (
              <ButtonLink href="/shop/checkout" onClick={onClose} block className="mt-3">
                {t("common.checkout")}
              </ButtonLink>
            )}
            <Link
              href="/shop/cart"
              onClick={onClose}
              className="cb-tap mt-3 block cursor-pointer text-center text-[11px] text-body underline transition-opacity hover:opacity-70"
            >
              {t("cart.viewFull")}
            </Link>
          </div>
        </>
      )}
    </Drawer>
  );
}
