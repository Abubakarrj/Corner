import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    viewTransition: true,
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
