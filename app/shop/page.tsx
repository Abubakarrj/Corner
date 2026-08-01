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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      {/* Bold carries the hierarchy on its own — sizes stay modest so the
          page doesn't read oversized (a specific request; keep it small). */}
      <h1
        className="mb-1 text-[20px] font-bold text-[#3E4A30]"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
      >
        From Our Kitchen To Yours
      </h1>
      <p
        className="mb-6 text-[13px] text-[#6F6A5C]"
        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
      >
        What we use behind the counter, enjoyed at the comfort of your home.
      </p>

      <CategoryNav activeCategory={activeCategory} activeSort={activeSort} />

      <ShopCatalog products={products} activeCategory={activeCategory} activeSort={activeSort} />
    </div>
  );
}
