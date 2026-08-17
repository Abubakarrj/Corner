"use client";

// The illustrated card faces.
//
// ——— Drawn, like the patterned ones, and for a stronger reason ———
//
// The flat ones could have been images. These could not, or not without
// giving something up that matters more than the convenience: the word on a
// card is a string key, so one design renders in ten languages. A raster
// illustration with "HAPPY HOLIDAYS" baked into it is ten files, redrawn by
// somebody every time a word changes, and in practice it becomes one file in
// English and a quiet decision that the other nine languages get English.
//
// So the lettering is real text over drawn art, and everything under it is
// paths. It also stays sharp on a card rail at any width, weighs a couple of
// kilobytes, and recolours from a palette object instead of a re-export.
//
// ——— The visual language ———
//
// Flat vector, no gradients, no strokes doing the work of shapes, and a small
// number of saturated colours per card. Symmetry does most of the composing:
// a centred motif, a repeated border, foliage mirrored either side. That is
// the grammar of the folk-art gift cards this was drawn against, and it is
// forgiving in the way hand-drawn detail is not — a rosette repeated eight
// times around a card reads as decoration whether or not any one of them is
// a good rosette.
//
// ⚠️ Nothing here is traced from another shop's card. The references were
// other retailers' seasonal artwork, and their compositions and marks are
// theirs; what is shared is a style, which is not ownable and is the ordinary
// way design references work. Every path below is this shop's own — bagels,
// its storefront, its awning stripes.

export type Palette = {
  /** The card behind everything. */
  ground: string;
  /** The framed panel, where a design has one. */
  panel: string;
  /** Lettering and the darkest shapes. */
  ink: string;
  /** The two decorative colours, used in that order of prominence. */
  accent: string;
  accentSoft: string;
  /** Bagel crust and its seeds. */
  crust: string;
  seed: string;
};

const CARD = { w: 135, h: 100 };

// The two colours that are not the palette's to choose. A bagel's crust is
// already outside it, for the same reason: some things in these pictures are
// the thing itself rather than a decorative surface, and a palette that gets a
// vote on them produces a green bagel.
const COFFEE = "#4A2E23";
const CREMA = "#C8A27A";

/** A bagel, seeded, at any size. The one motif this shop has that nobody else
 *  does, so it is in all three scenes rather than a generic ornament. */
function Bagel({
  x,
  y,
  r,
  crust,
  seed,
  hole,
}: {
  x: number;
  y: number;
  r: number;
  crust: string;
  seed: string;
  hole: string;
}) {
  // Seeds on a ring rather than scattered: at this size a random scatter reads
  // as noise, and a ring reads as a bagel.
  const seeds = Array.from({ length: 10 }, (_, index) => {
    const angle = (index / 10) * Math.PI * 2 + 0.3;
    return { cx: x + Math.cos(angle) * r * 0.72, cy: y + Math.sin(angle) * r * 0.72 };
  });
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={crust} />
      {seeds.map((point, index) => (
        <ellipse
          key={index}
          cx={point.cx}
          cy={point.cy}
          rx={r * 0.1}
          ry={r * 0.062}
          fill={seed}
          transform={`rotate(${index * 36} ${point.cx} ${point.cy})`}
        />
      ))}
      <circle cx={x} cy={y} r={r * 0.3} fill={hole} />
    </g>
  );
}

/** A six-petal rosette. The workhorse of the folk borders. */
function Rosette({
  x,
  y,
  r,
  petal,
  heart,
}: {
  x: number;
  y: number;
  r: number;
  petal: string;
  heart: string;
}) {
  return (
    <g>
      {Array.from({ length: 6 }, (_, index) => (
        <ellipse
          key={index}
          cx={x}
          cy={y - r * 0.58}
          rx={r * 0.3}
          ry={r * 0.55}
          fill={petal}
          transform={`rotate(${index * 60} ${x} ${y})`}
        />
      ))}
      <circle cx={x} cy={y} r={r * 0.3} fill={heart} />
    </g>
  );
}

