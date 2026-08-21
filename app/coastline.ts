// Where the land stops.
//
// ——— ⚠️ Why a bagel shop has a coastline in it ———
//
// app/deliveryArea.ts measures how far a counter reaches by asking the Routes
// API about a point and reading back the driving distance. A waypoint is a
// coordinate, not an address, so Routes puts it on the nearest road before it
// measures anything — and it does that in the water too, silently. Ask about a
// point a mile out in Santa Monica Bay and the answer is not a refusal, it is
// the distance to a road on the beach, returned as an ordinary success.
//
// The binary search reads that as "in range" and pushes the ray further out.
// So the published map had the Pacific shaded in: measured against a stub that
// snaps the way Routes does, the drawn area covered seventy-three square miles
// of ocean when Google would reach two miles for a road, and a hundred and
// sixty when it would reach five. The furthest the boundary got from the shore
// tracked that reach almost exactly, which is the fingerprint.
//
// ⚠️ There is a free test for a moved waypoint and it is not enough on its own.
// A road route is never shorter than the straight line, so a distance under it
// proves the far end moved — see looksSnapped in deliveryArea.ts. It is exact,
// and it is weak: the shortfall only shows once the ray is about as far out as
// the counter is from the shoreline, so it clears the open ocean and leaves the
// first mile or two. Measured, it took a hundred and sixty square miles down to
// seventy-seven. Better, still a map with sea on it.
//
// The thing that actually decides whether a point is in the water is where the
// water is, so that is what this file is.
//
// ——— The data, and how much to trust it ———
//
// Natural Earth 1:10m physical coastline (naturalearthdata.com), public domain,
// clipped to the Southern California bight and rounded to four decimals — about
// thirty feet, which is far finer than the source. Spot-checked against fifteen
// coastal places whose side of the line is not in question: Venice, Hermosa,
// Belmont Shore, Naples Island, the Balboa Peninsula, Lido Isle, Sunset Beach,
// Bolsa Chica, Dana Point, San Pedro, Point Vicente, Marina del Rey, Playa del
// Rey, Seal Beach and the San Clemente pier. All of them come out on land.
//
// ⚠️ It is a generalised shoreline, not a survey. Around a bay it can sit a
// mile out — the run from Long Beach to Huntington Beach is drawn as one
// straight jump across the mouth of Anaheim Bay — and it is always the sea side
// it errs on, which is the harmless direction here: the worst it does is leave
// a sliver of water shaded. SEA_MARGIN_MILES below is what keeps the other
// direction from happening.
//
// ——— ⚠️ And then the ports, which are newer than the map ———
//
// Natural Earth's shoreline predates most of the landfill that the Port of Los
// Angeles and the Port of Long Beach are built on. Pier 400 sits a mile and
// two thirds seaward of the line; Terminal Island three quarters. All of it is
// real ground with real roads on it, reached by the Vincent Thomas and Gerald
// Desmond bridges, and inside ten miles of the Long Beach counter.
//
// Widening the margin until the ports were safe would have meant calling
// everything within a mile and two thirds of the shoreline "land", which is
// most of the water this file exists to remove. So the harbour is named
// instead. See HARBOUR.

export type Point = [number, number];

/** The Pacific, as one closed ring.
 *
 *  The coastline from Ventura down to Oceanside, then three corners far out to
 *  sea to close it. The corners are deliberately well past anything the shop
 *  could reach — the nearest counter is more than twenty miles from the closing
 *  edges — so the straight lines between them never decide anything.
 *
 *  ⚠️ Ordered along the coast, north-west to south-east, and checked to have no
 *  self-crossings. A polygon that crosses itself has no inside, and the test
 *  below would quietly answer nonsense. */
