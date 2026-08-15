"use client";

// A value that changes, changing visibly.
//
// ——— What this is for ———
//
// Prices, mostly, and the rewards balance. Corner Bagel's tickets move as you
// build them: a spread is +$1.50, a second bagel doubles a line, a tip changes
// the total. Every one of those numbers was replaced in place — one frame it
// says $12.00, the next it says $13.50, and nothing says which number moved or
// that anything did. On a screen carrying a subtotal, a tax line, a delivery
// fee and a total, that is four numbers where any of them might have been the
// one that changed.
//
// ——— This is transitions.dev's number pop-in ———
//
// See 02-number-pop-in.md. Each character re-enters on its own with a blurred
// 8px rise, and the last two characters are held back by --digit-stagger so
// the cents land after the dollars. That last part is what the hand-rolled
// version this replaces could not do: it moved the whole string as one block,
// so "$12.00" → "$13.50" was one nudge rather than a number resolving.
//
// Replay is by key, not by the snippet's remove-reflow-re-add. React already
// unmounts and remounts a keyed subtree when the key changes, which replays a
// CSS animation for the same reason the manual reflow does — the element is
// new. The imperative version exists in the reference because it is written
// against plain DOM; here it would be a second mechanism doing React's job,
// plus a setState in an effect on every price change.
//
// ——— And what it deliberately is not ———
//
// Not a counter. Nothing rolls through the intervening values and nothing
// ticks digit by digit: a slot machine makes somebody wait to find out what
// they are paying, which is the one thing a price must never do. That is
// 26-spinning-counter, and it is the wrong pattern for money. The new value is
// in the DOM immediately and readable the whole time.
//
// It does animate on first paint. That is consistent rather than sloppy —
// .cb-rise and .cb-stagger animate entrances all over this app — and a price
// arriving with the screen reads as part of the screen arriving.

/** Marks the last two characters so they ride 1× and 2× --digit-stagger
 *  behind the rest, exactly as the reference's setDigits() does. */
function staggerOf(index: number, length: number): "1" | "2" | undefined {
  if (index === length - 2) return "1";
  if (index === length - 1) return "2";
  return undefined;
}

export default function Swap({
  value,
  className = "",
}: {
  /** The text to show. A change to this is what animates. */
  value: string;
  className?: string;
}) {
  const characters = [...value];
  return (
    <span className={`cb-swap ${className}`}>
      {/* ——— The value once, in one piece, for anything that reads ———

          The group below is one element per character, because that is what
          staggering them requires. To an assistive technology that is not a
          price, it is six unrelated labels: "$46.50" is announced "dollar,
          four, six, point, five, zero", on every total in the app.

          So the plain string is here for the accessibility tree and the
          animated copy is hidden from it. Nobody looking at the screen can
          tell the difference; anybody listening gets a number. */}
      <span className="sr-only">{value}</span>
      {/* The key is the whole value: change it and React throws the group
          away, which is what replays the animation. */}
      <span key={value} aria-hidden className="t-digit-group is-animating">
        {characters.map((character, index) => (
          <span
            // Index is a safe key here only because the group is remounted
            // wholesale on every value change — nothing is ever reordered
            // inside a group that outlives its value.
            key={index}
            className="t-digit"
            data-stagger={staggerOf(index, characters.length)}
          >
            {/* A space would collapse in an inline-block, and prices in
                French and Persian use one as a group separator. */}
            {character === " " ? " " : character}
          </span>
        ))}
      </span>
    </span>
  );
}
