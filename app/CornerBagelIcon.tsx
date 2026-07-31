"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  CAPTION_REFERENCE,
  captionGap,
  captionStyle,
  contentBox,
  frameHeight,
  gutter,
  pageWrapper,
} from "./bagelLayout";

// The corner bagel icon. /bagel only — it used to also appear on /order and
// /about, positioned via this same replica-of-the-bagel-page-layout trick,
// but those two pages have no bagel photo for it to sit against, so it just
// floated alone in empty space. Since it no longer needs to persist across
// navigation to pages it isn't on, this could move into the /bagel page
// itself, but it's kept here, just narrowed to one route, to leave the
// (already-correct) positioning math untouched.
//
// It's pinned to the bagel page's caption line: the overlay reproduces that
// page's layout (page wrapper -> content box -> frame -> caption) with nothing
// visible in it, then hangs the icon off the right-hand end of an invisible copy
// of the caption text. Every measurement in that replica comes from the viewport
// alone — see bagelLayout — so it resolves identically to the real page.
export default function CornerBagelIcon() {
  const pathname = usePathname();
  if (pathname !== "/bagel") return null;

  return (
    <div
      className={`pointer-events-none fixed left-2 md:left-30 md:-top-30 top-0 z-40 ${pageWrapper}`}
    >
      <div className={contentBox}>
        {/* Stand-in for the image frame: no content, only the height, so the
            caption below it lands where the real one does. */}
        <div className={`w-full ${frameHeight}`} />

        <p className={`m-0 ${captionGap} text-sm ${gutter}`} style={captionStyle}>
          {/* The reference caption, invisible — it exists to be measured. Being
              inline-block, it's exactly as wide as the text and centred exactly
              where the real caption's text is, so `left-full` is that text's
              right-hand end. `visible` on the link re-shows it inside its
              invisible parent. */}
          <span className="relative inline-block invisible">
            {CAPTION_REFERENCE}
            <Link
              href="/about"
              aria-label="About Corner Bagel"
              className="pointer-events-auto visible absolute left-full top-1/2 ml-1.5 h-4 w-4 -translate-y-1/2 cursor-pointer md:ml-2 md:h-6 md:w-6"
            >
              <Image
                src="/icon.svg"
                alt="Corner Bagel Icon"
                fill
                unoptimized
                className="object-contain"
              />
            </Link>
          </span>
        </p>
      </div>
    </div>
  );
}
