import Link from "next/link";
import { CATEGORIES, type Product } from "./products";

const BRAND_RED = "#BE1923";

const pillBase =
  "cursor-pointer whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-opacity hover:opacity-70";

export default function CategoryNav({
  activeCategory,
}: {
  activeCategory: Product["category"] | undefined;
}) {
  return (
    <div
      className="mb-6 flex gap-2 overflow-x-auto pb-1"
      style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
    >
      <Link
        href="/shop"
        style={
          activeCategory
            ? { borderColor: "#E2E2E2", color: "#2D2D2D" }
            : { borderColor: BRAND_RED, backgroundColor: BRAND_RED, color: "#ffffff" }
        }
        className={pillBase}
      >
        All
      </Link>
      {CATEGORIES.map((category) => {
        const isActive = category === activeCategory;
        return (
          <Link
            key={category}
            href={`/shop?category=${encodeURIComponent(category)}`}
            style={
              isActive
                ? { borderColor: BRAND_RED, backgroundColor: BRAND_RED, color: "#ffffff" }
                : { borderColor: "#E2E2E2", color: "#2D2D2D" }
            }
            className={pillBase}
          >
            {category}
          </Link>
        );
      })}
    </div>
  );
}
