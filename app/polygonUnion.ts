// Several overlapping loops, drawn as one outline.
//
// ——— ⚠️ Why the map needed this ———
//
// app/deliveryArea.ts measures a ring around every counter, and the area the
// shop serves is their union. Handed to Google as one Polygon with several
// paths, the *fill* unions correctly — the overlaps stay filled — and the
// *stroke* does not. Every ring draws its whole outline, including the arcs
// buried inside its neighbours, so a map of nine counters is nine red circles
// crossing each other rather than the shape of a delivery area. It reads as a
// diagram of the algorithm instead of an answer to the question.
//
// So the union is computed properly and only the outer boundary is drawn.
//
// ——— How, and why not the other ways ———
//
// This is a boolean union of polygons. The usual answers are a library
// (Martinez, polygon-clipping, turf) — none of which this app has, and adding
// one for a single map is a dependency to keep forever — or sampling a grid
// and tracing it, which produces a blocky outline whose resolution has to be
// argued about.
//
// What is here instead is the textbook approach, which is short because the
// input is friendly: split every edge at its crossings with every other loop,
// throw away the pieces that are inside some other loop, and walk what is left
// into closed rings. It is exact rather than sampled, and it costs nothing at
// this size — nine loops of thirty-six edges is a few hundred segments.
//
// ⚠️ What it assumes about its input, which the caller does satisfy:
//
//   every loop is simple (does not cross itself) and closed;
//   every loop is wound the same way;
//   loops may overlap, touch, or be entirely separate.
//
// Nothing here is a general-purpose geometry kernel. It handles the union of
// simple loops and nothing else — no intersection, no difference, no holes.
// Holes are the one real limitation and they are worth naming: three counters
// arranged in a ring with a gap in the middle would have that gap filled in.
// Whether that ever happens is a question about where the shop opens, and
// tests/polygonUnion.test.ts asserts the shapes it does handle rather than
// pretending otherwise.

export type Point = [number, number];
export type Ring = Point[];

// ⚠️ Everything here works in degrees, and the tolerance is in degrees too.
// 1e-9 of latitude is about a tenth of a millimetre — far below any distance
// this app can measure — so it is a test for "the same point" rather than a
// rounding anybody can see.
const EPS = 1e-9;

function near(a: Point, b: Point): boolean {
  return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
}

/** Where two segments cross, as fractions along each, or null.
 *
 *  ⚠️ Parallel and collinear pairs return null rather than a point. Two edges
 *  lying on top of each other have no single crossing, and inventing one is how
 *  a walk ends up going back the way it came. The caller's rings come from
 *  independent measurements around different shops, so exactly-collinear edges
 *  are vanishingly unlikely and the failure of ignoring them is a slightly
 *  wrong vertex rather than a broken loop. */
function crossing(a1: Point, a2: Point, b1: Point, b2: Point): { t: number; u: number } | null {
  const ax = a2[1] - a1[1];
  const ay = a2[0] - a1[0];
  const bx = b2[1] - b1[1];
  const by = b2[0] - b1[0];
  const denominator = ax * by - ay * bx;
  if (Math.abs(denominator) < 1e-15) return null;
  const dx = b1[1] - a1[1];
  const dy = b1[0] - a1[0];
  const t = (dx * by - dy * bx) / denominator;
  const u = (dx * ay - dy * ax) / denominator;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { t, u };
}

/** Whether a point is inside a ring, by the even-odd ray rule.
 *
 *  The same test tests/deliveryArea.test.ts uses on the drawn boundary, which
 *  is deliberate: the sweep that decides whether the map over-claims and the
 *  code that decides what the map draws should not disagree about what "inside"
 *  means. */
export function inRing(point: Point, ring: Ring): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (
      yi > point[0] !== yj > point[0] &&
      point[1] < ((xj - xi) * (point[0] - yi)) / (yj - yi) + xi
    ) {
      hit = !hit;
    }
  }
  return hit;
}

/** Every edge of every ring, cut at each crossing with another ring, keeping
 *  only the pieces that lie outside all the others.
 *
 *  A piece is tested at its own midpoint. Testing an endpoint would land
 *  exactly on another ring's boundary at every crossing, which is the one place
 *  an inside/outside test has no answer. */
function outerArcs(rings: Ring[]): [Point, Point][] {
  const arcs: [Point, Point][] = [];

  rings.forEach((ring, index) => {
    for (let i = 0; i < ring.length; i += 1) {
      const from = ring[i];
      const to = ring[(i + 1) % ring.length];

      // Every fraction along this edge where another ring crosses it.
      const cuts: number[] = [0, 1];
      rings.forEach((other, otherIndex) => {
        if (otherIndex === index) return;
        for (let j = 0; j < other.length; j += 1) {
          const hit = crossing(from, to, other[j], other[(j + 1) % other.length]);
          if (hit && hit.t > EPS && hit.t < 1 - EPS) cuts.push(hit.t);
        }
      });
      cuts.sort((a, b) => a - b);

      for (let c = 0; c < cuts.length - 1; c += 1) {
        const start = cuts[c];
        const end = cuts[c + 1];
        if (end - start < EPS) continue;
        const at = (f: number): Point => [
          from[0] + (to[0] - from[0]) * f,
          from[1] + (to[1] - from[1]) * f,
        ];
        const middle = at((start + end) / 2);
        const swallowed = rings.some(
          (other, otherIndex) => otherIndex !== index && inRing(middle, other),
        );
        if (!swallowed) arcs.push([at(start), at(end)]);
      }
    }
  });

  return arcs;
}

/** The outline of the union: one closed ring per connected piece.
 *
 *  ⚠️ Returns the input unchanged when there is one ring or none, so the common
 *  cases cost nothing and cannot be made wrong by this file.
 *
 *  Rings that share no ground come back as separate loops, which is what the
 *  map wants: San Clemente is thirty miles from anything and drawing a line to
 *  it would claim the sea. */
export function unionRings(rings: Ring[]): Ring[] {
  const usable = rings.filter((ring) => ring.length >= 3);
  if (usable.length <= 1) return usable;

  const arcs = outerArcs(usable);
  if (arcs.length === 0) return [];

  // ——— Walking the arcs into loops ———
  //
  // Every kept arc runs the same way round as the ring it came from, and all
  // the rings are wound the same way, so following "the arc that starts where
  // this one ended" traces the outside of the union. The joins are exact — two
  // arcs meeting at a crossing were both cut at the same computed point — so
  // matching is a coordinate comparison rather than a search.
  const unused = arcs.slice();
  const loops: Ring[] = [];

  while (unused.length > 0) {
    const first = unused.pop();
    if (!first) break;
    const loop: Point[] = [first[0], first[1]];
    let end = first[1];

    // ⚠️ Bounded by the number of arcs. A walk that cannot find its way home —
    // which a degenerate input could cause — has to stop rather than spin,
    // because this runs on a request path and the alternative to a slightly
    // wrong map is no page at all.
    for (let step = 0; step < arcs.length + 1; step += 1) {
      if (near(end, loop[0])) break;
      const next = unused.findIndex((arc) => near(arc[0], end));
      if (next === -1) break;
      const [arc] = unused.splice(next, 1);
      loop.push(arc[1]);
      end = arc[1];
    }

    // Three points is the least that encloses anything. A shorter run is a
    // fragment the walk could not close, and drawing it would put a stray line
    // across the map.
    if (loop.length >= 3 && near(end, loop[0])) {
      // The closing point repeats the first; Google closes a path itself.
      loops.push(loop.slice(0, -1));
    }
  }

  return loops;
}
