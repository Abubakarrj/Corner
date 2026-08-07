"use client";

import { usePathname } from "next/navigation";
import BagelMark from "./BagelMark";
import {
  CAPTION_REFERENCE,
  captionGap,
  captionStyle,
  contentBox,
  frameHeight,
  gutter,
  pageWrapper,
} from "./bagelLayout";

// The corner bagel icon, restored on the about page at the request of the
// user, who wanted it back in its original corner rather than removed. Used to
// link to /about; now links home instead, since /about no longer exists.
//
// The positioning is inherited from the old /bagel page's layout math (see
// bagelLayout.ts): an invisible replica of that page (page wrapper -> content
// box -> frame -> caption) with nothing visible in it, hanging the icon off
// the right-hand end of an invisible copy of the caption text. That's what
// puts it in this specific corner; it no longer means anything about a real
// /bagel page, since there isn't one, but it reproduces the exact position
// asked for.
//
// ——— Why this is tablet and up only ———
//
// Because the maths above is viewport maths, and the About card is content.
// The icon lands at one fixed y no matter what is on the page, while the
// contact line at the bottom of the card moves with how long the copy is in
// the chosen language. Measured on a 390x844 phone, the icon sits at y 613-629
// in all seven languages while the email line ranges from y 591 (Chinese) to
// y 693 (Burmese) — a 100px swing. In Korean and Urdu they land on top of each
// other; in Chinese there are nine pixels between them. That is the bug the
// user hit: tapping the bagel opened the email.
//
// It is not fixable by nudging, and the measurements say why. On a phone the
// card is 342 of 390 available pixels wide and up to 542 tall, so the icon's
// column is inside the card at almost every height, and the heights the card
// does leave free move with the language. There is no fixed point on a phone
// that is reliably beside the card rather than on it.
//
// From sm up there is room, and the same maths already produces it: the icon
// lands 20px clear of the card's right edge at every width and language
// measured. So the corner stays where it is on the sizes that have a corner,
// and on a phone the bagel goes into the card's own flow under the contact
// line, where whitespace is something the layout guarantees rather than
// something the copy happens to leave over. See AboutCardBody.
export default function CornerBagelIcon() {
  const pathname = usePathname();
  if (pathname !== "/about") return null;

  return (
    // The breakpoint gate is its own element rather than a `hidden sm:flex` on
    // the box below, because that box already carries `flex` from pageWrapper
    // and two display utilities on one element is a question about which rule
    // Tailwind emitted last.
    <div className="hidden sm:block">
      <div
        // Nudged down 20px from where the layout math alone puts it. That maths
        // reproduces the old /bagel page's corner exactly, and the corner it
        // lands in leaves the bagel hanging in the gap above the contact line
        // rather than sitting with it. The offset is the whole adjustment —
        // everything else about the position is still inherited.
        className={`pointer-events-none fixed left-2 md:left-30 top-5 md:-top-[6.25rem] z-40 ${pageWrapper}`}
      >
        <div className={contentBox}>
          {/* Stand-in for the image frame: no content, only the height, so the
              caption below it lands where the real one does. */}
          <div className={`w-full ${frameHeight}`} />

          <p className={`m-0 ${captionGap} text-sm ${gutter}`} style={captionStyle}>
            {/* The reference caption, invisible — it exists to be measured.
                Being inline-block, it's exactly as wide as the text and centred
                exactly where the real caption's text is, so `left-full` is that
                text's right-hand end. `visible` on the link re-shows it inside
                its invisible parent. */}
            <span className="relative inline-block invisible">
              {CAPTION_REFERENCE}
              {/* One size now rather than 16px at sm and 24px from md. The
                  small step only ever applied to phones and the narrow end of
                  tablets, and phones no longer render this at all. */}
              <BagelMark
                size="wide"
                place="absolute"
                className="visible left-full top-1/2 ml-1.5 -translate-y-1/2 md:ml-2"
              />
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
