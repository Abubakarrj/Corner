import Image from "next/image";
import Link from "next/link";

// SKETCH — a preorder CTA + "skip the queue" annotation under the logo,
// modeled on a reference screenshot (Mardy's).
const BRAND_RED = "#BE1923";

const SHOP_HREF = "/shop";

export default function Home() {
  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-white p-6">
      <Link href="/order" className="cursor-pointer">
        <div className="relative h-48 w-48 sm:h-56 sm:w-56 md:h-64 md:w-64 lg:h-72 lg:w-72">
          <Image
            src="/logo.svg"
            alt="The Corner Bagel Logo"
            fill
            unoptimized
            priority
            className="object-contain"
          />
          <div className="absolute bottom-[25%] right-[-16%] aspect-square w-[16%] animate-logo-roll">
            <Image
              src="/logo-2.svg"
              alt="Corner Bagel Logo secondary"
              fill
              unoptimized
              priority
              className="object-contain"
            />
          </div>
        </div>
      </Link>

      {/* The button matches the logo's width on every breakpoint (w-48 →
          lg:w-72, same steps as the Link above), so the lockup reads as one
          column rather than a wide mark over a narrow pill. */}
      <div className="mt-6 flex flex-col items-center">
        <Link
          href={SHOP_HREF}
          style={{
            borderColor: BRAND_RED,
            color: BRAND_RED,
            fontFamily: "var(--font-geist-sans), sans-serif",
          }}
          className="w-48 cursor-pointer border-2 bg-white py-3.5 text-center text-[15px] font-bold tracking-[0.08em] transition-opacity hover:opacity-80 sm:w-56 sm:py-4 md:w-64 lg:w-72"
        >
          SHOP PANTRY
        </Link>

        {/* A straight line, like the reference — no more hand-drawn curl.
            Sized to the text's cap height (~11px at 14–15px type), so the
            arrow reads as part of the line of text, not a separate mark. */}
        <div className="mt-4 flex items-center gap-2">
          <svg
            width="7"
            height="11"
            viewBox="0 0 7 11"
            fill="none"
            aria-hidden
            className="animate-arrow-bounce"
          >
            <path
              d="M3.5 10.5V0.5M3.5 0.5L0.75 3.25M3.5 0.5L6.25 3.25"
              stroke="#2D2D2D"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span
            className="whitespace-nowrap text-[14px] italic text-[#2D2D2D] sm:text-[15px]"
            style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
          >
            Curated from our kitchen
          </span>
        </div>
      </div>
    </div>
  );
}
