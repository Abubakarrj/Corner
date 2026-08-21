// Where a card sits on the bench.
//
// ——— ⚠️ Derived from the id, never random ———
//
// The obvious way to scatter is Math.random() per card, and it is the way that
// breaks the page. This wall is server-rendered: the server picks its angles,
// the browser picks different ones, React finds markup that does not match what
// it was about to draw, and every card jumps at hydration. Worse, they jump
// again on any re-render — pin a note up and the whole wall reshuffles itself
// under the person who just wrote it.
//
// So the angle is a function of the note's id. The same card is at the same
// angle on the server, in the browser, after a re-render, and tomorrow. Two
// people looking at the wall see the same wall, which is the point of a wall.
//
// ——— Bounded on purpose ———
//
// Five degrees and a few pixels. It has to read as "put down by hand" rather
// than "the page is broken", and a rotated card is wider than an upright one:
// at 320px two columns are already tight, and a card at fifteen degrees pushes
// its own corner into its neighbour and the row's height up with it.

/** A stable number in [0, 1) for a string.
 *
 *  FNV-1a, which is four lines and has no dependencies. Nothing here is
 *  security-sensitive — it decides an angle — so the only properties that
 *  matter are that it is deterministic and that ids differing in one character
 *  land somewhere different. */
function hash(id: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    value ^= id.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  // >>> 0 first: Math.imul returns a signed 32-bit int, and a negative one
  // divided by 2^32 gives a negative "fraction" that puts every angle it
  // touches on the same side.
  return (value >>> 0) / 0x100000000;
}

export type Tilt = { rotate: number; x: number; y: number };

/** How this card lies.
 *
 *  Three numbers off one hash rather than three hashes: the id is hashed once
 *  and the bits are spent on angle, then across, then down. */
export function tiltFor(id: string): Tilt {
  const seed = hash(id);
  const across = hash(`${id}:x`);
  const down = hash(`${id}:y`);
  return {
    // −4.5° to +4.5°, rounded to a tenth so the inline style is short.
    rotate: Math.round((seed * 9 - 4.5) * 10) / 10,
    x: Math.round(across * 10 - 5),
    y: Math.round(down * 14 - 7),
  };
}

/** The style a card wears on the bench.
 *
 *  ⚠️ `transform` rather than Tailwind's rotate utility, because the value is
 *  per-card and a class cannot hold an arbitrary number. Kept as one string so
 *  the caller cannot apply half of it. */
export function scatterStyle(id: string): { transform: string } {
  const { rotate, x, y } = tiltFor(id);
  return { transform: `translate(${x}px, ${y}px) rotate(${rotate}deg)` };
}
