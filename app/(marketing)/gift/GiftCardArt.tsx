"use client";

import { useT, type StringKey } from "../../i18n";
import { CREAM, CRUST, SESAME, type Art } from "./giftCards";
import {
  DeliveryScene,
  PapelScene,
  Plate,
  ShopScene,
  SkylineScene,
  TableScene,
  WreathScene,
  type Palette,
} from "./GiftCardScenes";

// ——— One shape for nineteen cards ———
//
// There used to be two layouts. An illustrated card put its wordmark on a small
// strip along the foot; a patterned card put a big centred "Corner Bagel" and
// badge in the middle of the wallpaper, because on a bare pattern there was
// nothing else to look at and it had to be the subject. Side by side in the
// rail those read as two products.
//
// Now every card is the same three things: something drawn, a greeting where
// there is one, and the shop's name along the foot. The patterns got a plate to
// put the first two on — see Plate in GiftCardScenes.tsx — so the centred
// version has nothing left to do.

// Woven gingham: two translucent bands crossed, so the overlap darkens on its
// own the way real gingham does, instead of three hand-picked tints that
// would drift apart when the colour changes.
function Gingham({ ink, ground }: { ink: string; ground: string }) {
  // Sized in pixels rather than percentages. A percentage is of the element,
  // and the card is 1.35 times wider than it is tall, so 12.5% each way drew a
  // check half again as wide as it was high — gingham that has been stretched,
  // which is a thing the eye catches without being able to name.
  //
  // Smaller too. The check used to be an eighth of the card and the plate now
  // covers the middle, so at that size the border showed two thirds of one
  // square and read as a stripe. A pattern has to repeat inside its border to
  // be a pattern.
  const band = `repeating-linear-gradient(to right, ${ink}59 0 50%, transparent 50% 100%)`;
  const bandDown = `repeating-linear-gradient(to bottom, ${ink}59 0 50%, transparent 50% 100%)`;
  const tile = { backgroundSize: "26px 26px" };
  return (
    <div className="absolute inset-0" style={{ backgroundColor: ground }}>
      <div className="absolute inset-0" style={{ backgroundImage: band, ...tile }} />
      <div className="absolute inset-0" style={{ backgroundImage: bandDown, ...tile }} />
    </div>
  );
}

// A field of bagels — the one motif this shop has that nobody else does.
function Bagels({ ink, ground }: { ink: string; ground: string }) {
  return (
    <div className="absolute inset-0" style={{ backgroundColor: ground }}>
      {/* One bagel per tile, small enough that the face reads as a patterned
          ground rather than a handful of rings. The tile is square while the
          card is not, so the viewBox carries the card's own 1.35 ratio and
          `slice` never has to stretch it.
          ——— Why the ring is filled now ———
          It was two concentric hairline circles, and two concentric circles are
          a target, not a bagel. Nothing in the drawing said bread. A filled
          annulus with seeds on it is the same shape the illustrated cards use
          and reads at a fifth of the size, which is the only test a pattern
          tile has to pass. */}
      <svg
        className="h-full w-full"
        viewBox="0 0 135 100"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <pattern id="bagel-tile" width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="6" cy="6" r="3.9" fill={ink} opacity="0.34" />
            <circle cx="6" cy="6" r="1.35" fill={ground} />
            {Array.from({ length: 6 }, (_, index) => {
              const angle = (index / 6) * Math.PI * 2 + 0.4;
              const cx = 6 + Math.cos(angle) * 2.7;
              const cy = 6 + Math.sin(angle) * 2.7;
              return (
                <ellipse
                  key={index}
                  cx={cx}
                  cy={cy}
                  rx={0.6}
                  ry={0.36}
                  fill={ground}
                  opacity="0.75"
                  transform={`rotate(${index * 60} ${cx} ${cy})`}
                />
              );
            })}
          </pattern>
        </defs>
        <rect width="135" height="100" fill="url(#bagel-tile)" />
      </svg>
    </div>
  );
}

// Checkerboard, as in the reference's "THANK YOU" card.
function Checker({ ground }: { ground: string }) {
  const squares = `repeating-conic-gradient(${ground} 0% 25%, transparent 0% 50%)`;
  return (
    // The literal, not var(--cb-cream). The squares this shows between are
    // the card's own paper — in dark mode the token turned them near-black
    // and the design came apart. See the note in giftCards.ts.
    <div className="absolute inset-0" style={{ backgroundColor: CREAM }}>
      <div
        className="absolute inset-0"
        style={{ backgroundImage: squares, backgroundSize: "26px 26px" }}
      />
    </div>
  );
}

/** The greeting on a flat card, set on the plate.
 *
 *  Smaller than it was, and that is the point rather than a compromise. It used
 *  to run the full width of the card because there was nothing else on the card
 *  to be in proportion to; inside a frame it has a size to be, and type that
 *  fills its frame instead of its page is what the difference between a card
 *  and a banner looks like.
 *
 *  The box stops short of the foot so the word centres in the space above the
 *  wordmark strip rather than in the plate, which would have set it a couple of
 *  units low every time. */
