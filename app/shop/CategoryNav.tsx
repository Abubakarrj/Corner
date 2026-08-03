import Link from "next/link";
import { CATEGORIES, type Product, type SortValue } from "./products";

// Underline tabs, matching the reference catalog: a horizontal row of
// category names over a hairline, with the active one darkened and
// underlined. Scrolls sideways on narrow screens rather than wrapping.
const tabBase =
  "-mb-px cursor-pointer whitespace-nowrap border-b-2 pb-3 text-[16px] transition-colors";
const tabActive = "border-[#3E4A30] font-medium text-[#3E4A30]";
const tabIdle = "border-transparent text-[#6F6A5C] hover:text-[#3E4A30]";

export default function CategoryNav({
  activeCategory,
  activeSort,
}: {
  activeCategory: Product["category"] | undefined;
  activeSort: SortValue;
}) {
  // Preserves whichever sort is active across a category switch — sort and
  // category are independent filters, and only /shop's own "All" reset
  // clears the category half.
  function hrefFor(category: Product["category"] | undefined) {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (activeSort !== "featured") params.set("sort", activeSort);
    const query = params.toString();
    return query ? `/shop?${query}` : "/shop";
  }

  return (
    <div
      className="mb-5 flex gap-7 overflow-x-auto border-b border-[#E4DECE]"
    >
      <Link href={hrefFor(undefined)} className={`${tabBase} ${activeCategory ? tabIdle : tabActive}`}>
        All
      </Link>
      {CATEGORIES.map((category) => (
        <Link
          key={category}
          href={hrefFor(category)}
          className={`${tabBase} ${category === activeCategory ? tabActive : tabIdle}`}
        >
          {category}
        </Link>
      ))}
    </div>
  );
}