/** A leaf on a stem, pointing along `angle`. */
function Sprig({
  x,
  y,
  length,
  angle,
  fill,
}: {
  x: number;
  y: number;
  length: number;
  angle: number;
  fill: string;
}) {
  const w = length * 0.34;
  return (
    <g transform={`rotate(${angle} ${x} ${y})`}>
      <path
        d={`M ${x} ${y} C ${x + w} ${y - length * 0.35} ${x + w} ${y - length * 0.7} ${x} ${y - length}
            C ${x - w} ${y - length * 0.7} ${x - w} ${y - length * 0.35} ${x} ${y} Z`}
        fill={fill}
      />
    </g>
  );
}

// ——— Papel picado ———
//
// The scalloped panel, cut like paper, with the pair of bagels facing a heart
// in the middle. The scallops are generated rather than drawn: a run of arcs
// along each edge, which is one expression instead of eighty coordinates and
// stays even when the panel changes size.
function scallopPath(x: number, y: number, w: number, h: number, r: number): string {
  const along = (length: number) => Math.max(2, Math.round(length / (r * 2)));
  const across = along(w);
  const down = along(h);
  const stepX = w / across;
  const stepY = h / down;
  const arc = (dx: number, dy: number) =>
    `a ${Math.abs(dx || dy) / 2} ${Math.abs(dx || dy) / 2} 0 0 1 ${dx} ${dy}`;
  return [
    `M ${x} ${y}`,
    ...Array.from({ length: across }, () => arc(stepX, 0)),
    ...Array.from({ length: down }, () => arc(0, stepY)),
    ...Array.from({ length: across }, () => arc(-stepX, 0)),
    ...Array.from({ length: down }, () => arc(0, -stepY)),
    "Z",
  ].join(" ");
}

// ——— The label plate, for the cards whose face is a pattern ———
//
// Six designs predate the illustrated ones and they were patterns and nothing
// else: gingham, a checkerboard, a tile of bagels, a flat ground. Whatever text
// they carried floated loose on the wallpaper with nothing holding it, and
// beside a drawn card they read as the placeholders they originally were.
//
// The fix is not to redraw them as scenes. A flat pattern is a real style and
// the rail is better for having some, and a set where every card is an
// illustration has no quiet ones in it. What the patterns were missing is the
// thing the papel card already had: a piece of paper laid on top, with the
// message on the paper. That is how a printed card is actually made, it gives
// the type something to sit on, and it borrows the folk grammar — the corner
// rosettes, the bagel — from the drawings, so the two halves of the set stop
// looking like two products.
//
// It also fixes something the flat cards got wrong for free. Their lettering
// used to sit on the pattern itself, which on gingham means it crosses a light
// square and a dark one and is fighting both. On the plate there is one colour
// behind it.
export function Plate({
  fill,
  mark,
  crust,
  seed,
  medallion,
}: {
  /** The paper. */
  fill: string;
  /** The rosettes and the sprigs — the pattern's own colour, so the plate
   *  belongs to the card rather than being a white box dropped on it. */
  mark: string;
  crust: string;
  seed: string;
  /** Whether to draw the bagel and its sprigs in the middle. On a card with a
   *  greeting the greeting goes there instead, and both would be a fight. */
  medallion: boolean;
}) {
  const corners: [number, number][] = [
    [19, 18],
    [116, 18],
    [19, 74],
    [116, 74],
  ];
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${CARD.w} ${CARD.h}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {/* Square-cornered rather than scalloped, deliberately. The papel card is
          the scalloped one; if these were too, the set would have seven cards
          with the same silhouette.

          Inset eleven units, not four. At four the plate covered the card and
          the pattern survived only as a hairline round the edge — which loses
          the thing that makes a gingham card a gingham card. The border has to
          be wide enough to show the pattern repeating, or it reads as a fault
          in the printing rather than as a border. */}
      <rect x={11} y={10} width={113} height={80} rx={3} fill={fill} />
      <rect
        x={15}
        y={14}
        width={105}
        height={64}
        rx={2}
        fill="none"
        stroke={mark}
        strokeWidth={0.7}
        opacity={0.35}
      />
      {corners.map(([x, y]) => (
        <Rosette key={`${x}-${y}`} x={x} y={y} r={4.2} petal={mark} heart={fill} />
      ))}
      {medallion ? (
        // The sprigs tuck behind the bagel rather than standing off it. Placed
        // clear of it they were two leaves adrift on an empty plate, which is
        // what a motif looks like when its parts are not touching. Angled down
        // and out they hung below it instead and the whole thing read as a
        // rocket with fins. Up and out is right, but they have to be long
        // enough that a leaf clears the bagel rather than a crescent of one:
        // at eighteen units the visible part was a nub either side and the
        // emblem had ears.
        <g>
          <Sprig x={63} y={52} length={27} angle={-44} fill={mark} />
          <Sprig x={72} y={52} length={27} angle={44} fill={mark} />
          <Bagel x={67.5} y={44} r={15} crust={crust} seed={seed} hole={fill} />
        </g>
      ) : null}
    </svg>
  );
}

