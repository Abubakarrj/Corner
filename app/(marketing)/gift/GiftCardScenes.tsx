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
      <path d={scallopPath(12, 10, 111, 80, 4.4)} fill={panel} />

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
export function ShopScene({ palette }: { palette: Palette }) {
  const { ground, panel, ink, accent, accentSoft, crust, seed } = palette;
  return (
    <svg
      className="h-full w-full"
      viewBox={`0 0 ${CARD.w} ${CARD.h}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <rect width={CARD.w} height={CARD.h} fill={ground} />

      {/* Weather. Small, irregular, and behind everything. */}
      {Array.from({ length: 26 }, (_, index) => (
        <circle
          key={index}
          cx={((index * 37) % 131) + 2}
          cy={((index * 53) % 46) + 4}
          r={index % 3 === 0 ? 1.5 : 1}
          fill={panel}
          opacity={0.75}
        />
      ))}

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
