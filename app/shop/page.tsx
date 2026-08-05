import {
  CATEGORIES,
  PRODUCTS,
  SANDWICH_NOTE,
  isSortValue,
  searchProducts,
  sortProducts,
} from "./products";
import CategoryNav from "./CategoryNav";
import ShopCatalog from "./ShopCatalog";
import SearchSummary from "./SearchSummary";

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string; q?: string }>;
}) {
  const { category, sort, q } = await searchParams;
  const query = q?.trim() ?? "";
  const activeCategory = CATEGORIES.find((c) => c === category);
  const activeSort = isSortValue(sort) ? sort : "featured";

  // A search replaces category filtering rather than stacking with it: the
  // query is the user's intent at that point, and intersecting it with a
  // stale category is the fastest way to show them zero results for
  // something the catalog actually has. Sort still applies on top, but
  // "featured" defers to relevance order, which is why it isn't re-sorted.
  const base = query
    ? searchProducts(query, PRODUCTS.length)
    : activeCategory
      ? PRODUCTS.filter((product) => product.category === activeCategory)
      : PRODUCTS;

  const products =
    query && activeSort === "featured" ? base : sortProducts(base, activeSort);

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-6 sm:py-8">
      {query ? (
        <SearchSummary query={query} count={products.length} />
      ) : (
        <CategoryNav activeCategory={activeCategory} activeSort={activeSort} />
      )}

      {/* The board's own footnote, shown where it applies. */}
      {activeCategory === "Sandwiches" ? (
        <p className="-mt-1 mb-5 text-[12px] leading-[1.5] text-[#6F6A5C]">
          {SANDWICH_NOTE}
        </p>
      ) : null}

      <ShopCatalog
        products={products}
        activeCategory={activeCategory}
        activeSort={activeSort}
      />
    </div>
  );
}
