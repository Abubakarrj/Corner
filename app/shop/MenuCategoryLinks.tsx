"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CATEGORIES } from "./products";
import { DISPLAY_FONT } from "./shopControls";

// A grey highlight behind whichever entry matches the page currently open,
// per the reference nav (the grey rounded rect behind "Catalog"). Reading
// the category straight from useSearchParams (rather than a prop threaded
// down from the page) is what makes this reactive to a Link click without
// a full navigation-triggered remount — this is the one piece of the menu
// that needs the current URL, so it's split out here and wrapped in
// Suspense at the call site instead of pulling that requirement into the
// header itself, which every /shop page renders (cart, checkout included)
// and would otherwise force out of static rendering.
export default function MenuCategoryLinks({ onNavigate }: { onNavigate: () => void }) {
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get("category");

  const rowClass = (isActive: boolean) =>
    `cursor-pointer rounded-xl px-3 py-2.5 text-[15px] transition-colors ${
      isActive ? "bg-[#DEDAD0] text-[#3E4A30]" : "text-[#3E4A30] hover:bg-[#EFEBDD]"
    }`;

  return (
    <div className="flex flex-col gap-1">
      <Link
        href="/shop"
        onClick={onNavigate}
        className={rowClass(!activeCategory)}
        style={{ fontFamily: DISPLAY_FONT }}
      >
        All Products
      </Link>
      {CATEGORIES.map((category) => (
        <Link
          key={category}
          href={`/shop?category=${encodeURIComponent(category)}`}
          onClick={onNavigate}
          className={rowClass(category === activeCategory)}
          style={{ fontFamily: DISPLAY_FONT }}
        >
          {category}
        </Link>
      ))}
    </div>
  );
}
