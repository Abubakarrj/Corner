"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "../CartContext";
import { formatPrice, getProduct } from "../products";
import { DISPLAY_FONT } from "../shopControls";

const BRAND_RED = "#BE1923";

const fieldWrapClass =
  "flex items-center gap-2 rounded-xl border border-[#DDD6C2] px-4 py-3 focus-within:border-[#3E4A30]";
const inputClass =
  "w-full min-w-0 bg-transparent text-[16px] text-[#3E4A30] outline-none placeholder:text-[#9A9A9A]";

export default function CheckoutPage() {
  const { lines, subtotalCents, clear } = useCart();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "placed">("idle");
  const [error, setError] = useState<string | null>(null);

  const rows = lines
    .map((line) => ({ line, product: getProduct(line.slug) }))
    .filter((row): row is { line: (typeof lines)[number]; product: NonNullable<ReturnType<typeof getProduct>> } =>
      Boolean(row.product),
    );

  const valid =
    name.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    rows.length > 0;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || status !== "idle") return;

    setStatus("sending");
    setError(null);

    try {
      const response = await fetch("/api/shop-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          items: rows.map(({ line, product }) => ({
            slug: product.slug,
            name: product.name,
            quantity: line.quantity,
            priceCents: product.priceCents,
          })),
          subtotalCents,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Something went wrong.");
      }
      setStatus("placed");
      clear();
    } catch (submitError) {
      setStatus("idle");
      setError(
        submitError instanceof Error ? submitError.message : "Something went wrong.",
      );
    }
  }

  return (
    <div
      className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10"
      style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
    >
      <h1
        className="mb-6 text-[18px] font-bold text-[#3E4A30]"
        style={{ fontFamily: DISPLAY_FONT }}
      >
        Checkout
      </h1>

      {status === "placed" ? (
        <div>
          <p className="text-[14px] text-[#6F6A5C]">
            Order placed — we&rsquo;ll be in touch to confirm and take payment.
          </p>
          <Link href="/shop" className="mt-3 inline-block cursor-pointer text-[14px] underline">
            Back to the pantry
          </Link>
        </div>
      ) : rows.length === 0 ? (
        <div>
          <p className="text-[14px] text-[#6F6A5C]">Your cart is empty.</p>
          <Link href="/shop" className="mt-3 inline-block cursor-pointer text-[14px] underline">
            Browse the pantry
          </Link>
        </div>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2">
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:order-2">
            <div className={fieldWrapClass}>
              <input
                type="text"
                autoComplete="name"
                aria-label="Name"
                placeholder="Name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                className={inputClass}
              />
            </div>
            <div className={fieldWrapClass}>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                aria-label="Email address"
                placeholder="Email address"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                className={inputClass}
              />
            </div>
            <div className={fieldWrapClass}>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                aria-label="Phone number (optional)"
                placeholder="Phone (optional)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
              />
            </div>

            {error ? (
              <p role="alert" style={{ color: BRAND_RED }} className="text-[12px]">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={!valid || status === "sending"}
              style={{ backgroundColor: "#3E4A30" }}
              className="mt-1 w-full cursor-pointer rounded-full py-3 text-[12px] font-bold uppercase tracking-[0.06em] text-[#F3F1E5] transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-30"
            >
              {status === "sending" ? "Placing order…" : "Place order"}
            </button>
            <p className="text-[11px] text-[#8A8A8A]">
              Payment isn&rsquo;t collected here yet — this submits your order for us to
              confirm and follow up on.
            </p>
          </form>

          <div className="sm:order-1">
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-[#8A8A8A]">
              Order summary
            </h2>
            <div className="flex flex-col divide-y divide-[#E4DECE]">
              {rows.map(({ line, product }) => (
                <div key={line.slug} className="flex items-center justify-between py-2.5 text-[14px]">
                  <span className="text-[#3E4A30]">
                    {product.name} <span className="text-[#8A8A8A]">×{line.quantity}</span>
                  </span>
                  <span className="text-[#3E4A30]">
                    {formatPrice(product.priceCents * line.quantity)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[#E4DECE] pt-3">
              <span className="text-[13px] font-medium text-[#3E4A30]">Subtotal</span>
              <span
                className="text-[14px] font-bold text-[#3E4A30]"
                style={{ fontFamily: DISPLAY_FONT }}
              >
                {formatPrice(subtotalCents)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
