import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    viewTransition: true,
  },
  // Riley's briefing is a Markdown file read at runtime rather than imported,
  // so nothing in the module graph points at it and the build's file tracing
  // would leave it behind. Without this the chat route throws on its first
  // request in a traced deployment (standalone output, Vercel) while working
  // perfectly in dev — the worst shape a bug can have.
  // Same problem, same fix: the PDF font is read off disk at runtime, so
  // nothing in the module graph points at the .ttf. Every route that renders a
  // PDF needs a line here — miss one and it works in dev and throws on its
  // first request in production.
  outputFileTracingIncludes: {
    "/api/shop-chat": ["./app/api/shop-chat/riley-guide.md"],
    "/api/apply": ["./app/pdf/DejaVuSans.ttf"],
    "/api/staff/order": ["./app/pdf/DejaVuSans.ttf"],
  },
  async redirects() {
    return [
      // /order was the about page, from back when there was nowhere else for
      // that copy to live. Ordering now starts at the location finder — you
      // pick a shop before you pick a bagel — so that's what the URL means,
      // and the copy moved to /about.
      //
      // Permanent, because this is a rename rather than a temporary detour:
      // the old address should stop being used and any ranking it had should
      // carry over. Note that browsers cache a 308 hard, so if /order ever
      // needs to mean something else again, expect stale redirects in the
      // wild for a while.
      {
        source: "/order",
        destination: "/locations",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