function PlateWord({ word, ink }: { word: StringKey; ink: string }) {
  const t = useT();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[24%] top-[10%] flex items-center justify-center px-10">
      <span
        className="text-balance text-center text-[24px] font-bold uppercase leading-[0.94] tracking-[-0.02em] sm:text-[29px]"
        style={{ color: ink }}
      >
        {t(word)}
      </span>
    </div>
  );
}

// An illustrated face: the drawing, then the message over it as real text.
//
// The lettering is not in the SVG on purpose. It is a string key, so it is
// eight different lengths in ten languages, and a <text> element would need a
// font size per language or it would run off the card. Laid out as HTML it
// wraps, balances and shrinks like every other piece of copy in the app.
const SCENES = {
  papel: PapelScene,
  delivery: DeliveryScene,
  shop: ShopScene,
  // The same drawing with its weather off. A separate name rather than a
  // separate prop on the card, so every entry in this map is still a component
  // that takes a palette and nothing else, and giftCards.ts still picks a
  // picture by naming one.
  shopClear: (props: { palette: Palette }) => <ShopScene {...props} snow={false} />,
  table: TableScene,
  skyline: SkylineScene,
  wreath: WreathScene,
} as const;

export type SceneName = keyof typeof SCENES;

function Scene({
  scene,
  palette,
  word,
  ink,
  wordAt,
}: {
  scene: SceneName;
  palette: Palette;
  word?: StringKey;
  ink: string;
  wordAt?: "top" | "middle";
}) {
  const t = useT();
  const Drawing = SCENES[scene];
  return (
    <div className="absolute inset-0">
      <Drawing palette={palette} />
      {word ? (
        <div
          className={
            "pointer-events-none absolute inset-x-0 flex justify-center px-5 " +
            (wordAt === "middle" ? "inset-y-0 items-center" : "top-[7%]")
          }
        >
          <span
            className="text-balance text-center text-[15px] font-bold uppercase leading-[0.98] tracking-[-0.01em] sm:text-[18px]"
            style={{ color: ink }}
          >
            {t(word)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export default function GiftCardArt({ art }: { art: Art }) {
  const t = useT();
  const flat = art.kind !== "scene";
  // What the foot of the card is written in. It differs from the greeting's
  // colour only on the scenes whose bottom is a different colour from the rest
  // of them — the shop stands in snow, the skyline ends in a road.
  const foot = (art.kind === "scene" ? art.footInk : undefined) ?? art.ink;

  return (
    <div className="absolute inset-0">
      {art.kind === "gingham" ? <Gingham ink={art.ink} ground={art.ground} /> : null}
      {art.kind === "bagels" ? <Bagels ink={art.ink} ground={art.ground} /> : null}
      {art.kind === "checker" ? <Checker ground={art.ground} /> : null}
      {art.kind === "wordmark" ? (
        <div className="absolute inset-0" style={{ backgroundColor: art.ground }} />
      ) : null}
      {art.kind === "scene" ? (
        <Scene
          scene={art.scene}
          palette={art.palette}
          word={art.word}
          ink={art.ink}
          wordAt={art.wordAt}
        />
      ) : null}

      {flat ? (
        <>
          <Plate
            fill={art.plate}
            mark={art.ink}
            crust={CRUST}
            seed={SESAME}
            // The bagel and its sprigs are what a card with no greeting has
            // instead of one. On a card that does have a greeting they would be
            // underneath it, which is two things wanting the same middle.
            medallion={art.kind === "gingham" || art.kind === "bagels"}
          />
          {art.kind === "checker" || art.kind === "wordmark" ? (
            <PlateWord word={art.word} ink={art.ink} />
          ) : null}
        </>
      ) : null}

      {/* The shop's name, along the foot. On a drawing it sits on the picture;
          on a pattern it sits inside the plate, because a pattern has no plain
          band to put type on and gingham under lettering is lettering fighting
          a light square and a dark one at the same time.
          Higher up on a pattern than on a drawing, and it has to be: at the same
          height it straddled the plate's own bottom edge, half on the paper and
          half on the gingham, which looks like a printing error. The plate's
          ruled border stops above it to leave it a clear band. */}
      <div
        className={
          "pointer-events-none absolute inset-x-0 flex items-center justify-center gap-2 " +
          (flat ? "bottom-[12%]" : "bottom-3")
        }
      >
        <span
          className="text-[12px] font-bold leading-none tracking-[-0.01em]"
          style={{ color: foot }}
        >
          Corner Bagel
        </span>
        <span
          className="rounded-full border px-2 py-[3px] text-[8px] font-bold uppercase leading-none tracking-[0.14em]"
          style={{ color: foot, borderColor: foot }}
        >
          {t("gift.cardBadge")}
        </span>
      </div>
    </div>
  );
}
