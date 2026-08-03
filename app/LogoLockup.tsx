import Image from "next/image";
import Link from "next/link";

// The landing mark: the wordmark with the secondary bagel rolling in from
// the left. Pulled out of the homepage so /location can render the same
// thing behind its modal — the location picker is a pop-up over the site,
// not a page of its own, so there has to be a site under it.
//
// `interactive` is off for that backdrop use: the mark is behind a modal
// there, so its link would be a focusable target under an overlay that has
// its own focus trap.
export default function LogoLockup({
  interactive = true,
}: {
  interactive?: boolean;
}) {
  const mark = (
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
  );

  if (!interactive) return <div aria-hidden>{mark}</div>;

  return (
    <Link href="/order" className="cursor-pointer">
      {mark}
    </Link>
  );
}
