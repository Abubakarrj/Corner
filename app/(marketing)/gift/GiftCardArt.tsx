import type { Art } from "./giftCards";

// Every card carries the wordmark and an outlined "GIFT CARD" badge, as in
// the reference — that pairing is what makes a patterned rectangle read as a
// gift card rather than wallpaper.
function Chrome({ ink }: { ink: string }) {
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
        Gift card
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
function Checker({ ink, ground, word }: { ink: string; ground: string; word: string }) {
  const squares = `repeating-conic-gradient(${ground} 0% 25%, transparent 0% 50%)`;
  return (
    <div className="absolute inset-0" style={{ backgroundColor: "var(--cb-cream)" }}>
      <div
        className="absolute inset-0"
        style={{ backgroundImage: squares, backgroundSize: "40px 40px" }}
      />
      <div className="absolute inset-0 flex items-center justify-center px-6">
        <span
          className="text-center text-[30px] font-bold uppercase leading-[0.92] tracking-[-0.02em] sm:text-[36px]"
          style={{ color: ink }}
        >
          {word}
        </span>
      </div>
    </div>
  );
}

// A solid ground with the message large across it.
function Wordmark({ ink, ground, word }: { ink: string; ground: string; word: string }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center px-6"
      style={{ backgroundColor: ground }}
    >
      <span
        className="text-center text-[32px] font-bold uppercase leading-[0.9] tracking-[-0.03em] sm:text-[40px]"
        style={{ color: ink }}
      >
        {word}
      </span>
    </div>
  );
}

export default function GiftCardArt({ art }: { art: Art }) {
  // The worded designs carry their message as the whole face, so the
  // wordmark sits along the bottom rather than over the top of it.
  const worded = art.kind === "checker" || art.kind === "wordmark";

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

      {worded ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center gap-2">
          <span
            className="text-[12px] font-bold leading-none tracking-[-0.01em]"
            style={{ color: art.ink }}
          >
            Corner Bagel
          </span>
          <span
            className="rounded-full border px-2 py-[3px] text-[8px] font-bold uppercase leading-none tracking-[0.14em]"
            style={{ color: art.ink, borderColor: art.ink }}
          >
            Gift card
          </span>
        </div>
      ) : (
        <Chrome ink={art.ink} />
      )}
    </div>
  );
}
