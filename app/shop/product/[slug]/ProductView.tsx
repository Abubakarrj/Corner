"use client";

import { useList, useT } from "../../../i18n";
import { useMenu } from "../../../i18n/menu";
import { formatPrice, possibleAllergens, type Product } from "../../products";
import ProductImage from "../../ProductImage";
import AddToCartForm from "./AddToCartForm";
import { DISPLAY_FONT } from "../../shopControls";

// The product page's body, split out of page.tsx so it can be a client
// component.
//
// The page above stays a server component: it's the thing that decides a slug
// is real and calls notFound(), and that decision has no business waiting for
// the browser. Everything below it is text — a name, a description, an
// allergen list — and all of it has to change with the chosen language, which
// is a client store. So the boundary is drawn exactly there.
//
// It takes the whole Product rather than a slug so the server's lookup isn't
// done twice, once on each side of the boundary.
export default function ProductView({
  product,
  initialOptions,
}: {
  product: Product;
  /** Options already chosen on the tile that sent us here — see page.tsx. */
  initialOptions?: string;
}) {
  const t = useT();
  const list = useList();
  const menu = useMenu();

  // Everything it could carry, since no choice has been made on this page yet.
  const allergens = possibleAllergens(product);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      {/* The "← Back to menu" link that used to sit here is gone. The header
          above carries a back control on every shop page now, and this was the
          third back-shaped thing within a hundred pixels of the top of a
          product page. It also went somewhere slightly wrong: it always meant
          the full catalog, so arriving from a search and pressing it threw the
          search away. The header's goes where you actually came from. */}
      {/* A fixed-width image column (not a 50/50 split) — this is a
          placeholder tile, not photography yet, and a 50/50 grid let it
          grow to fill half the page on a wide screen, which read as
          oversized. Fixed at 320px regardless of container width, rather
          than a max-width that a narrower column could already sit under
          without ever engaging. */}
      <div className="grid gap-8 sm:grid-cols-[320px_1fr]">
        <div className="relative">
          <ProductImage
            swatch={product.swatch}
            name={menu.name(product)}
            className="aspect-square w-full rounded-2xl"
          />
          {product.tag ? (
            <span
              className="absolute left-3 top-3 rounded-full bg-ink px-2.5 py-0.5 text-[10px] font-medium text-on-ink"
            >
              {product.tag}
            </span>
          ) : null}
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-[0.08em] text-muted">
            {menu.category(product.category)}
          </p>
          <h1
            className="mt-1 text-[20px] leading-tight text-ink"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            {menu.name(product)}
          </h1>
          <p className="mt-1 text-[14px] text-muted">
            {formatPrice(product.priceCents)}
          </p>
          <p className="mt-4 text-[13px] leading-[1.6] text-ink">
            {menu.description(product)}
          </p>

          <div className="mt-6">
            <AddToCartForm slug={product.slug} initialOptions={initialOptions} />
          </div>

          {/* Ingredients, not a safety claim — see the note on Product.allergens.
              Shown on every item, including the ones that carry none, because
              a missing section reads as "we didn't check" and an empty one
              reads as "we did". */}
          <div className="mt-7 border-t border-line pt-5">
            <h2 className="m-0 text-[11px] uppercase tracking-[0.09em] text-faint">
              {t("product.allergens")}
            </h2>
            <p className="m-0 mt-2 text-[13px] leading-[1.5] text-ink">
              {allergens.length > 0
                ? t("product.contains", {
                    list: list(allergens.map(menu.allergen)),
                  })
                : t("product.noAllergens")}
            </p>
            <p className="m-0 mt-1.5 text-[12px] leading-[1.5] text-muted">
              {t("product.allergenNote")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
