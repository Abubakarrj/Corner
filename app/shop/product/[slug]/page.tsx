import { notFound } from "next/navigation";
import Link from "next/link";
import { formatPrice, getProduct } from "../../products";
import ProductImage from "../../ProductImage";
import AddToCartForm from "./AddToCartForm";

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
        className="mb-6 inline-block cursor-pointer text-[13px] text-[#575757] underline"
        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
      >
        ← Back to the pantry
      </Link>

      {/* A fixed-width image column (not a 50/50 split) — this is a
          placeholder colour swatch, not photography yet, and a 50/50 grid
          let it grow to fill half the page on a wide screen, which read as
          oversized for what's currently just a flat colour. Fixed at 320px
          regardless of container width, rather than a max-width that a
          narrower column could already sit under without ever engaging. */}
      <div className="grid gap-8 sm:grid-cols-[320px_1fr]">
        <ProductImage
          swatch={product.swatch}
          name={product.name}
          className="aspect-square w-full rounded-lg"
        />

        <div style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
          <p className="text-[12px] uppercase tracking-[0.08em] text-[#8A8A8A]">
            {product.category}
          </p>
          <h1
            className="mt-1 text-[24px] font-bold text-[#2D2D2D]"
            style={{ letterSpacing: "-0.03em" }}
          >
            {product.name}
          </h1>
          <p className="mt-1 text-[16px] text-[#575757]">
            {formatPrice(product.priceCents)}
          </p>
          <p className="mt-4 text-[14px] leading-[1.6] text-[#2D2D2D]">
            {product.description}
          </p>

          <div className="mt-6">
            <AddToCartForm slug={product.slug} />
          </div>
        </div>
      </div>
    </div>
  );
}
