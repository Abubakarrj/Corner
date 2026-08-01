import { CATEGORIES, PRODUCTS, isSortValue, sortProducts } from "./products";
import CategoryNav from "./CategoryNav";
import ShopCatalog from "./ShopCatalog";

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string }>;
}) {
  const { category, sort } = await searchParams;
  const activeCategory = CATEGORIES.find((c) => c === category);
  const activeSort = isSortValue(sort) ? sort : "featured";
  const filtered = activeCategory
    ? PRODUCTS.filter((product) => product.category === activeCategory)
    : PRODUCTS;
  const products = sortProducts(filtered, activeSort);

  // No masthead — the catalog opens straight on the category tabs, so the
  // top padding is tighter than it was when a heading and lede sat above
  // them. See shopControls.ts for the type scale the rest of the page uses.
  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-6 sm:py-8">
      <CategoryNav activeCategory={activeCategory} activeSort={activeSort} />

      <ShopCatalog products={products} activeCategory={activeCategory} activeSort={activeSort} />
    </div>
  );
}
