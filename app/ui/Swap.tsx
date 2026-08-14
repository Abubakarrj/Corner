"use client";

// A value that changes, changing visibly.
//
// ——— What this is for ———
//
// Prices, mostly. Corner Bagel's tickets move as you build them: a spread is
// +$1.50, a second bagel doubles a line, a tip changes the total. Every one of
// those numbers was replaced in place — one frame it says $12.00, the next it
// says $13.50, and nothing says which number moved or that anything did. On a
// screen carrying a subtotal, a tax line, a delivery fee and a total, that is
// four numbers where any of them might have been the one that changed.
//
// ——— And what it deliberately is not ———
//
// Not a counter. Nothing rolls through the intervening values and nothing
// ticks digit by digit: a slot machine makes somebody wait to find out what
// they are paying, which is the one thing a price must never do. The new value
// is in the DOM immediately and readable the whole time; what animates is a
// 4px rise and a fade over --motion-fast. 120ms.
//
// ——— Why there is no state in here ———
//
// The first cut kept the outgoing value in state and cleared it on a timer, so
// the two could crossfade. That is a setState inside an effect on every price
// change — a second render per keystroke on a screen with several of these —
// and the crossfade it bought is invisible at 120ms.
//
// Changing `key` is enough: React unmounts the old span and mounts a new one,
// which replays the entrance. No state, no timer, nothing to clean up, and
// nothing to leak if the value changes twice inside the animation.
//
// It does animate on first paint. That is consistent rather than sloppy —
// .cb-rise and .cb-stagger animate entrances all over this app — and a price
// arriving with the screen reads as part of the screen arriving.

export default function Swap({
  value,
  className = "",
}: {
  /** The text to show. A change to this is what animates. */
  value: string;
  className?: string;
}) {
  return (
    <span className={`cb-swap ${className}`}>
      <span key={value} className="cb-swap-in">
        {value}
      </span>
    </span>
  );
}
