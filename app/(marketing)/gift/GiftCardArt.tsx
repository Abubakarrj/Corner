"use client";

import { useT, type StringKey } from "../../i18n";
import { CREAM, type Art } from "./giftCards";
import {
  DeliveryScene,
  PapelScene,
  ShopScene,
  SkylineScene,
  TableScene,
  WreathScene,
  type Palette,
} from "./GiftCardScenes";

// Every card carries the wordmark and an outlined "GIFT CARD" badge, as in
// the reference — that pairing is what makes a patterned rectangle read as a
// gift card rather than wallpaper.
function Chrome({ ink }: { ink: string }) {
  const t = useT();
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-5">
      <span
        className="text-[19px] font-bold leading-none tracking-[-0.02em] sm:text-[22px]"
        style={{ color: ink }}
      >
        Corner Bagel
      </span>
      <span
        className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase leading-none tracking-[0.14em]"
        style={{ color: ink, borderColor: ink }}
      >
        {t("gift.cardBadge")}
      </span>
    </div>
  );
}

// Woven gingham: two translucent bands crossed, so the overlap darkens on its
// own the way real gingham does, instead of three hand-picked tints that
// would drift apart when the colour changes.
function Gingham({ ink, ground }: { ink: string; ground: string }) {
  const band = `repeating-linear-gradient(to right, ${ink}59 0 12.5%, transparent 12.5% 25%)`;
  const bandDown = `repeating-linear-gradient(to bottom, ${ink}59 0 12.5%, transparent 12.5% 25%)`;
  return (
    <div className="absolute inset-0" style={{ backgroundColor: ground }}>
      <div className="absolute inset-0" style={{ backgroundImage: band }} />
      <div className="absolute inset-0" style={{ backgroundImage: bandDown }} />
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
          `slice` never has to stretch it. */}
      <svg
        className="h-full w-full"
        viewBox="0 0 135 100"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <pattern id="bagel-tile" width="15" height="15" patternUnits="userSpaceOnUse">
            <circle cx="7.5" cy="7.5" r="4.9" fill="none" stroke={ink} strokeWidth="1.5" opacity="0.42" />
            <circle cx="7.5" cy="7.5" r="1.7" fill="none" stroke={ink} strokeWidth="1.1" opacity="0.42" />
          </pattern>
        </defs>
        <rect width="135" height="100" fill="url(#bagel-tile)" />
      </svg>
    </div>
  );
}

// Checkerboard with the message set across it, as in the reference's
// "THANK YOU" card.
function Checker({ ink, ground, word }: { ink: string; ground: string; word: StringKey }) {
  const t = useT();
  const squares = `repeating-conic-gradient(${ground} 0% 25%, transparent 0% 50%)`;
  return (
    // The literal, not var(--cb-cream). The squares this shows between are
    // the card's own paper — in dark mode the token turned them near-black
    // and the design came apart. See the note in giftCards.ts.
    <div className="absolute inset-0" style={{ backgroundColor: CREAM }}>
      <div
        className="absolute inset-0"
        style={{ backgroundImage: squares, backgroundSize: "40px 40px" }}
      />
      <div className="absolute inset-0 flex items-center justify-center px-6">
        <span
          className="text-center text-[30px] font-bold uppercase leading-[0.92] tracking-[-0.02em] sm:text-[36px]"
          style={{ color: ink }}
        >
          {t(word)}
        </span>
      </div>
    </div>
  );
}

// A solid ground with the message large across it.
function Wordmark({ ink, ground, word }: { ink: string; ground: string; word: StringKey }) {
  const t = useT();
  return (
    <div
      className="absolute inset-0 flex items-center justify-center px-6"
      style={{ backgroundColor: ground }}
    >
      <span
        className="text-center text-[32px] font-bold uppercase leading-[0.9] tracking-[-0.03em] sm:text-[40px]"
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
  // Whether the face is already occupied — by a message across it, or by a
  // drawing. Either way the wordmark goes along the foot instead of a plate in
  // the middle, which on a scene would be a caption over the picture and on a
  // wordmark card would be a second piece of lettering under the first.
  //
  // A wordless scene is on this side of the line too. It has no message to sit
  // clear of, but it has a picture, and the whole point of dropping the word
  // was to let the picture be the card. The two lines along the bottom stay
  // because they are what makes a drawing read as a gift card rather than as
  // an illustration; that is the shop's name on it, not a caption.
  const fullFace = art.kind === "checker" || art.kind === "wordmark" || art.kind === "scene";
  // What the foot of the card is written in. Only a scene can differ, and only
  // a scene whose bottom is a different colour from the rest of it.
  const foot = (art.kind === "scene" ? art.footInk : undefined) ?? art.ink;

  return (
    <div className="absolute inset-0">
      {art.kind === "gingham" ? <Gingham ink={art.ink} ground={art.ground} /> : null}
      {art.kind === "bagels" ? <Bagels ink={art.ink} ground={art.ground} /> : null}
      {art.kind === "checker" ? (
        <Checker ink={art.ink} ground={art.ground} word={art.word} />
      ) : null}
      {art.kind === "wordmark" ? (
        <Wordmark ink={art.ink} ground={art.ground} word={art.word} />
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

      {fullFace ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center gap-2">
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
      ) : (
        <Chrome ink={art.ink} />
      )}
    </div>
  );
}
