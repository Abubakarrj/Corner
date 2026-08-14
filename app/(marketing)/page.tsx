import Image from "next/image";
import Link from "next/link";
import ThemeToggle from "../ui/ThemeToggle";
import LanguagePicker from "../ui/LanguagePicker";
import WorkWithUsChip from "../ui/WorkWithUsChip";
import OrderStatusBar from "../shop/OrderStatusBar";
import AboutMark from "./AboutMark";

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
          is still there, and now it is the (i) right beside the mark.

          The mark and About together.
          One `relative` box holding two links rather than one, because an
          anchor cannot be nested inside another anchor — putting the (i)
          inside the logo's Link would make the whole mark's markup invalid
          and the (i) unclickable in some browsers. Siblings, positioned
          against the same box. */}
      <div className="relative">
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

        {/* About, at the top-right of the mark — level with the R that ends
            CORNER. It was the fifth tab, which is a fifth of the bar spent on
            a page nobody visits twice; the account had no door at all. So
            they traded places.

            Here rather than in the corner strip with hiring, language and
            appearance: those three are settings about how you use the app,
            and this is about the shop. Beside the name is where a story about
            the name belongs.

            Its own hit area, 28px, which is under the 44px guideline and
            deliberate — this is the quietest thing on the page and making it
            finger-sized would make it the loudest. Everything that matters
            here is one tap on a 288px logo. */}
        {/* Percentages, not edges. The box is square and the artwork is
            object-contain inside it, so the mark sits in a band through the
            middle and the box's own top-right corner is empty air — pinned
            there the (i) floated a centimetre above the logo with nothing
            between them. These numbers put it against the R that ends
            CORNER, and because the box stays square at every breakpoint they
            hold from 192px to 288px without a second set. */}
        <AboutMark className="absolute left-[79%] top-[13%]" />
      </div>

      {/* Language and appearance, in the corner opposite the privacy line, so
          the chrome brackets the page rather than crowding it. Both are 28px
          and sit on one row, which is what keeps them reading as one strip
          rather than two widgets.

          `end-4` rather than `right-4`: under Urdu the document is mirrored,
          and this belongs in whichever corner is the far one. The safe-area
          inset keeps it out of the notch on an installed app. */}
      <div
        // flex-wrap + justify-end: "We Are Hiring!" is a whole phrase, and in
        // Burmese it is a long one. Rather than truncate it into nonsense or
        // let the strip push past the edge on a narrow phone, the row wraps
        // and the chip takes a second line — still in the corner, still tidy.
        className="absolute end-4 z-10 flex max-w-[calc(100%-2rem)] flex-wrap items-center justify-end gap-2"
        style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
      >
        <WorkWithUsChip />
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
