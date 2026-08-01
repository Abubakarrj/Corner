import { notFound } from "next/navigation";
import Link from "next/link";
import { formatPrice, getProduct } from "../../products";
import ProductImage from "../../ProductImage";
import AddToCartForm from "./AddToCartForm";
import { DISPLAY_FONT } from "../../shopControls";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/shop"
        className="mb-6 inline-block cursor-pointer text-[13px] text-[#6F6A5C] underline"
        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
      >
        ← Back to the pantry
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
              className="absolute left-3 top-3 rounded-full bg-[#3E4A30] px-2.5 py-0.5 text-[10px] font-medium text-[#F3F1E5]"
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
            >
              {product.tag}
            </span>
          ) : null}
        </div>

        <div style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
          <p className="text-[10px] uppercase tracking-[0.08em] text-[#6F6A5C]">
            {product.category}
          </p>
          <h1
            className="mt-1 text-[20px] leading-tight text-[#3E4A30]"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            {product.name}
          </h1>
          <p className="mt-1 text-[14px] text-[#6F6A5C]">
            {formatPrice(product.priceCents)}
          </p>
          <p className="mt-4 text-[13px] leading-[1.6] text-[#3E4A30]">
            {product.description}
          </p>

          <div className="mt-6">
            <AddToCartForm slug={product.slug} priceCents={product.priceCents} />
          </div>
        </div>
      </div>
    </div>
  );
}
