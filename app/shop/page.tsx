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

  // Spacing rhythm, top to bottom: the masthead (heading + lede) is one
  // tight unit, then a deliberate gap before the tabs so filtering reads as
  // a separate band from the page's title. See shopControls.ts for the type
  // scale these sizes come from.
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
      <header className="mb-9">
        {/* Bold serif carries the hierarchy — the size stays restrained so
            the page doesn't read oversized (a specific request). */}
        <h1
          className="text-[22px] leading-tight text-[#3E4A30]"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700 }}
        >
          From Our Kitchen To Yours
        </h1>
        <p
          className="mt-2 max-w-[62ch] text-[13px] leading-[1.55] text-[#6F6A5C]"
          style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
        >
          What we use behind the counter, enjoyed at the comfort of your home.
        </p>
      </header>

      <CategoryNav activeCategory={activeCategory} activeSort={activeSort} />

      <ShopCatalog products={products} activeCategory={activeCategory} activeSort={activeSort} />
    </div>
  );
}
