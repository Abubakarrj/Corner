import Link from "next/link";
import { CATEGORIES, type Product } from "./products";

// Underline tabs, matching the reference catalog: a horizontal row of
// category names over a hairline, with the active one darkened and
// underlined. Scrolls sideways on narrow screens rather than wrapping.
const tabBase =
  "-mb-px cursor-pointer whitespace-nowrap border-b-2 pb-2.5 text-[13px] transition-colors";
const tabActive = "border-[#2D2D2D] font-medium text-[#2D2D2D]";
const tabIdle = "border-transparent text-[#6F6A5C] hover:text-[#2D2D2D]";

export default function CategoryNav({
  activeCategory,
}: {
  activeCategory: Product["category"] | undefined;
}) {
  return (
    <div
      className="mb-6 flex gap-6 overflow-x-auto border-b border-[#E4DECE]"
      style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
    >
      <Link href="/shop" className={`${tabBase} ${activeCategory ? tabIdle : tabActive}`}>
        All
      </Link>
      {CATEGORIES.map((category) => (
        <Link
          key={category}
          href={`/shop?category=${encodeURIComponent(category)}`}
          className={`${tabBase} ${category === activeCategory ? tabActive : tabIdle}`}
        >
          {category}
        </Link>
      ))}
    </div>
  );
}
