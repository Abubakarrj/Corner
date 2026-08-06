"use client";

import Link from "next/link";
import { useT } from "../i18n";
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
  const t = useT();
  return (
    <div
      className="mb-5 border-b border-line pb-4"
    >
      <p className="text-[15px] text-ink" style={{ fontFamily: DISPLAY_FONT }}>
        {count > 0 ? t("shop.resultsFor") : t("shop.noResultsFor")}{" "}
        <span className="font-medium">&ldquo;{query}&rdquo;</span>
      </p>
      {count === 0 ? (
        <p className="mt-1 text-[12px] text-faint">
          {t("shop.tryShorter")}
        </p>
      ) : null}
      <Link
        href="/shop"
        className="mt-2 inline-block cursor-pointer text-[12px] text-muted underline transition-opacity hover:opacity-70"
      >
        {t("shop.clearSearch")}
      </Link>
    </div>
  );
}
