import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ALLERGEN_NOTE,
  formatPrice,
  getProduct,
  possibleAllergens,
} from "../../products";
import ProductImage from "../../ProductImage";
import AddToCartForm from "./AddToCartForm";
import { DISPLAY_FONT } from "../../shopControls";

// "wheat, dairy and egg" — an Oxford-less list, because this is read aloud
// more often than it's read.
function listed(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  // Everything it could carry, since no choice has been made on this page yet.
  const allergens = possibleAllergens(product);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/shop"
        className="mb-6 inline-block cursor-pointer text-[13px] text-muted underline"
      >
        ← Back to the menu
      </Link>

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
            name={product.name}
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
            {product.category}
          </p>
          <h1
            className="mt-1 text-[20px] leading-tight text-ink"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            {product.name}
          </h1>
          <p className="mt-1 text-[14px] text-muted">
            {formatPrice(product.priceCents)}
          </p>
          <p className="mt-4 text-[13px] leading-[1.6] text-ink">
            {product.description}
          </p>

          <div className="mt-6">
            <AddToCartForm slug={product.slug} />
          </div>

          {/* Ingredients, not a safety claim — see the note on Product.allergens.
              Shown on every item, including the ones that carry none, because
              a missing section reads as "we didn't check" and an empty one
              reads as "we did". */}
          <div className="mt-7 border-t border-line pt-5">
            <h2 className="m-0 text-[11px] uppercase tracking-[0.09em] text-faint">
              Allergens
            </h2>
            <p className="m-0 mt-2 text-[13px] leading-[1.5] text-ink">
              {allergens.length > 0
                ? `Contains ${listed(allergens)}.`
                : "Nothing from our allergen list."}
            </p>
            <p className="m-0 mt-1.5 text-[12px] leading-[1.5] text-muted">
              {ALLERGEN_NOTE}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
