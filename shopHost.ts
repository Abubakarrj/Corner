// Shared between proxy.ts (the rewrite) and app/layout.tsx (which needs to
// know, server-side, whether to skip the marketing site's floating chrome —
// see the note in layout.tsx for why that check happens there and not via
// usePathname on the client).
const SHOP_HOSTS = ["shop.thecornerbagel.com", "shop.localhost"];

export function isShopHost(host: string): boolean {
  // Strip a port (shop.localhost:3123) before comparing.
  const hostname = host.split(":")[0];
  return SHOP_HOSTS.includes(hostname);
}
