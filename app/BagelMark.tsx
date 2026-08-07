import Link from "next/link";
import Image from "next/image";

// The bagel, as a link home.
//
// Extracted because it now appears in two places on /about and they have to
// stay the same mark: the fixed corner on tablet and desktop (CornerBagelIcon)
// and an in-flow one under the contact line on a phone, where a fixed corner
// has nowhere to go that the card isn't already using. See CornerBagelIcon for
// why that split exists.
//
// ——— On the hit area ———
//
// The art is 16px on a phone and 24px above it, and 16px is less than half the
// 44px Apple asks of a touch target. It used to be the entire link, sitting
// against a mailto that stretched the full 342px width of the card, and the
// measurable result was that a finger aimed at the bagel opened the email — not
// because the bagel was covered, but because it is small and the thing around
// it was enormous.
//
// So the link grows a hit area: a transparent ::before inset -14px on every
// side, which is 44px across. A pseudo-element rather than padding, because
// padding is layout — it would move the art inside a `left-full` absolute
// position, and pulling it back with a negative margin puts two margin
// utilities on one element and makes the position depend on which rule
// Tailwind emitted last. An inset ::before changes nothing about where
// anything sits; there is simply something to hit around the bagel.
//
// ——— Why `place` is a prop and not a class ———
//
// Because the ::before above needs this element positioned, and the corner
// needs it positioned *absolutely*, and the first version of this file wrote
// `relative` into the base classes and let the caller pass `absolute` in
// className. Tailwind emits .relative after .absolute, so relative quietly won
// and the corner icon became a relatively-positioned box offset by left:100%
// from wherever the text flow left it.
//
// In English that lands near the right-hand end anyway, so it looked correct.
// In Urdu the flow runs the other way, and the same offset put the bagel at
// x=827 in a 768px viewport — entirely off the screen, in the one language
// nobody would think to check. Two position utilities on one element is not a
// style question, it is a coin toss, so the caller states its intent and this
// picks the class.
export default function BagelMark({
  className = "",
  size = "phone",
  place = "flow",
}: {
  className?: string;
  /** Which art size to draw. The hit area is 44px either way. */
  size?: "phone" | "wide";
  /** How the caller positions it. "absolute" means the caller supplies offsets. */
  place?: "flow" | "absolute";
}) {
  const art = size === "wide" ? "h-6 w-6" : "h-4 w-4";
  // 24px art + 10 either side = 44. 16px art + 14 either side = 44.
  const reach = size === "wide" ? "before:-inset-[10px]" : "before:-inset-[14px]";
  const position = place === "absolute" ? "absolute" : "relative";

  return (
    <Link
      href="/"
      aria-label="Corner Bagel"
      className={
        `cb-press pointer-events-auto block cursor-pointer ${position} ` +
        `before:absolute before:content-[''] ${reach} ${art} ${className}`
      }
    >
      <Image
        src="/icon.svg"
        alt="Corner Bagel Icon"
        fill
        unoptimized
        className="object-contain"
      />
    </Link>
  );
}
