import Image from "next/image";
import Link from "next/link";
import ThemeToggle from "../ui/ThemeToggle";
import LanguagePicker from "../ui/LanguagePicker";
import AboutMenu from "../ui/AboutMenu";
import OrderStatusBar from "../shop/OrderStatusBar";

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
          which is where an order starts.

          It used to open /about, and for a while a small (i) sat off the R's
          shoulder to keep a door to that copy. Both are gone: About Us in the
          corner strip holds Our Story now, and a second entrance to one page
          beside a mark whose whole composition is that it is a mark was one
          more thing on a screen that reads best with almost nothing on it.
          The `relative` wrapper that positioned the (i) went with it. */}
      <Link href="/locations" className="cursor-pointer">
        <div className="relative h-48 w-48 sm:h-56 sm:w-56 md:h-64 md:w-64 lg:h-72 lg:w-72">
          <Image
            src="/logo.svg"
            // The brand name alone. "Logo" added nothing a screen reader
            // needs, and it was the one English word on an otherwise
            // translated page.
            alt="Corner Bagel"
            fill
            unoptimized
            priority
            className="object-contain"
          />
          <div className="absolute bottom-[25%] right-[-16%] aspect-square w-[16%] animate-logo-roll">
            <Image
              src="/logo-2.svg"
              // Decorative: the rolling bagel is the same mark again, and
              // announcing it twice is noise.
              alt=""
              fill
              unoptimized
              priority
              className="object-contain"
            />
          </div>
        </div>
      </Link>

      {/* About, language and appearance, in the corner opposite the privacy
          line, so the chrome brackets the page rather than crowding it. All
          three are 28px and sit on one row, which is what keeps them reading
          as one strip rather than three widgets.

          The first of them used to be a red "We Are Hiring!" chip, dressed
          unlike its neighbours on purpose so a job opening would not read as
          a third setting. It is a menu now, holding Our Story and Careers,
          and the red went with the change: two pills that open a short list
          should not look like different kinds of thing. See AboutMenu.

          `end-4` rather than `right-4`: under Urdu the document is mirrored,
          and this belongs in whichever corner is the far one. The safe-area
          inset keeps it out of the notch on an installed app. */}
      <div
        // flex-wrap + justify-end: "About Us" is a whole phrase, and in
        // Burmese it is a long one. Rather than truncate it into nonsense or
        // let the strip push past the edge on a narrow phone, the row wraps
        // and the chip takes a second line — still in the corner, still tidy.
        className="absolute end-4 z-10 flex max-w-[calc(100%-2rem)] flex-wrap items-center justify-end gap-2"
        style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
      >
        <AboutMenu />
        <LanguagePicker shell="page" />
        <ThemeToggle shell="page" />
      </div>

      {/* A live order, docked to the floor. This is the front door — it is
          where the app opens, and where somebody who has already ordered
          comes back to. Without this, arriving here after ordering showed the
          mark and nothing else, and the way to the tracker was to tap
          through to the map and find the bar there.

          Docked rather than in the column because the column is a centred
          logo: putting the bar in it would push the mark off centre on the
          one screen whose whole composition is that it is centred. Renders
          nothing when no order is in flight, which is nearly always. */}
      <OrderStatusBar dock />
    </div>
  );
}
