import Image from "next/image";
import Link from "next/link";

const BRAND_RED = "#BE1923";

// Modeled on Middle Child's location picker: a stacked list of storefront
// line drawings, each captioned with its neighbourhood, separated by a
// hairline. One entry per shop.
//
// Kept as an array rather than written out inline so a second location is a
// data change, not a layout change — the heading, the separators, and the
// grid all key off the length. Right now there is one.
//
// `href` is deliberately absent: there is no per-location page, address, or
// ordering link yet, and a card that looks tappable but goes nowhere is
// worse than one that doesn't. When those exist, adding the field and
// wrapping the card in a Link is the whole change.
type Location = {
  name: string;
  image: string;
  // Describes the drawing for anyone who can't see it — not a caption, since
  // the neighbourhood name is already rendered below the image.
  alt: string;
};

const LOCATIONS: Location[] = [
  {
    name: "Korean Town",
    image: "/location-korean-town.png",
    alt: "Line drawing of the Corner Bagel storefront: a glass shopfront above a raised stoop with a railing and steps up from the sidewalk.",
  },
];

export const metadata = {
  title: "Location — Corner Bagel",
  description: "Where to find Corner Bagel.",
};

export default function LocationPage() {
  const many = LOCATIONS.length > 1;

  return (
    <section
      // Bottom padding clears the fixed cookie banner, same as the policy
      // pages — without it the "Go Back" link at the foot of the page can
      // render behind it.
      className="min-h-screen w-full bg-white px-6 pt-12 pb-[calc(9rem+env(safe-area-inset-bottom))] md:pt-16"
      style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
    >
      <div className="mx-auto max-w-md">
        <h1
          className="text-center text-[15px] font-bold uppercase tracking-[0.08em] text-[#2D2D2D] sm:text-[17px]"
          style={{ letterSpacing: "0.08em" }}
        >
          {many ? "Choose your location" : "Our location"}
        </h1>

        <ul className="m-0 mt-8 list-none p-0">
          {LOCATIONS.map((location, index) => (
            <li
              key={location.name}
              // The hairline sits between entries rather than under every
              // one, so a single location doesn't get a stray rule under it.
              className={index > 0 ? "mt-10 border-t border-[#E5E5E5] pt-10" : ""}
            >
              {/* The asset is transparent line art — ink in the alpha
                  channel, no paper behind it. That's deliberate: the source
                  scan's paper was 252-254 rather than pure white, and even
                  after clipping it to 255 the lossy WebP the image optimizer
                  serves renders it back as 254, which reads as a faint grey
                  panel against the page. With no background at all there's
                  nothing to mismatch. Don't flatten it onto white. */}
              <Image
                src={location.image}
                alt={location.alt}
                width={831}
                height={900}
                // Fills the column and keeps its aspect ratio. Priority
                // because it's the only thing on the page — there is nothing
                // else for a visitor to look at while it loads.
                className="h-auto w-full"
                priority={index === 0}
              />
              <p
                className="mt-4 text-center text-[26px] leading-tight sm:text-[30px]"
                style={{ color: BRAND_RED, letterSpacing: "-0.02em" }}
              >
                {location.name}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-12 border-t border-gray-100 pt-8 text-center">
          <Link href="/" className="font-semibold text-[#2D2D2D] hover:underline">
            &larr; Go Back
          </Link>
        </div>
      </div>
    </section>
  );
}
