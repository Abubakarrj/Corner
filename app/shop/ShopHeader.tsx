"use client";

import { useEffect, useState } from "react";
import { useCart } from "./CartContext";
import CartDrawer from "./CartDrawer";
import SearchBar from "./SearchBar";
import { OPEN_BASKET_EVENT } from "./openBasket";

const BRAND_RED = "#BE1923";

// Every link in the shop is rooted at /shop, never at / — the storefront is
// served at thecornerbagel.com/shop, where a subdomain-rooted link like
// /product/x would 404 (or land on the marketing site). On
// shop.thecornerbagel.com these same /shop/... paths pass straight through
// proxy.ts untouched, so one set of hrefs works on both hosts.

// A solid market basket, matching the reference glyph the user supplied:
// filled trapezoid body with three rounded slots, wide rounded rim, and a
// triangular handle with a pinhole at the apex. The drawer's empty-state
// icon (CartDrawer's EmptyBasketIcon) is this same drawing greyed out —
// keep the two in step.
function BasketIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 8.6 12 4l3 4.6"
        stroke="#3E4A30"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="3" y="8" width="18" height="3.4" rx="1.7" fill="#3E4A30" />
      <path
        d="M5 11.4h14l-.95 7.4a2.2 2.2 0 0 1-2.18 1.9H8.13a2.2 2.2 0 0 1-2.18-1.9L5 11.4Z"
        fill="#3E4A30"
      />
      <circle cx="12" cy="5.1" r="0.65" fill="white" />
      <rect x="7.55" y="13" width="1.9" height="5.2" rx="0.95" fill="white" />
      <rect x="11.05" y="13" width="1.9" height="5.2" rx="0.95" fill="white" />
      <rect x="14.55" y="13" width="1.9" height="5.2" rx="0.95" fill="white" />
    </svg>
  );
}

export default function ShopHeader() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [basketOpen, setBasketOpen] = useState(false);
  const { itemCount } = useCart();

  // Adding to the basket anywhere in the shop slides the basket open as the
  // confirmation — see openBasket.ts.
  useEffect(() => {
    const onOpenBasket = () => {
      setSearchOpen(false);
      setBasketOpen(true);
    };
    window.addEventListener(OPEN_BASKET_EVENT, onOpenBasket);
    return () => window.removeEventListener(OPEN_BASKET_EVENT, onOpenBasket);
  }, []);

  return (
    <>
      {/* The safe-area inset is padding on the header itself, not on an
          ancestor: this bar is sticky, so once the page scrolls it sits at
          the very top of a viewport that (under viewport-fit=cover) extends
          under the notch. Padding here means the header's own cream fills
          that strip and the controls sit below it — padding on a wrapper
          would scroll away and leave the bar under the status bar. */}
      <header
        className="sticky top-0 z-40 border-b border-[#E4DECE] bg-[#F7F4EB] pt-[env(safe-area-inset-top)]"
        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
      >
        {/* Shorter on mobile than desktop, because mobile is exactly where
            the safe-area inset above stacks on top of this row: a 64px row
            under a ~59px notch strip makes for a ~123px bar that eats the
            viewport. Desktop has no inset, so it keeps the roomier row. */}
        <div className="flex h-[52px] items-center gap-2 px-4 sm:h-16 sm:px-6">
          {/* Keyed on open/closed so toggling remounts it, clearing the
              query and keyboard cursor without an effect writing state. */}
          <SearchBar
            key={searchOpen ? "search-open" : "search-closed"}
            open={searchOpen}
            onOpen={() => setSearchOpen(true)}
            onClose={() => setSearchOpen(false)}
          />

          {/* Pushed aside while the search field is expanded — the field
              takes the row, matching the reference. */}
          {searchOpen ? null : (
            <button
              type="button"
              onClick={() => setBasketOpen(true)}
              aria-label={`Basket, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
              aria-expanded={basketOpen}
              className="relative ml-auto flex h-10 w-10 cursor-pointer items-center justify-center transition-opacity hover:opacity-70"
            >
              <BasketIcon />
              {itemCount > 0 ? (
                <span
                  style={{ backgroundColor: BRAND_RED }}
                  className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                >
                  {itemCount}
                </span>
              ) : null}
            </button>
          )}
        </div>
      </header>

      <CartDrawer open={basketOpen} onClose={() => setBasketOpen(false)} />
    </>
  );
}
