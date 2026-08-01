"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CATEGORIES } from "./products";
import { useCart } from "./CartContext";
import Drawer from "./Drawer";
import CartDrawer from "./CartDrawer";
import { OPEN_BASKET_EVENT } from "./openBasket";

const BRAND_RED = "#BE1923";

// Every link in the shop is rooted at /shop, never at / — the storefront is
// served at thecornerbagel.com/shop, where a subdomain-rooted link like
// /product/x would 404 (or land on the marketing site). On
// shop.thecornerbagel.com these same /shop/... paths pass straight through
// proxy.ts untouched, so one set of hrefs works on both hosts.

function HamburgerIcon() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" fill="none" aria-hidden>
      <path d="M1 1.5H19" stroke="#3E4A30" strokeWidth="2" strokeLinecap="round" />
      <path d="M1 7H19" stroke="#3E4A30" strokeWidth="2" strokeLinecap="round" />
      <path d="M1 12.5H12.5" stroke="#3E4A30" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

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

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M3.5 3.5l11 11M14.5 3.5l-11 11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ShopHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [basketOpen, setBasketOpen] = useState(false);
  const { itemCount } = useCart();

  // Adding to the basket anywhere in the shop slides the basket open as the
  // confirmation — see openBasket.ts.
  useEffect(() => {
    const onOpenBasket = () => {
      setMenuOpen(false);
      setBasketOpen(true);
    };
    window.addEventListener(OPEN_BASKET_EVENT, onOpenBasket);
    return () => window.removeEventListener(OPEN_BASKET_EVENT, onOpenBasket);
  }, []);

  return (
    <>
      <header
        className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-[#E4DECE] bg-[#F7F4EB] px-4 sm:px-6"
        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
      >
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Menu"
          aria-expanded={menuOpen}
          className="flex h-10 w-10 cursor-pointer items-center justify-center transition-opacity hover:opacity-70"
        >
          <HamburgerIcon />
        </button>

        <Link href="/shop" className="cursor-pointer" aria-label="Corner Bagel Pantry">
          <Image
            src="/logo.svg"
            alt="Corner Bagel"
            width={8369}
            height={3233}
            unoptimized
            priority
            className="h-6 w-auto object-contain sm:h-7"
          />
        </Link>

        <button
          type="button"
          onClick={() => setBasketOpen(true)}
          aria-label={`Basket, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
          aria-expanded={basketOpen}
          className="relative flex h-10 w-10 cursor-pointer items-center justify-center transition-opacity hover:opacity-70"
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
      </header>

      <Drawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        side="left"
        label="Menu"
      >
        <div className="flex items-center justify-between px-6 py-5">
          <Image
            src="/logo.svg"
            alt="Corner Bagel"
            width={8369}
            height={3233}
            unoptimized
            className="h-5 w-auto object-contain"
          />
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            className="flex h-9 w-9 cursor-pointer items-center justify-center text-[#3E4A30] transition-opacity hover:opacity-60"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Deliberately small serif links in olive — the Flamingo-style
            menu from the user's reference, not the big bold sans links
            this drawer launched with. */}
        <nav className="flex-1 overflow-y-auto px-6 pt-4">
          <p
            className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8A8672]"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            The Pantry
          </p>
          <div className="flex flex-col divide-y divide-[#E7E2D2]">
            <Link
              href="/shop"
              onClick={() => setMenuOpen(false)}
              className="cursor-pointer py-3 text-[15px] text-[#3E4A30] transition-opacity hover:opacity-70"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              All Products
            </Link>
            {CATEGORIES.map((category) => (
              <Link
                key={category}
                href={`/shop?category=${encodeURIComponent(category)}`}
                onClick={() => setMenuOpen(false)}
                className="cursor-pointer py-3 text-[15px] text-[#3E4A30] transition-opacity hover:opacity-70"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {category}
              </Link>
            ))}
          </div>
        </nav>

        {/* Extra bottom padding clears the home-indicator gesture area
            under viewport-fit=cover; env() is 0 anywhere that isn't set. */}
        <div
          className="flex flex-col gap-2 border-t border-[#E7E2D2] px-6 pt-5"
          style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
        >
          <a
            href="https://thecornerbagel.com"
            className="cursor-pointer text-[12px] text-[#8A8672] transition-colors hover:text-[#3E4A30]"
          >
            ← Back to Corner Bagel
          </a>
          <a
            href="mailto:cornerbagel@publicentity.co"
            className="cursor-pointer text-[12px] text-[#8A8672] underline transition-colors hover:text-[#3E4A30]"
          >
            cornerbagel@publicentity.co
          </a>
        </div>
      </Drawer>

      <CartDrawer open={basketOpen} onClose={() => setBasketOpen(false)} />
    </>
  );
}
