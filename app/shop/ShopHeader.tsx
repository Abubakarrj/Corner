"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CATEGORIES } from "./products";
import { useCart } from "./CartContext";

const BRAND_RED = "#BE1923";

function HamburgerIcon() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" fill="none" aria-hidden>
      <path d="M1 1.5H19" stroke="#2D2D2D" strokeWidth="2" strokeLinecap="round" />
      <path d="M1 7H19" stroke="#2D2D2D" strokeWidth="2" strokeLinecap="round" />
      <path d="M1 12.5H12.5" stroke="#2D2D2D" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CartIcon() {
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

export default function ShopHeader() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { itemCount } = useCart();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <header
      className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-[#E2E2E2] bg-white px-4 sm:px-6"
      style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
    >
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={open}
          className="flex h-10 w-10 cursor-pointer items-center justify-center transition-opacity hover:opacity-70"
        >
          <HamburgerIcon />
        </button>

        {open ? (
          <div
            ref={panelRef}
            role="menu"
            className="absolute left-0 top-[calc(100%+8px)] w-56 overflow-hidden rounded-2xl bg-white py-2 shadow-[0_8px_30px_rgba(0,0,0,0.15)]"
          >
            <Link
              href="/"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-5 py-2.5 text-[15px] font-medium text-[#2D2D2D] transition-colors hover:bg-[#F7F7F7]"
            >
              All Products
            </Link>
            {CATEGORIES.map((category) => (
              <Link
                key={category}
                href={`/?category=${encodeURIComponent(category)}`}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block px-5 py-2.5 text-[15px] text-[#2D2D2D] transition-colors hover:bg-[#F7F7F7]"
              >
                {category}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <Link href="/" className="cursor-pointer" aria-label="Corner Bagel Pantry">
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

      <Link
        href="/cart"
        aria-label={`Cart, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
        className="relative flex h-10 w-10 cursor-pointer items-center justify-center transition-opacity hover:opacity-70"
      >
        <CartIcon />
        {itemCount > 0 ? (
          <span
            style={{ backgroundColor: BRAND_RED }}
            className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
          >
            {itemCount}
          </span>
        ) : null}
      </Link>
    </header>
  );
}