const PACIFIC: Point[] = [
  [34.1005, -119.0897], [34.0855, -119.0609], [34.0836, -119.0383], [34.0661, -119.0081],
  [34.0657, -118.9974], [34.0596, -118.9775], [34.0479, -118.9540], [34.0432, -118.9368],
  [34.0459, -118.9300], [34.0443, -118.9209], [34.0406, -118.9147], [34.0401, -118.9027],
  [34.0386, -118.8942], [34.0376, -118.8757], [34.0344, -118.8627], [34.0337, -118.8526],
  [34.0208, -118.8298], [33.9994, -118.8070], [34.0010, -118.8041], [34.0048, -118.8028],
  [34.0067, -118.7966], [34.0073, -118.7937], [34.0116, -118.7928], [34.0146, -118.7892],
  [34.0197, -118.7879], [34.0218, -118.7834], [34.0238, -118.7730], [34.0257, -118.7561],
  [34.0319, -118.7484], [34.0325, -118.7305], [34.0294, -118.7068], [34.0319, -118.6932],
  [34.0303, -118.6801], [34.0330, -118.6782], [34.0381, -118.6757], [34.0389, -118.6666],
  [34.0364, -118.6369], [34.0357, -118.6093], [34.0388, -118.6034], [34.0391, -118.5907],
  [34.0365, -118.5826], [34.0411, -118.5706], [34.0379, -118.5573], [34.0389, -118.5441],
  [34.0222, -118.5141], [33.9990, -118.4827], [33.9494, -118.4447], [33.9055, -118.4249],
  [33.8734, -118.4099], [33.8513, -118.3997], [33.8440, -118.3972], [33.8359, -118.3914],
  [33.8176, -118.3918], [33.8057, -118.3957], [33.7980, -118.4086], [33.7911, -118.4093],
  [33.7839, -118.4218], [33.7737, -118.4276], [33.7638, -118.4228], [33.7544, -118.4152],
  [33.7417, -118.4120], [33.7400, -118.4048], [33.7356, -118.4014], [33.7367, -118.3942],
  [33.7401, -118.3850], [33.7372, -118.3761], [33.7357, -118.3623], [33.7263, -118.3548],
  [33.7201, -118.3315], [33.7140, -118.3175], [33.7098, -118.3009], [33.7032, -118.2913],
  [33.7080, -118.2827], [33.7077, -118.2761], [33.7117, -118.2817], [33.7162, -118.2824],
  [33.7153, -118.2722], [33.7238, -118.2745], [33.7387, -118.2783], [33.7503, -118.2738],
  [33.7566, -118.2768], [33.7536, -118.2695], [33.7604, -118.2604], [33.7654, -118.2546],
  [33.7637, -118.2501], [33.7676, -118.2403], [33.7691, -118.2307], [33.7709, -118.2215],
  [33.7490, -118.2138], [33.7423, -118.2097], [33.7466, -118.2027], [33.7393, -118.2025],
  [33.7317, -118.1929], [33.7324, -118.1852], [33.7415, -118.1866], [33.7523, -118.1925],
  [33.7638, -118.2072], [33.7640, -118.1990], [33.7575, -118.1855], [33.7633, -118.1736],
  [33.7588, -118.1526], [33.7436, -118.1174], [33.7310, -118.0905], [33.6360, -117.9785],
  [33.6079, -117.9302], [33.5929, -117.8803], [33.5617, -117.8246], [33.5294, -117.7765],
  [33.4848, -117.7352], [33.4748, -117.7152], [33.4523, -117.6707], [33.4420, -117.6544],
  [33.3904, -117.5963], [33.3352, -117.5088], [33.1659, -117.3619], [33.1085, -117.3222],
  [32.9000, -117.0500], [32.9000, -119.3000], [34.3500, -119.3000],
];

/** The last three points are the corners out at sea, not shoreline. Distance to
 *  the *coast* has to ignore them or a point off Malibu measures its distance
 *  to a line drawn across open water. */
const SHORE_POINTS = PACIFIC.length - 3;

/** How far past the drawn shoreline a point has to be before this file will
 *  call it water, in miles.
 *
 *  ⚠️ It is the error in a generalised shoreline, and it is spent deliberately
 *  in one direction. Everywhere else in the delivery map, the tie goes to
 *  claiming less: a boundary drawn tight sends somebody to the address check,
 *  and a boundary drawn loose sends them to a basket that gets refused at the
 *  end. Here the two sides are not those. A margin too small clips real blocks
 *  off the coast, where people live; a margin too large shades open water,
 *  where nobody does and nobody will ever try to order. So this one rounds the
 *  other way, and the price of that is measured below rather than waved at.
 *
 *  The number comes from measuring, not from taste. Of the coastal places
 *  checked in tests/coastline.test.ts, the ones the drawn shoreline swallows
 *  are the harbours and the made ground beside them — Dana Point's outer works
 *  are the furthest at about half a mile, Alamitos Bay's jetty a third, and
 *  every ordinary beach block is inside a tenth. Six tenths clears all of it.
 *
 *  The cost is a sliver: up to this much water can still be shaded where a ray
 *  runs straight out from a beachfront counter. Against the two to five miles
 *  of open ocean that were being shaded before, it is a line that looks like it
 *  is on the coast. */
export const SEA_MARGIN_MILES = 0.6;

