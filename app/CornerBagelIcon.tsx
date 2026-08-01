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

// The corner bagel icon, restored on /order at the request of the user, who
// wanted it back in its original corner rather than removed. Used to link to
// /about; now links home instead, since /about no longer exists.
//
// The positioning is inherited from the old /bagel page's layout math (see
// bagelLayout.ts): an invisible replica of that page (page wrapper -> content
// box -> frame -> caption) with nothing visible in it, hanging the icon off
// the right-hand end of an invisible copy of the caption text. That's what
// puts it in this specific corner; it no longer means anything about a real
// /bagel page, since there isn't one, but it reproduces the exact position
// asked for.
export default function CornerBagelIcon() {
  const pathname = usePathname();
  if (pathname !== "/order") return null;

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
              href="/"
              aria-label="Corner Bagel"
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