export function PapelScene({ palette }: { palette: Palette }) {
  const { ground, panel, ink, accent, accentSoft, crust, seed } = palette;
  const corners = [
    { x: 22, y: 26 },
    { x: 113, y: 26 },
    { x: 22, y: 74 },
    { x: 113, y: 74 },
  ];
  return (
    <svg
      className="h-full w-full"
      viewBox={`0 0 ${CARD.w} ${CARD.h}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <rect width={CARD.w} height={CARD.h} fill={ground} />
      {/* The paper stops short of the foot of the card. It used to run to
          within four units of it, and the scalloped bottom edge ran straight
          through the "Corner Bagel / GIFT CARD" strip that every card carries —
          which cannot be seen from inside this SVG, because that strip is HTML
          laid over it. Ending the paper at 84 leaves the strip a clean band of
          ground colour to sit on. */}
      <path d={scallopPath(12, 8, 111, 76, 4.4)} fill={panel} />

      <g transform="translate(0 -3)">
        {/* Foliage, mirrored. Two sprigs and a rosette in each corner is enough
            to read as a border without any of it being looked at closely. */}
        {corners.map((corner, index) => (
          <g key={index}>
            <Sprig x={corner.x} y={corner.y} length={13} angle={index % 2 ? 38 : -38} fill={accent} />
            <Sprig x={corner.x} y={corner.y} length={10} angle={index % 2 ? -18 : 18} fill={accentSoft} />
            <Rosette x={corner.x} y={corner.y} r={5.2} petal={accentSoft} heart={ink} />
          </g>
        ))}

        {/* The centre: a heart between two bagels, which is the whole joke — the
            shop's own object standing in for the two figures the reference had. */}
        <path
          d="M 67.5 62 C 60 55 55 51 55 46.5 C 55 43 57.6 41 60.4 41 C 62.7 41 65 42.4 67.5 45.6
             C 70 42.4 72.3 41 74.6 41 C 77.4 41 80 43 80 46.5 C 80 51 75 55 67.5 62 Z"
          fill={accent}
        />
        <Bagel x={47} y={52} r={11} crust={crust} seed={seed} hole={panel} />
        <Bagel x={88} y={52} r={11} crust={crust} seed={seed} hole={panel} />

        {/* Drops, the papel-picado punch marks, in the gaps between the corner
            sprigs rather than on top of them: at 22 and 113 they were landing
            inside a rosette, which read as a smudge rather than as a cut. */}
        {[45, 67.5, 90].map((x) => (
          <path key={x} d={`M ${x} 74 l 2.2 3.9 a 2.5 2.5 0 1 1 -4.4 0 Z`} fill={accentSoft} />
        ))}
        {[45, 67.5, 90].map((x) => (
          <circle key={x} cx={x} cy={26} r={1.9} fill={accent} />
        ))}
      </g>
    </svg>
  );
}

// ——— The delivery ———
//
// A car carrying a bagel far too large for it, past a row of houses. The one
// card that is about the shop doing something rather than about an occasion,
// which is what makes it the right face for "this one is on me".
export function DeliveryScene({ palette }: { palette: Palette }) {
  const { ground, panel, ink, accent, accentSoft, crust, seed } = palette;
  const houses = [
    { x: 14, w: 20, h: 26, fill: accentSoft, roof: accent },
    { x: 38, w: 16, h: 33, fill: accent, roof: ink },
    { x: 58, w: 23, h: 22, fill: panel, roof: accentSoft },
    { x: 85, w: 18, h: 30, fill: accentSoft, roof: ink },
    { x: 107, w: 20, h: 25, fill: accent, roof: accentSoft },
  ];
  return (
    <svg
      className="h-full w-full"
      viewBox={`0 0 ${CARD.w} ${CARD.h}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <rect width={CARD.w} height={CARD.h} fill={ground} />

      {/* The street behind. Roofs are triangles and windows are one rect each:
          detail here would compete with the bagel, which is the subject. */}
      {houses.map((house) => {
        const top = 62 - house.h;
        return (
          <g key={house.x}>
            <path
              d={`M ${house.x - 2.5} ${top} L ${house.x + house.w / 2} ${top - 8} L ${house.x + house.w + 2.5} ${top} Z`}
              fill={house.roof}
            />
            <rect x={house.x} y={top} width={house.w} height={house.h} fill={house.fill} />
            <rect
              x={house.x + house.w / 2 - 3}
              y={top + 6}
              width={6}
              height={7}
              rx={1}
              fill={ground}
              opacity={0.65}
            />
          </g>
        );
      })}

      {/* The road, and the hedge in front of it. */}
      <rect x={0} y={62} width={CARD.w} height={16} fill={ink} opacity={0.16} />
      <rect x={0} y={78} width={CARD.w} height={22} fill={accentSoft} />
      {Array.from({ length: 9 }, (_, index) => (
        <circle key={index} cx={index * 17 + 4} cy={78} r={7.5} fill={accentSoft} />
      ))}

      {/* The car. A rounded body, a cabin, two wheels — read as a car at
          thumbnail size, which is the only size that matters here. */}
      <g>
        <path
          d="M 34 68 C 34 62 38 59 44 58.6 L 52 52.6 C 54 51.2 56 50.6 58.6 50.6 L 78 50.6
             C 82 50.6 85 51.8 87.6 54.2 L 93 58.8 C 99 59.4 102 62 102 68 L 102 70
             C 102 71.4 101 72.4 99.6 72.4 L 36.4 72.4 C 35 72.4 34 71.4 34 70 Z"
          fill={accent}
        />
        <path
          d="M 56 53.6 L 67 53.6 L 67 58.6 L 50.4 58.6 Z M 70 53.6 L 78 53.6
             C 80.6 53.6 82.4 54.2 84 55.6 L 87.4 58.6 L 70 58.6 Z"
          fill={ground}
          opacity={0.8}
        />
        <circle cx={48} cy={72.4} r={6.4} fill={ink} />
        <circle cx={48} cy={72.4} r={2.6} fill={ground} />
        <circle cx={89} cy={72.4} r={6.4} fill={ink} />
        <circle cx={89} cy={72.4} r={2.6} fill={ground} />
      </g>

      {/* Strapped to the roof, and deliberately absurd about it. */}
      <rect x={64} y={33} width={4} height={20} rx={1.6} fill={ink} opacity={0.35} />
      <Bagel x={67.5} y={33} r={17} crust={crust} seed={seed} hole={ground} />
    </svg>
  );
}

// ——— The shopfront ———
//
// The counter itself, under whatever weather the palette says. The awning
// stripes and the hanging sign are the two things that make a rectangle read
// as a shop, so both are drawn and nothing else is.
export function ShopScene({ palette, snow = true }: { palette: Palette; snow?: boolean }) {
  const { ground, panel, ink, accent, accentSoft, crust, seed } = palette;
  return (
    <svg
      className="h-full w-full"
      viewBox={`0 0 ${CARD.w} ${CARD.h}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <rect width={CARD.w} height={CARD.h} fill={ground} />

      {/* Weather, and the one thing in these scenes a palette cannot decide.
          A colourway can make a sky blue, and pale flecks in a blue sky are
          still snow — so the second shop card, the one on a summer morning,
          turns them off rather than recolouring them into something they are
          not. The drift along the foot stays either way: under snow it is a
          bank, under a clear sky it is the pavement. */}
      {snow
        ? Array.from({ length: 26 }, (_, index) => (
            <circle
              key={index}
              cx={((index * 37) % 131) + 2}
              cy={((index * 53) % 46) + 4}
              r={index % 3 === 0 ? 1.5 : 1}
              fill={panel}
              opacity={0.75}
            />
          ))
        : null}

      {/* The building. */}
      <rect x={22} y={34} width={91} height={50} fill={panel} />
      <rect x={22} y={30} width={91} height={5} fill={ink} />

      {/* Awning, striped by repetition rather than by eight hand-placed rects.
          The pale stripe is the panel and not the ground: on the winter
          palette the ground is a night green, which made the awning read as
          green-on-red rather than as an awning. */}
      <g>
        <path d="M 18 47 L 117 47 L 112 59 L 23 59 Z" fill={accent} />
        {Array.from({ length: 6 }, (_, index) => (
          <path
            key={index}
            d={`M ${25 + index * 16.4} 47 L ${33 + index * 16.4} 47 L ${30 + index * 16.4} 59 L ${22 + index * 16.4} 59 Z`}
            fill={panel}
          />
        ))}
      </g>

      {/* Window and door. The window is the crust colour because that is the
          one warm tone in every palette, and a shopfront at dusk in the snow
          is only worth drawing if the light is on inside it. */}
      <rect x={30} y={63} width={44} height={21} rx={1.5} fill={crust} />
      <rect x={51} y={63} width={2} height={21} fill={panel} opacity={0.75} />
      <rect x={30} y={63} width={44} height={4} fill={ink} opacity={0.12} />
      <rect x={84} y={61} width={20} height={23} rx={1.5} fill={accentSoft} />
      <circle cx={100} cy={73} r={1.4} fill={panel} />

      {/* The sign. It hung off a bracket for a moment, and the bracket ran
          straight through the lettering — which cannot be seen from inside the
          SVG, because the word is HTML laid over it and moves with the
          language. Anything reaching into the top of this frame will collide
          with a long word in some language, so nothing does. The bagel sitting
          on the facade reads as a sign without one. */}
      <Bagel x={66.2} y={26} r={12} crust={crust} seed={seed} hole={ground} />

      {/* Snow. The panel colour, like the flakes above it — it was the soft
          accent, which on the winter palette is a green, so the shop stood in
          a hill rather than in snow. */}
      <path
        d={`M 0 88 C 20 83 34 90 52 87 C 72 83.6 88 90.4 106 87.4 C 118 85.4 128 87 135 85.6
            L 135 100 L 0 100 Z`}
        fill={panel}
      />
    </svg>
  );
}

// ——— The table ———
//
// Breakfast from above: a plate, a bagel halved and spread, a coffee beside
// it. The only card that shows what is actually being given, which is why it
// needs no greeting written across it — a plate of food is already the
// sentence.
export function TableScene({ palette }: { palette: Palette }) {
  const { ground, panel, ink, accentSoft, crust, seed } = palette;
  // ——— Two halves, apart and off the level ———
  //
  // They were drawn wide and side by side on the same line, and the crust rings
  // overlapped: two rings of one size, level with each other, is a pair of
  // spectacles, and nothing about the colour fixes that. Pulling them apart
  // helped and was not enough — level and symmetric still reads as a pair of
  // lenses. So one sits high and one low, which is how two halves land when
  // somebody puts them down, and the shape stops being a face.
  const half = (cx: number, cy: number, flip: number) => (
    <g key={cx}>
      {/* Cut side up: the crust ring, then the spread, then the crumb. */}
      <circle cx={cx} cy={cy} r={10.5} fill={crust} />
      <circle cx={cx} cy={cy} r={8} fill={panel} />
      <circle cx={cx} cy={cy} r={2.4} fill={crust} />
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2 + flip;
        return (
          <ellipse
            key={index}
            cx={cx + Math.cos(angle) * 9.3}
            cy={cy + Math.sin(angle) * 9.3}
            rx={1.2}
            ry={0.8}
            fill={seed}
            transform={`rotate(${(index * 45 + flip * 30).toFixed(1)} ${cx + Math.cos(angle) * 9.3} ${cy + Math.sin(angle) * 9.3})`}
          />
        );
      })}
    </g>
  );
  return (
    <svg
      className="h-full w-full"
      viewBox={`0 0 ${CARD.w} ${CARD.h}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <rect width={CARD.w} height={CARD.h} fill={ground} />

      {/* The napkin, under everything, turned off square so the composition
          has one line that is not horizontal.

          It is wider than the plate on purpose. Drawn the same size, the plate
          covered it and only two green corners showed, which reads as a mistake
          rather than as a cloth. */}
      <rect
        x={12}
        y={24}
        width={80}
        height={58}
        rx={2}
        fill={accentSoft}
        transform="rotate(-7 52 53)"
      />
      <rect
        x={17}
        y={29}
        width={70}
        height={48}
        rx={1}
        fill="none"
        stroke={panel}
        strokeWidth={0.9}
        opacity={0.5}
        transform="rotate(-7 52 53)"
      />

      {/* The plate. Smaller than it was: at r=31 it stood on the napkin the way
          a lid stands on a jar, and the card was a plate rather than a table. */}
      <circle cx={50} cy={52} r={25} fill={panel} />
      <circle cx={50} cy={52} r={25} fill="none" stroke={ink} strokeWidth={0.8} opacity={0.14} />
      {half(38, 47, 0.4)}
      {half(63, 56, 0.9)}

      {/* Coffee, from directly above: the cup, the crema, the handle.
          Its own browns rather than the palette's ink and accent. Coffee is
          brown in every colourway the same way the crust is: mixed from the
          palette it came out beetroot on the rose card and slate on the dark
          one, and a cup of something that is not coffee beside a bagel is a
          picture of a different breakfast. */}
      <g>
        <path
          d="M 112 46 a 8 8 0 1 1 0 16 a 6 6 0 1 0 0 -16 Z"
          fill={panel}
        />
        <circle cx={104} cy={54} r={13} fill={panel} />
        <circle cx={104} cy={54} r={10.2} fill={COFFEE} />
        <ellipse cx={100.6} cy={50.6} rx={3} ry={2} fill={CREMA} opacity={0.5} />
      </g>

      {/* A knife, and crumbs where a knife has been. */}
      <g transform="rotate(9 96 84)">
        <rect x={78} y={82} width={26} height={3} rx={1.5} fill={ink} opacity={0.55} />
        <rect x={104} y={80.6} width={17} height={5.8} rx={2.6} fill={panel} />
      </g>
      {[
        [30, 86],
        [37, 90],
        [46, 85],
        [62, 88],
        [70, 84],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={1.1} fill={crust} />
      ))}
    </svg>
  );
}

// ——— The skyline ———
//
// Where the shop is, rather than what it sells. Palms, a low sun and the
// downtown ridge behind Koreatown — the view along Wilshire at the hour the
// shop is either opening or shutting, depending on the palette.
export function SkylineScene({ palette }: { palette: Palette }) {
  const { ground, panel, ink, accent, accentSoft, crust, seed } = palette;
  const towers = [
    { x: 6, w: 13, h: 26 },
    { x: 21, w: 9, h: 38 },
    { x: 32, w: 15, h: 20 },
    { x: 88, w: 11, h: 33 },
    { x: 101, w: 16, h: 24 },
    { x: 119, w: 10, h: 30 },
  ];
  const palm = (x: number, height: number, lean: number) => (
    <g key={x} transform={`rotate(${lean} ${x} 78)`}>
      <path
        d={`M ${x - 1.6} 78 C ${x - 0.6} ${78 - height * 0.55} ${x + 0.4} ${78 - height * 0.8} ${x + 1.4} ${78 - height}
            L ${x + 3.4} ${78 - height} C ${x + 2.4} ${78 - height * 0.78} ${x + 1.6} ${78 - height * 0.5} ${x + 1.4} 78 Z`}
        fill={ink}
      />
      {[-64, -30, 0, 30, 64].map((angle) => (
        <ellipse
          key={angle}
          cx={x + 2.4}
          cy={78 - height - 3.6}
          rx={3}
          ry={7.6}
          fill={accentSoft}
          transform={`rotate(${angle} ${x + 2.4} ${78 - height})`}
        />
      ))}
      <circle cx={x + 2.4} cy={78 - height} r={1.7} fill={ink} />
    </g>
  );
  return (
    <svg
      className="h-full w-full"
      viewBox={`0 0 ${CARD.w} ${CARD.h}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <rect width={CARD.w} height={CARD.h} fill={ground} />

      {/* The sun, which is also a bagel, and is not remarked upon. */}
      <Bagel x={67.5} y={44} r={22} crust={crust} seed={seed} hole={ground} />

      {/* Bands of sky under it, the way a flat sunset is drawn: three steps,
          not a gradient. */}
      <rect x={0} y={66} width={CARD.w} height={4} fill={accent} opacity={0.28} />
      <rect x={0} y={70} width={CARD.w} height={4} fill={accent} opacity={0.44} />

      {towers.map((tower) => (
        <g key={tower.x}>
          <rect x={tower.x} y={78 - tower.h} width={tower.w} height={tower.h} fill={ink} />
          {Array.from({ length: Math.max(2, Math.floor(tower.h / 9)) }, (_, row) => (
            <rect
              key={row}
              x={tower.x + 2}
              y={78 - tower.h + 4 + row * 8}
              width={tower.w - 4}
              height={2.6}
              fill={crust}
              opacity={0.5}
            />
          ))}
        </g>
      ))}

      {palm(50, 40, -5)}
      {palm(84, 32, 6)}

      <rect x={0} y={78} width={CARD.w} height={22} fill={panel} />
      <rect x={0} y={78} width={CARD.w} height={2.4} fill={ink} opacity={0.18} />
      {Array.from({ length: 7 }, (_, index) => (
        <rect key={index} x={index * 20 + 5} y={88} width={11} height={1.8} rx={0.9} fill={ink} opacity={0.22} />
      ))}
    </svg>
  );
}

// ——— The wreath ———
//
// A ring of leaves, flowers and bagels around nothing in particular. The most
// occasion-neutral of the set on purpose: it is the card to send when there is
// no occasion, which is most of the time somebody sends one.
export function WreathScene({ palette }: { palette: Palette }) {
  const { ground, ink, accent, accentSoft, crust, seed } = palette;
  const cx = 67.5;
  const cy = 50;
  const ring = 30;

  // ——— Foliage in one colour, ornaments in the other ———
  //
  // The leaves alternated between the two accents and the rosettes were drawn
  // in the first of them, so a rosette that landed on a leaf of its own colour
  // fused into a single blob — an orange cap with a dark dot in it, which is a
  // mushroom. The instinct was to move things apart, and cutting a hole in the
  // ring for every ornament left eight clumps of foliage rather than a wreath.
  //
  // The overlap was never the problem. Things overlapping is what a wreath is;
  // the problem was two of them being the same colour. So the foliage is all
  // one green and every ornament is the other accent, and a flower sitting in
  // the leaves reads as a flower sitting in the leaves.
  const bagels = [45, 135, 225, 315];
  const rosettes = [0, 90, 180, 270];

  // The polar-to-card conversion, once. Twelve o'clock is up.
  const at = (angle: number, radius: number) => {
    const radians = (angle * Math.PI) / 180;
    return { x: cx + Math.sin(radians) * radius, y: cy - Math.cos(radians) * radius };
  };

  return (
    <svg
      className="h-full w-full"
      viewBox={`0 0 ${CARD.w} ${CARD.h}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {/* No panel disc behind the ring. There was one, at r=39, and it filled
          the card edge to edge — so the card read as a decorated plate, which
          is the other card in this set. A wreath is a ring on the ground it
          hangs against, and nothing else. */}
      <rect width={CARD.w} height={CARD.h} fill={ground} />

      {/* Leaves the whole way round, unbroken. One shape rotated, which is what
          makes a wreath a wreath rather than thirty-six decisions. The tilt
          alternates so the ring does not read as a cog. */}
      {/* Twenty-four, not thirty-six. At thirty-six the leaves were spaced 5.2
          units apart and each one was 7.6 across, so every leaf was inside its
          neighbours and the ring came out as a single wavy rope. Twenty-four
          spaces them at 7.9, which is a hair wider than one leaf: they touch,
          which is what foliage does, and each one still has an edge. */}
      {Array.from({ length: 24 }, (_, index) => (
        <g key={index} transform={`rotate(${(index / 24) * 360} ${cx} ${cy})`}>
          <ellipse
            cx={cx}
            cy={cy - ring}
            rx={2.6}
            ry={6.5}
            fill={accentSoft}
            transform={`rotate(${index % 2 ? 28 : -28} ${cx} ${cy - ring})`}
          />
        </g>
      ))}

      {bagels.map((angle) => {
        const point = at(angle, ring);
        return (
          <Bagel
            key={angle}
            x={point.x}
            y={point.y}
            r={7.2}
            crust={crust}
            seed={seed}
            hole={ground}
          />
        );
      })}
      {rosettes.map((angle) => {
        const point = at(angle, ring);
        return (
          <Rosette key={angle} x={point.x} y={point.y} r={5} petal={accent} heart={ink} />
        );
      })}

      {/* The middle stays empty. A wreath with something in it is a badge, and
          empty is also what leaves room for whatever somebody writes in the
          message field — this is the card that carries no word of its own. */}
    </svg>
  );
}