/** The Ports of Los Angeles and Long Beach, which are land and are not in the
 *  data. See the note at the top.
 *
 *  ⚠️ A box, drawn to contain every made acre out to Pier 400 and Pier J. It
 *  takes in some genuine harbour water doing that, which is the direction to be
 *  wrong in: the alternative was cutting the port off the map, and the water it
 *  takes in is inside the federal breakwater — a place that reads as harbour
 *  rather than as the open sea.
 *
 *  ⚠️ It was bigger, and being generous with it cost a real defect. The south
 *  and east edges reached to 33.700 and -118.120, which put the mouth of San
 *  Pedro Bay inside the box — so a ray from the Garden Grove counter measured a
 *  point two miles out in open water, was told it was land, and kept it. A
 *  vertex out there cannot be repaired by anything downstream: aroundTheWater
 *  bends edges *between* good vertices and has no answer for a bad one.
 *
 *  So the edges are drawn to the port rather than to the bay. Everything the
 *  box exists for is still inside it — Terminal Island, Pier 400, Piers G, J
 *  and T — and tests/coastline.test.ts holds it to that.
 *
 *  It only ever *adds* land. Nothing here can remove somewhere the rest of the
 *  file would have kept. */
const HARBOUR = { south: 33.715, north: 33.790, west: -118.300, east: -118.150 };

function inHarbour([lat, lng]: Point): boolean {
  return (
    lat >= HARBOUR.south && lat <= HARBOUR.north && lng >= HARBOUR.west && lng <= HARBOUR.east
  );
}

/** Even-odd ray test, the same rule the rest of the app draws with. */
function inRing(point: Point, ring: Point[]): boolean {
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

// Miles per degree, flat, at this latitude. The whole coast spans one degree of
// latitude and the question being asked is "is this a few hundred feet or a few
// miles from the shore", so the curvature of the earth is not what decides it.
const MILES_PER_DEGREE = 69.0;
const LNG_SCALE = Math.cos((33.8 * Math.PI) / 180);

/** Distance from a point to the nearest coastline segment, in miles.
 *
 *  Segments rather than vertices: the source has points a mile apart in places,
 *  and measuring to the nearest *vertex* of a mile-long straight run reports
 *  half a mile of error for a point sitting right on it. */
function milesFromShore(point: Point): number {
  const py = point[0] * MILES_PER_DEGREE;
  const px = point[1] * MILES_PER_DEGREE * LNG_SCALE;
  let best = Infinity;
  for (let i = 0; i < SHORE_POINTS - 1; i += 1) {
    const ay = PACIFIC[i][0] * MILES_PER_DEGREE;
    const ax = PACIFIC[i][1] * MILES_PER_DEGREE * LNG_SCALE;
    const by = PACIFIC[i + 1][0] * MILES_PER_DEGREE;
    const bx = PACIFIC[i + 1][1] * MILES_PER_DEGREE * LNG_SCALE;
    const dx = bx - ax;
    const dy = by - ay;
    const length = dx * dx + dy * dy;
    // How far along the segment the closest point is, clamped to its ends.
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
    const gap = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (gap < best) best = gap;
  }
  return best;
}

/** Whether a point is out in the Pacific.
 *
 *  ⚠️ Deliberately hard to say yes to. Three things all have to hold: the point
 *  is inside the ocean ring, it is more than SEA_MARGIN_MILES past the drawn
 *  shoreline, and it is not in the harbour. Every one of them is a chance to
 *  answer "no", because a wrong "no" shades a sliver of water and a wrong "yes"
 *  takes a real neighbourhood off the map. */
export function inThePacific(point: Point): boolean {
  return pastTheShoreline(point) && milesFromShore(point) > SEA_MARGIN_MILES;
}

/** The same question with the margin taken off: is this point on the sea side
 *  of the drawn shoreline at all?
 *
 *  ⚠️ Not for the app to use — inThePacific is the one that decides anything.
 *  This exists so tests/deliveryOcean.test.ts can build a simulated ocean that
 *  starts at the shoreline rather than at the margin. A stub that shared the
 *  margin would be handing the app its own answer, and the sliver of water the
 *  margin knowingly shades would be invisible instead of measured. */
export function pastTheShoreline(point: Point): boolean {
  if (inHarbour(point)) return false;
  return inRing(point, PACIFIC);
}

/** Test seam: the shoreline itself, without the corners out at sea. Nothing in
 *  the app reads this — tests/coastline.test.ts checks the data with it. */
export function shoreline(): Point[] {
  return PACIFIC.slice(0, SHORE_POINTS);
}

/** Test seam: how far a point is from the drawn shoreline, in miles.
 *
 *  ⚠️ Exported rather than reimplemented in the suite, because the suite got it
 *  wrong the obvious way first: measuring to the nearest *vertex* reported
 *  Bolsa Chica as three and a half miles from a coast it sits a couple of
 *  hundred yards from, because the two nearest vertices are the ends of one
 *  long straight run across Anaheim Bay. A number that far out would have made
 *  the margin below look like it needed to be miles wide. */
export function milesFromShoreline(point: Point): number {
  return milesFromShore(point);
}

/** Test seam: the whole ring, corners included, for the self-crossing check. */
export function pacificRing(): Point[] {
  return PACIFIC.slice();
}
