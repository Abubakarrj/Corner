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
      <path d="M1 1.5H19" stroke="#2D2D2D" strokeWidth="2" strokeLinecap="round" />
      <path d="M1 7H19" stroke="#2D2D2D" strokeWidth="2" strokeLinecap="round" />
      <path d="M1 12.5H12.5" stroke="#2D2D2D" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BasketIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M4 6h12l-1 10.5a1.5 1.5 0 0 1-1.5 1.5h-7a1.5 1.5 0 0 1-1.5-1.5L4 6Z"
        stroke="#2D2D2D"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M7 6V4.5a3 3 0 1 1 6 0V6"
        stroke="#2D2D2D"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
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
        className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-[#E2E2E2] bg-white px-4 sm:px-6"
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
            className="flex h-9 w-9 cursor-pointer items-center justify-center text-[#575757] transition-opacity hover:opacity-60"
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-6 pt-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#8A8A8A]">
            The Pantry
          </p>
          <div className="flex flex-col divide-y divide-[#F0F0F0]">
            <Link
              href="/shop"
              onClick={() => setMenuOpen(false)}
              className="cursor-pointer py-3.5 text-[20px] font-bold text-[#2D2D2D] transition-colors hover:text-[#BE1923]"
              style={{ letterSpacing: "-0.02em" }}
            >
              All Products
            </Link>
            {CATEGORIES.map((category) => (
              <Link
                key={category}
                href={`/shop?category=${encodeURIComponent(category)}`}
                onClick={() => setMenuOpen(false)}
                className="cursor-pointer py-3.5 text-[20px] font-bold text-[#2D2D2D] transition-colors hover:text-[#BE1923]"
                style={{ letterSpacing: "-0.02em" }}
              >
                {category}
              </Link>
            ))}
          </div>
        </nav>

        <div className="flex flex-col gap-2 border-t border-[#F0F0F0] px-6 py-5">
          <a
            href="https://thecornerbagel.com"
            className="cursor-pointer text-[13px] text-[#8A8A8A] transition-colors hover:text-[#BE1923]"
          >
            ← Back to Corner Bagel
          </a>
          <a
            href="mailto:cornerbagel@publicentity.co"
            className="cursor-pointer text-[13px] text-[#8A8A8A] underline transition-colors hover:text-[#BE1923]"
          >
            cornerbagel@publicentity.co
          </a>
        </div>
      </Drawer>

      <CartDrawer open={basketOpen} onClose={() => setBasketOpen(false)} />
    </>
  );
}
