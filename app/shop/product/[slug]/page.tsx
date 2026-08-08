import { notFound } from "next/navigation";
import { getProduct } from "../../products";
import ProductView from "./ProductView";

// Resolves the slug and hands the product to the client view. Everything the
// page renders is language-dependent, so the body lives in ProductView.tsx;
// what stays here is the one thing that must not — deciding whether this URL
// is a product at all.
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  // What the catalog tile had already answered when it sent us here — the
  // pack size, in practice. Read on the server and passed down rather than
  // pulled from useSearchParams in the form, which would need a Suspense
  // boundary around the whole view for a value that is known before it
  // renders. See encodeOptions in products.ts.
  const options = (await searchParams).options;

  return (
    <ProductView
      product={product}
      initialOptions={typeof options === "string" ? options : undefined}
    />
  );
}
