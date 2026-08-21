import {
  CATEGORIES,
  PRODUCTS,
  isSortValue,
  searchProducts,
  sortProducts,
} from "./products";
import PageTitle from "../ui/PageTitle";
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
      {/* ⚠️ The menu had no heading at all, which is not a cosmetic gap:
          jumping by heading is how most screen reader users move through a
          page, and with none there was nothing to jump to — the whole catalog
          had to be read from the header down. Visually hidden because the
          design has no room for a title and does not need one; the category
          rail below already says where you are to anybody who can see it. */}
      <PageTitle k="nav.menu" />

      {query ? (
        <SearchSummary query={query} count={products.length} />
      ) : (
        <CategoryNav activeCategory={activeCategory} activeSort={activeSort} />
      )}

      <ShopCatalog
        products={products}
        activeCategory={activeCategory}
        activeSort={activeSort}
      />
    </div>
  );
}
