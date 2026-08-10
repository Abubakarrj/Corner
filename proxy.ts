import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isShopHost } from "./shopHost";

// Routes shop.thecornerbagel.com to the /shop route tree in this same app,
// so the storefront can live at its own subdomain without being a separate
// deploy. (Named proxy.ts, not middleware.ts — this Next.js version renamed
// the file convention; see node_modules/next/dist/docs/.../proxy.md.)
//
// shop.localhost is included so this is testable in local dev without real
// DNS: run the app and visit http://shop.localhost:3000 (or whatever port).

// Served from the marketing tree on every host, never rewritten — see the
// note in the pass-through check below.
const POLICY_PATHS = ["/privacy-policy", "/cookie-policy"];

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (!isShopHost(host)) return NextResponse.next();

  const { pathname } = request.nextUrl;
  // Already under /shop (a direct link, or a second rewrite on a redirect),
  // hitting an API/internal Next.js path, or a public/ static file (icon.svg,
  // logo.svg, bagel-*.png, ...) that both the main site and shop pages
  // reference by absolute path — none of those live under /shop, so leave
  // them alone.
  //
  // The two policy pages are exempt for the same reason: the cookie banner is
  // site-wide, so it renders on this subdomain too, and its "consent" link
  // has to land somewhere real. There is no /shop/cookie-policy to rewrite
  // to, and duplicating a legal page under the shop tree to satisfy the
  // rewrite would mean two copies to keep in sync.
  // /staff is exempt for the same reason as the policy pages: it is one set of
  // screens the people who work here reach from whichever address they happen
  // to have open, and there is no /shop/staff to rewrite to.
  if (
    pathname.startsWith("/shop") ||
    pathname.startsWith("/staff") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    POLICY_PATHS.includes(pathname) ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/shop${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip static assets and image optimization — no reason to run this on
  // every font/image request, and the public/ files aren't duplicated
  // under /shop.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
