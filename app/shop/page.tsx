import { CATEGORIES, PRODUCTS } from "./products";
import ProductCard from "./ProductCard";
import CategoryNav from "./CategoryNav";

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const activeCategory = CATEGORIES.find((c) => c === category);
  const products = activeCategory
    ? PRODUCTS.filter((product) => product.category === activeCategory)
    : PRODUCTS;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      {/* Bold carries the hierarchy on its own — sizes stay modest so the
          page doesn't read oversized (a specific request; keep it small). */}
      <h1
        className="mb-1 text-[20px] font-bold text-[#2D2D2D]"
        style={{ fontFamily: "var(--font-geist-sans), sans-serif", letterSpacing: "-0.03em" }}
      >
        The Pantry
      </h1>
      <p
        className="mb-6 text-[13px] text-[#6F6A5C]"
        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
      >
        What we use behind the counter, in jars you can take home.
      </p>

      <CategoryNav activeCategory={activeCategory} />

      <p
        className="mb-4 text-right text-[12px] text-[#6F6A5C]"
        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
      >
        {products.length} item{products.length === 1 ? "" : "s"}
      </p>

      {/* Held at 2 columns through sm so tiles don't shrink below a
          comfortable tap target on a phone; from md on, more columns (not
          bigger tiles) is what should absorb the extra width, otherwise a
          wide screen just makes everything oversized instead of showing
          more of the catalog at once. */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {products.map((product) => (
          <ProductCard key={product.slug} product={product} />
        ))}
      </div>
    </div>
  );
}
