import type { Metadata, Viewport } from "next";
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

// Colours the browser chrome (the iOS Safari status-bar area above the
// page) to match the shop's cream instead of defaulting to white. Scoped
// to /shop — the marketing site is white, and this nested-segment export
// only applies to routes under it.
export const viewport: Viewport = {
  themeColor: "#F7F4EB",
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      {/* The root <html>/<body> are white (the marketing site's ground).
          Repaint them cream while a shop route is mounted, so iOS
          rubber-band overscroll past the page's edges shows cream too —
          themeColor above only covers the status-bar chrome. */}
      <style>{`html, body { background-color: #F7F4EB; }`}</style>
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
