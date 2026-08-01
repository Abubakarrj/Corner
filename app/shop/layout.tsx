import type { Metadata } from "next";
import { CartProvider } from "./CartContext";
import ShopHeader from "./ShopHeader";
import ChatWidget from "./ChatWidget";

// Everything under here is reachable two ways: through the shop subdomain
// (shop.thecornerbagel.com, rewritten by proxy.ts to this /shop tree) and,
// as a fallback, directly at thecornerbagel.com/shop. Links inside these
// pages are written root-relative (/, /product/x, /cart) to match how
// they resolve once rewritten — see proxy.ts for the full explanation.
export const metadata: Metadata = {
  title: "Corner Bagel Pantry",
  description: "Sauces, pickles, and pantry staples from Corner Bagel.",
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      {/* Warm cream ground, per the reference designs the shop is styled
          after — the marketing site stays white; this palette is the
          shop's own. */}
      <div className="flex min-h-dvh flex-col bg-[#F7F4EB]">
        <ShopHeader />
        <main className="flex-1">{children}</main>
        <ChatWidget />
      </div>
    </CartProvider>
  );
}
