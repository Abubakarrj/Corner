"use client";

import { useRouter } from "next/navigation";
import { useT } from "../i18n";
import { useMenu } from "../i18n/menu";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatPrice, searchProducts } from "./products";
import ProductImage from "./ProductImage";
import { DISPLAY_FONT } from "./shopControls";

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.6 10.6 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 3.5l9 9M12.5 3.5l-9 9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

// The expanding product search, replacing the menu hamburger. Collapsed it's
// just an icon; open it takes over the header row as a full-width pill, per
// the reference recording.
//
// Suggestions are computed synchronously from the local catalog — there's no
// search backend, and with a catalog this size there doesn't need to be, so
// there's no debounce or loading state to manage. If the catalog ever moves
// behind an API this is the seam where that goes.
export default function SearchBar({
  open,
  onOpen,
  onClose,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const menu = useMenu();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => searchProducts(query), [query]);

  // Focus only — no setState in here. Clearing the query on close is handled
  // by ShopHeader remounting this component when `open` flips (see the key
  // there), which resets state without an effect writing to it.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function goToProduct(slug: string) {
    onClose();
    router.push(`/shop/product/${slug}`);
  }

  function submit() {
    const trimmed = query.trim();
    if (!trimmed) return;
    onClose();
    router.push(`/shop?q=${encodeURIComponent(trimmed)}`);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setHighlighted((i) => (i + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setHighlighted((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      // Enter on a highlighted row opens that product; otherwise it runs the
      // query as a catalog search, same as Amazon's field.
      if (highlighted >= 0 && suggestions[highlighted]) {
        goToProduct(suggestions[highlighted].slug);
      } else {
        submit();
      }
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("shop.searchProducts")}
        className="flex h-10 w-10 cursor-pointer items-center justify-center text-ink transition-opacity hover:opacity-70"
      >
        <SearchIcon className="h-[19px] w-[19px]" />
      </button>
    );
  }

  return (
    <div className="flex flex-1 items-center gap-2">
      <div className="relative flex-1">
        <div className="flex h-9 items-center gap-2 rounded-full border border-ink bg-surface pl-3 pr-2">
          <SearchIcon className="shrink-0 text-faint" />
          <input
            ref={inputRef}
            // type="text", not "search": the native search input paints its
            // own clear button, which lands in the browser's blue rather than
            // the shop's palette and duplicates the controls beside it.
            type="text"
            inputMode="search"
            autoComplete="off"
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls="shop-search-suggestions"
            aria-label={t("shop.searchProducts")}
            placeholder={t("shop.searchProductsPlaceholder")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // The result set is about to change under the keyboard cursor,
              // so drop it here rather than in an effect watching `query`.
              setHighlighted(-1);
            }}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-hint sm:text-[13px]"
          />
          {query ? (
            <button
              type="button"
              onClick={submit}
              aria-label={t("shop.search")}
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink transition-opacity hover:opacity-60"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M2.5 8h11M9.5 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : null}
        </div>

        {query.trim() ? (
          <div
            id="shop-search-suggestions"
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-line-faint bg-panel py-1 shadow-[0_14px_34px_rgba(0,0,0,0.12)]"
          >
            {suggestions.length === 0 ? (
              <p className="px-4 py-3 text-[12px] text-faint">
                No products match &ldquo;{query.trim()}&rdquo;
              </p>
            ) : (
              suggestions.map((product, index) => (
                <button
                  key={product.slug}
                  type="button"
                  role="option"
                  aria-selected={index === highlighted}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => goToProduct(product.slug)}
                  className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors ${
                    index === highlighted ? "bg-raise" : ""
                  }`}
                >
                  <ProductImage
                    swatch={product.swatch}
                    category={product.category}
                    name={menu.name(product)}
                    className="h-9 w-9 shrink-0 rounded-md"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-[13px] text-ink"
                      style={{ fontFamily: DISPLAY_FONT }}
                    >
                      {menu.name(product)}
                    </span>
                    <span className="block truncate text-[10px] uppercase tracking-[0.07em] text-hint">
                      {menu.category(product.category)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-muted">
                    {formatPrice(product.priceCents)}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label={t("shop.closeSearch")}
        className="flex h-9 w-8 shrink-0 cursor-pointer items-center justify-center text-ink transition-opacity hover:opacity-60"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
