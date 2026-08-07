import { notFound } from "next/navigation";
import { getProduct } from "../../products";
import ProductView from "./ProductView";

// Resolves the slug and hands the product to the client view. Everything the
// page renders is language-dependent, so the body lives in ProductView.tsx;
// what stays here is the one thing that must not — deciding whether this URL
// is a product at all.
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  return <ProductView product={product} />;
}
