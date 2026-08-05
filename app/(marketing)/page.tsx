import Image from "next/image";
import Link from "next/link";
import ThemeToggle from "../ui/ThemeToggle";

// The "SHOP PANTRY" button and its arrow annotation used to sit under the
// logo here, linking to /shop. Pulled until the pantry is ready to launch —
// the shop itself is untouched and still reachable at /shop directly, this
// only removes the front-door entry point. To restore, put back:
//
//   <div className="mt-6 flex flex-col items-center">
//     <Link href="/shop" style={{ borderColor: "var(--cb-red)", color: "var(--cb-red)",
//       fontFamily: "var(--font-geist-sans), sans-serif" }}
//       className="w-48 cursor-pointer border-2 bg-white py-3.5 text-center
//       text-[15px] font-bold tracking-[0.08em] transition-opacity
//       hover:opacity-80 sm:w-56 sm:py-4 md:w-64 lg:w-72">SHOP PANTRY</Link>
//     ...the arrow svg + "Curated from our kitchen" caption...
//   </div>
//
// The arrow and caption went with it: they exist to point at that button,
// so on their own they'd be an arrow aimed at nothing.

export default function Home() {
  return (
    <div className="relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-page p-6">
      {/* The logo is the front door into the app: tapping it opens the map,
          which is where an order starts. It used to open /about — that copy
          is still there, reachable from the About tab once you're inside. */}
      <Link href="/locations" className="cursor-pointer">
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

      {/* Appearance, in the corner opposite the privacy line, so the two bits
          of chrome bracket the page rather than crowding each other. No label
          above it: three segments reading Light / Dark / System say what they
          are, and the group carries aria-label="Appearance" for anyone who
          can't see them. The safe-area inset keeps it out of the notch on an
          installed app. */}
      <div
        className="absolute right-4 z-10"
        style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
      >
        <ThemeToggle />
      </div>
    </div>
  );
}
