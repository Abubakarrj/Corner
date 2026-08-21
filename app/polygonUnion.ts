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
// simple loops and nothing else — no intersection, no difference.
//
// ——— ⚠️ Holes, which it does produce, and which are usually real ———
//
// Counters arranged around a gap leave a hole in the union: somewhere further
// than the radius from every one of them, ringed by ground that is not. The
// walk traces those as loops wound the other way, and Google renders an
// opposite-wound path in the same Polygon as a hole — so they come out right
// without this file doing anything special.
//
// That is the correct answer and the map should show it. Measured against a
// non-zero winding fill — which is what Google actually paints — the union of
// nine irregular reaches punches no hole in ground a counter covers and claims
// no ground none of them do, on every arrangement tried.
//
// ⚠️ The exception is a hole thinner than the margin the rings were already
// pulled in by, and that one is not a measurement. See closeGapsUnderMiles.

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

/** Roughly how wide a loop is, in miles: twice its area over its perimeter.
 *
 *  Exact for a circle, where it is the radius, and for a long thin shape it
 *  comes out at about the width — which is the case this is for. A flat-earth
 *  approximation at the loop's own latitude, because the loops in question are
 *  a few hundred feet across and the curvature of the earth is not what decides
 *  whether to draw them. */
function widthMiles(loop: Ring): number {
  const MILES_PER_DEGREE = 69.0;
  const lat = loop.reduce((sum, p) => sum + p[0], 0) / loop.length;
  const scale = Math.cos((lat * Math.PI) / 180);
  const xy = loop.map((p) => [p[1] * scale * MILES_PER_DEGREE, p[0] * MILES_PER_DEGREE]);

  let twiceArea = 0;
  let perimeter = 0;
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i, i += 1) {
    twiceArea += xy[j][0] * xy[i][1] - xy[i][0] * xy[j][1];
    perimeter += Math.hypot(xy[i][0] - xy[j][0], xy[i][1] - xy[j][1]);
  }
  if (perimeter === 0) return 0;
  return Math.abs(twiceArea) / perimeter;
}

/** Signed area, whose sign is which way a loop is wound. */
function winding(loop: Ring): number {
  let twice = 0;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
    twice += loop[j][1] * loop[i][0] - loop[i][1] * loop[j][0];
  }
  return twice / 2;
}

/** The outline of the union: one closed ring per connected piece.
 *
 *  ⚠️ Returns the input unchanged when there is one ring or none, so the common
 *  cases cost nothing and cannot be made wrong by this file.
 *
 *  Rings that share no ground come back as separate loops, which is what the
 *  map wants: San Clemente is thirty miles from anything and drawing a line to
 *  it would claim the sea.
 *
 *  Holes come back too, wound the other way, which is how Google draws one.
 *
 *  ——— ⚠️ closeGapsUnderMiles, and the trade it makes ———
 *
 *  Drops holes narrower than this, leaving the ground filled.
 *
 *  It exists because the caller does not hand over what it measured — it hands
 *  over rings already pulled in by a few hundred feet, to cover the straight
 *  edge between two rays cutting outside a curve. Where two reaches nearly
 *  meet, that margin opens a gap between them, and sometimes invents one that
 *  the measurement did not have. Measured on nine irregular reaches: the inset
 *  widened every real hole and, on one arrangement in five, added a hole that
 *  was not there before. On screen they are red needles a few hundred feet
 *  wide, and they read as the map being broken.
 *
 *  ⚠️ Closing them is the one place this file knowingly draws ground that may
 *  be out of range, so the size of that is worth stating: at most this many
 *  miles, at the edge of a boundary that was itself pulled in by the same
 *  amount. An address in a closed sliver measures something like 10.07 miles,
 *  and the check under the map — which asks the routing API about that exact
 *  address — still says no. Set it to zero and every hole is drawn as measured.
 *
 *  A real gap is much bigger than this and is left alone. It should be: a place
 *  further than the radius from every counter, ringed by places that are not,
 *  is the honest answer and the reason the map is measured rather than drawn. */
export function unionRings(
  rings: Ring[],
  options: { closeGapsUnderMiles?: number } = {},
): Ring[] {
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

  const gap = options.closeGapsUnderMiles ?? 0;
  if (gap <= 0) return loops;

  // Which way round the input was wound. Holes are the loops that came back
  // the other way, and the input's own winding is what says which that is —
  // rather than assuming a convention the caller might not share.
  const outward = Math.sign(winding(usable[0]));
  return loops.filter(
    (loop) => Math.sign(winding(loop)) === outward || widthMiles(loop) >= gap,
  );
}
