"use client";

import { useState } from "react";
import type { Product, SortValue } from "./products";
import ProductCard from "./ProductCard";
import ProductListRow from "./ProductListRow";
import SortDropdown from "./SortDropdown";
import { CONTROL_PILL } from "./shopControls";

function GridIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" fill="currentColor" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" fill="currentColor" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" fill="currentColor" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1" fill="currentColor" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="2.2" rx="1.1" fill="currentColor" />
      <rect x="1.5" y="6.9" width="13" height="2.2" rx="1.1" fill="currentColor" />
      <rect x="1.5" y="11.3" width="13" height="2.2" rx="1.1" fill="currentColor" />
    </svg>
  );
}

// The toolbar (sort + grid/list toggle) and the catalog body live in one
// client component because the view toggle is local UI state, not
// something worth round-tripping through the URL the way category and sort
// are — it doesn't change *which* products show, only how the same list
// renders. Sort stays link-driven (see SortDropdown) so it composes with
// category through the query string like the rest of the catalog nav.
export default function ShopCatalog({
  products,
  activeCategory,
  activeSort,
}: {
  products: Product[];
  activeCategory: Product["category"] | undefined;
  activeSort: SortValue;
}) {
  const [view, setView] = useState<"grid" | "list">("grid");

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-2">
          <SortDropdown activeSort={activeSort} activeCategory={activeCategory} />

          {/* Shares CONTROL_PILL with the sort button so the two can't drift
              apart in height or radius. Segments are square-ish (w-9 against
              the h-8 shell) — this is icon-only chrome, so padding it out to
              the sort pill's width would give it visual weight it hasn't
              earned. */}
          <div className={`${CONTROL_PILL} flex overflow-hidden`}>
            <button
              type="button"
              onClick={() => setView("grid")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              className={`flex h-full w-9 cursor-pointer items-center justify-center transition-colors ${
                view === "grid"
                  ? "bg-[#3E4A30] text-[#F3F1E5]"
                  : "text-[#3E4A30] hover:bg-[#EFEBDD]"
              }`}
            >
              <GridIcon />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              aria-label="List view"
              aria-pressed={view === "list"}
              className={`flex h-full w-9 cursor-pointer items-center justify-center border-l border-[#DDD6C2] transition-colors ${
                view === "list"
                  ? "bg-[#3E4A30] text-[#F3F1E5]"
                  : "text-[#3E4A30] hover:bg-[#EFEBDD]"
              }`}
            >
              <ListIcon />
            </button>
          </div>
        </div>

        <p
          className="text-[11px] text-[#8A8672]"
          style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
        >
          {products.length} item{products.length === 1 ? "" : "s"}
        </p>
      </div>

      {view === "grid" ? (
        // Held at 2 columns through sm so tiles don't shrink below a
        // comfortable tap target on a phone; from md on, more columns (not
        // bigger tiles) is what should absorb the extra width. The row gap
        // runs much larger than the column gap so each card's copy reads as
        // belonging to the tile above it rather than floating between rows.
        <div className="grid grid-cols-2 gap-x-5 gap-y-12 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {products.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col">
          {products.map((product) => (
            <ProductListRow key={product.slug} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
