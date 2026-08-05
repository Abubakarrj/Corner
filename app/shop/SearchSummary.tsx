import Link from "next/link";
import { DISPLAY_FONT } from "./shopControls";

// Shown in place of the category tabs while a search is active — the tabs
// would be misleading there, since a query deliberately ignores the
// category filter (see the note in page.tsx).
export default function SearchSummary({
  query,
  count,
}: {
  query: string;
  count: number;
}) {
  return (
    <div
      className="mb-5 border-b border-[#E4DECE] pb-4"
    >
      <p className="text-[15px] text-[#3E4A30]" style={{ fontFamily: DISPLAY_FONT }}>
        {count > 0 ? "Results for" : "No results for"}{" "}
        <span className="font-semibold">&ldquo;{query}&rdquo;</span>
      </p>
      {count === 0 ? (
        <p className="mt-1 text-[12px] text-[#8A8672]">
          Try a shorter word, or browse the full menu.
        </p>
      ) : null}
      <Link
        href="/shop"
        className="mt-2 inline-block cursor-pointer text-[12px] text-[#6F6A5C] underline transition-opacity hover:opacity-70"
      >
        Clear search
      </Link>
    </div>
  );
}
