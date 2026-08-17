import type { StringKey } from "../../i18n/en";
import type { Palette } from "./GiftCardScenes";

// The gift card designs, and the categories that filter them.
//
// Each design is drawn in CSS and SVG rather than being an image file, and
// that stopped being a stopgap the moment the illustrated ones arrived. The
// word on a card is a string key, so one design renders in ten languages; an
// image with the word baked in is ten files, redrawn whenever a word changes,
// which in practice becomes one file in English. Drawn also stays sharp on a
// card rail at any width and recolours from a palette object.
//
// See GiftCardScenes.tsx for the illustrated faces and the note there about
// what was and was not taken from the references.
export const CATEGORIES = [
  "Seasonal",
  "Thanks",
  "Congrats",
  "Birthday",
  "Just because",
] as const;

export type Category = (typeof CATEGORIES)[number];

// ——— Which pills a card answers to ———
//
// The nine wordless designs went in with categories chosen to make every pill
// look well stocked, which is the one thing a filter must not be built for. A
// pill that returns almost everything has told the buyer nothing, and the buyer
// who tapped "Congrats" and got a picture of breakfast now trusts the next pill
// less. The rail unfiltered is already the "show me everything" view.
//
// So there are two rules, and they come from what is on the card:
//
//   A card with a word on it belongs to the occasion its word names, and to
//   nothing else. "BE MY VALENTINE" is not a just-because card and "CONGRATS"
//   is not a birthday card, however pretty either one is. The word decides,
//   because the word is what the recipient will read.
//
//   A wordless card belongs to whatever occasion its picture positively
//   suggests. Not every occasion its picture fails to rule out — that test
//   passes for everything. A green wreath suggests a holiday. A pink one
//   suggests a laurel, which is what congratulations has looked like for two
//   thousand years. A plate of breakfast suggests a thank-you.
//
// ——— "Just because" is the residual, not a free extra ———
//
// It was on every wordless card, which put thirteen of nineteen designs behind
// it and made it a synonym for "the ones without writing on them". A pill that
// holds two thirds of the rail is not a filter, it is a second All button, and
// it made the other four look like the exceptions rather than the answers.
//
// So a card lands here only when no occasion pill claims it. That is what the
// words mean — there is no occasion — and it makes the pill worth tapping: it
// now returns the designs that carry no message at all, which is a real thing
// to want and was previously impossible to ask for.
//
// A card can still hold two occasions where it genuinely reads as both; a pink
// wreath is a congratulations and a birthday. What it cannot do is hold an
// occasion and "no occasion" at the same time.
//
// Counts land at Thanks 5, Just because 5, Seasonal 4, Congrats 4, Birthday 3
// over nineteen designs. Birthday being thinnest is worth knowing, since it is
// the most common reason anybody buys a gift card at all — and that is a gap in
// the artwork rather than in the filing. The fix is a birthday palette on the
// wreath or the table, which is four hex values, not a re-sort.

// What each filter pill says, in whichever language is on. Kept as a map from
// the category rather than as string keys on the categories themselves,
// because the category *is* the id — it's what a card's `categories` array
// holds and what the URL would carry — and an id that changes with the
// language is not an id.
export const CATEGORY_LABEL: Record<Category, StringKey> = {
  Seasonal: "gift.catSeasonal",
  Thanks: "gift.catThanks",
  Congrats: "gift.catCongrats",
  Birthday: "gift.catBirthday",
  "Just because": "gift.catJustBecause",
};

// The word on a card that has one is a string key, not the word.
//
// This is a real product decision and worth writing down: the card the
// recipient opens says what the *buyer* was reading when they bought it, not
// what the recipient reads. That's the only version that's coherent — the
// buyer has to see the card they're sending, and the app has no idea what
// language the person receiving it wants. Somebody buying in Korean for an
// English-speaking friend can pick English first.
//
// It works at all because the cards are drawn rather than being image files,
// so there's one design and seven renderings of it. Real artwork would need
// one file per language, or this goes back to being English.

// The card colours are literals, not palette tokens, and must stay that way.
// A gift card is printed artwork: a red gingham card is red gingham on a
// cream ground whether the phone is in light mode or dark, the same way it
// would be in someone's hand. The one place this had leaked — the checker
// design painted its base with var(--cb-cream) — turned that card into
// near-black squares in dark mode.
//
// How the card face is drawn. The gallery maps these to real markup in
// GiftCardArt.tsx; keeping them as names rather than raw styles means a
// design can be restyled in one place instead of per entry.
// ——— The four patterned faces ———
//
// `ground` is the paper the pattern is printed on and `ink` is the pattern
// itself, which is also what the frame, the corner rosettes and all the
// lettering are drawn in — one colour per card, the way a two-colour press
// works, and the reason these recolour from two hex values.
//
// `plate` is the label laid over the pattern. It is not optional and must not
// become so: without it the type sits on the wallpaper, which is what these
// cards were and why they needed a face lift. See Plate in GiftCardScenes.tsx.
export type Art =
  | { kind: "gingham"; ink: string; ground: string; plate: string }
  | { kind: "bagels"; ink: string; ground: string; plate: string }
  | { kind: "checker"; ink: string; ground: string; plate: string; word: StringKey }
  | { kind: "wordmark"; ink: string; ground: string; plate: string; word: StringKey }
  // The illustrated three. `scene` picks the drawing and `palette` colours it,
  // so a second Valentine or a summer shopfront is a palette rather than a
  // fourth illustration.
  | {
      kind: "scene";
      scene: "papel" | "delivery" | "shop" | "shopClear" | "table" | "skyline" | "wreath";
      palette: Palette;
      /** The greeting, on the cards that want one.
       *
       *  Optional, and most of them do not. A picture of breakfast is already
       *  the sentence, and a wreath is the card you send when there is no
       *  occasion to name — writing one across it makes the art a background
       *  for a caption. The three that keep a word are the three where the
       *  word is the point: a Valentine, a holiday, an offer to pay. */
      word?: StringKey;
      /** Lettering colour. Kept out of the palette because it answers to the
       *  art rather than being part of it: the same palette reads over a pale
       *  panel and under a night sky. */
      ink: string;
      /** The "Corner Bagel / GIFT CARD" strip along the foot, when the foot of
       *  the picture is a different colour from where the word sits.
       *
       *  It defaulted to `ink` and only `ink`, which was fine until a scene had
       *  a pale foot under a dark sky. The shop stands in snow and the skyline
       *  ends in a road, both painted in the panel colour — so on the cards
       *  whose lettering is that same pale colour, the strip was pale on pale
       *  and the shop's name simply was not on the card. A word at the top of a
       *  picture and a line at the bottom of it are over two different things,
       *  and one colour cannot answer for both. */
      footInk?: string;
      /** Where the word sits, when there is one. A scene with its subject in
       *  the middle wants the lettering above it; one with a horizon wants it
       *  across the top. */
      wordAt?: "top" | "middle";
    };

type SceneName = Extract<Art, { kind: "scene" }>["scene"];

/** What each scene paints along the foot of the card, and behind where a
 *  greeting would sit.
 *
 *  ——— Why this has to be written down ———
 *
 *  Every card carries "Corner Bagel / GIFT CARD" along its foot, and some carry
 *  a greeting over the picture. Both are HTML laid over the SVG, so from inside
 *  a drawing they are invisible, and from inside this file a drawing is a name.
 *  Nothing connected the two, and two cards shipped wrong: the holiday shop
 *  wrote cream on its snow, and the congrats card wrote cream on cream paper —
 *  so the card whose entire job is to say "congrats" said nothing at all. Both
 *  read fine in the source. Both were only ever going to be caught by looking
 *  at a picture, and were.
 *
 *  So the fact lives here as data and legibility() below turns it into an
 *  answer. It is keyed off the scene union, so adding a drawing without saying
 *  what colour its bottom is does not compile.
 *
 *  It has to be kept true by hand against GiftCardScenes.tsx. That is a real
 *  cost and it is smaller than the alternative, which is sampling pixels out of
 *  a rendered card: this catches the mistake in a couple of milliseconds with
 *  no browser, and the thing it is checking is a decision somebody made rather
 *  than an emergent property of the drawing. */
export const SCENE_BACKDROP: Record<
  SceneName,
  { foot: (palette: Palette) => string; word: (palette: Palette) => string }
> = {
  // A sheet of pale paper across the middle, the ground showing below it.
  papel: { foot: (p) => p.ground, word: (p) => p.panel },
  // Sky above, a hedge along the bottom.
  delivery: { foot: (p) => p.accentSoft, word: (p) => p.ground },
  // Sky above, snow or pavement along the bottom — the panel colour either way.
  shop: { foot: (p) => p.panel, word: (p) => p.ground },
  shopClear: { foot: (p) => p.panel, word: (p) => p.ground },
  // Tablecloth to the edges.
  table: { foot: (p) => p.ground, word: (p) => p.ground },
  // Sky above, road along the bottom.
  skyline: { foot: (p) => p.panel, word: (p) => p.ground },
  // Ground to the edges; the ring is drawn inside it.
  wreath: { foot: (p) => p.ground, word: (p) => p.ground },
};

function channel(value: number): number {
  const part = value / 255;
  return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const digits = hex.replace("#", "");
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : digits;
  return (
    0.2126 * channel(parseInt(full.slice(0, 2), 16)) +
    0.7152 * channel(parseInt(full.slice(2, 4), 16)) +
    0.0722 * channel(parseInt(full.slice(4, 6), 16))
  );
}

/** How far apart two colours are, as the WCAG ratio: 1 is identical, 21 is
 *  black on white. */
export function contrast(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** How legible a card's lettering is against what the drawing puts behind it.
 *
 *  `word` is null on a card that carries no greeting, which is most of them.
 *  Cards whose face is not a drawing are not measured here — a checker or a
 *  wordmark card names both its ink and its ground in the same object, so
 *  there is nothing for them to get out of step with. */
export function legibility(card: GiftCard): { foot: number; word: number | null } {
  const { art } = card;
  // A patterned card is the easy case now, and that is the whole argument for
  // the plate: its greeting and its wordmark both sit on one flat colour that
  // the card itself names, so there is nothing to look up and nothing that can
  // fall out of step with a drawing. Before the plate they sat on gingham,
  // which is two colours at once and could not be measured against either.
  if (art.kind !== "scene") {
    return {
      foot: contrast(art.ink, art.plate),
      word: "word" in art ? contrast(art.ink, art.plate) : null,
    };
  }
  const { scene, palette, ink, footInk, word } = art;
  const backdrop = SCENE_BACKDROP[scene];
  return {
    foot: contrast(footInk ?? ink, backdrop.foot(palette)),
    word: word ? contrast(ink, backdrop.word(palette)) : null,
  };
}

export type GiftCard = {
  id: string;
  // Read out to anyone who can't see the card face — a string key, so that
  // description is in their language too. It was the English sentence, which
  // meant the gallery looked translated and sounded English to the one visitor
  // relying on it entirely.
  label: StringKey;
  categories: Category[];
  art: Art;
};

export const CREAM = "#F7F4EB";
const OLIVE = "#3E4A30";
const SAGE = "#B7C9A2";
const RED = "#BE1923";
const WHEAT = "#EFE3C4";
// The label stock the patterned cards are printed on. Warmer than CREAM on
// purpose: the red gingham's pale squares are CREAM, and a plate in exactly
// that colour would have no edge where it crossed one.
const PAPER = "#FFF6E2";

// The illustrated cards carry more colour than the rest of the app does, and
// that is correct rather than a lapse: a gift card is printed artwork, it is
// looked at once, and it is the one surface here allowed to be louder than
// the shop. Still literals, for the reason above — a card is the same card in
// dark mode as in light, the way it would be in somebody's hand.
export const CRUST = "#E8B14C";
export const SESAME = "#F6EBD2";

const SPRING: Palette = {
  ground: "#F2C438", panel: "#FFF6E2", ink: "#2C2A3D",
  accent: "#D8365B", accentSoft: "#1E7A63", crust: CRUST, seed: SESAME,
};
const WINTER: Palette = {
  ground: "#12403A", panel: "#F4EDE0", ink: "#12403A",
  accent: "#C8332E", accentSoft: "#2F7F5B", crust: CRUST, seed: SESAME,
};
const MORNING: Palette = {
  ground: "#8ECFE0", panel: "#FFF6E2", ink: "#26364A",
  accent: "#E4693F", accentSoft: "#2F7F5B", crust: CRUST, seed: SESAME,
};
const DUSK: Palette = {
  ground: "#243A6B", panel: "#F4EDE0", ink: "#1A2747",
  accent: "#E4693F", accentSoft: "#F2C438", crust: CRUST, seed: SESAME,
};
const SUNSET: Palette = {
  ground: "#F2A03D", panel: "#FFF3DC", ink: "#3A2540",
  accent: "#D8365B", accentSoft: "#7C4B8C", crust: CRUST, seed: SESAME,
};
const OLIVE_GROVE: Palette = {
  ground: "#5E6B44", panel: "#F4EDE0", ink: "#2E3823",
  accent: "#C4552F", accentSoft: "#9DB07A", crust: CRUST, seed: SESAME,
};
// The two accents are in the ground's own family on purpose. They were the
// shared red and green every other palette here uses, and on a pink card that
// is holly: the rose wreath came out as a Christmas wreath somebody had
// recoloured the background of, and the rose table got a bright green napkin.
// A palette is not a set of slots to fill with the house colours.
const ROSE: Palette = {
  ground: "#E9B7C4", panel: "#FFF6E2", ink: "#5A2A3B",
  accent: "#C2415F", accentSoft: "#9C6C86", crust: CRUST, seed: SESAME,
};
const SLATE: Palette = {
  ground: "#2C3A44", panel: "#F1ECE1", ink: "#1B252C",
  accent: "#E4693F", accentSoft: "#6FA8A0", crust: CRUST, seed: SESAME,
};

export const GIFT_CARDS: GiftCard[] = [
  {
    id: "gingham-red",
    label: "gift.artGinghamRed",
    // Red gingham is a festive table. Not also "Just because" — an occasion
    // pill has claimed it.
    categories: ["Seasonal"],
    art: { kind: "gingham", ink: RED, ground: CREAM, plate: PAPER },
  },
  {
    id: "thank-you-olive",
    label: "gift.artThankYouOlive",
    categories: ["Thanks"],
    // Ink is the olive now, not the cream. The word moved off the flat ground
    // and onto the plate, and cream lettering on cream paper is no lettering.
    art: { kind: "wordmark", ink: OLIVE, ground: OLIVE, plate: PAPER, word: "gift.wordThankYou" },
  },
  {
    id: "bagels-wheat",
    label: "gift.artBagelsWheat",
    // A field of bagels suggests no occasion, which is what the last pill is
    // for and now means.
    categories: ["Just because"],
    art: { kind: "bagels", ink: OLIVE, ground: WHEAT, plate: PAPER },
  },
  {
    id: "congrats-checker",
    label: "gift.artCongratsChecker",
    categories: ["Congrats"],
    art: { kind: "checker", ink: OLIVE, ground: SAGE, plate: PAPER, word: "gift.wordCongrats" },
  },
  {
    id: "birthday-red",
    label: "gift.artBirthdayRed",
    categories: ["Birthday"],
    // Ink is the red now, for the same reason as the thank-you card above.
    art: { kind: "wordmark", ink: RED, ground: RED, plate: PAPER, word: "gift.wordBirthday" },
  },
  {
    id: "on-me-delivery",
    label: "gift.artOnMe",
    // "This one is on me" is not an occasion, but it is how people say thank
    // you when they would rather buy something than say it.
    categories: ["Thanks"],
    art: {
      // Dark greeting against the sky, pale foot against the hedge. The foot
      // was the same navy as the greeting and came out at 2.5:1 on the green.
      kind: "scene", scene: "delivery", palette: MORNING,
      word: "gift.wordOnMe", ink: "#26364A", footInk: "#FFF6E2", wordAt: "top",
    },
  },
  {
    id: "valentine-papel",
    label: "gift.artValentine",
    // Not "Just because". A card that reads BE MY VALENTINE sent for no reason
    // is a card that says something the sender did not mean.
    categories: ["Seasonal"],
    art: {
      kind: "scene", scene: "papel", palette: SPRING,
      word: "gift.wordValentine", ink: "#2C2A3D", wordAt: "top",
    },
  },
  {
    id: "holidays-shop",
    label: "gift.artHolidays",
    categories: ["Seasonal"],
    art: {
      // Pale word against the night sky, dark foot against the snow.
      kind: "scene", scene: "shop", palette: WINTER,
      word: "gift.wordHolidays", ink: "#F4EDE0", footInk: "#12403A", wordAt: "top",
    },
  },
  {
    id: "congrats-papel",
    label: "gift.artCongratsPapel",
    // It says CONGRATS. That is not a birthday card, and it was under Birthday
    // only because Birthday was short.
    categories: ["Congrats"],
    art: {
      // Dark, not pale. The papel scene is a sheet of cream paper across the
      // whole card, so pale lettering on it was not lettering — this card
      // shipped saying nothing where it says "congrats".
      kind: "scene", scene: "papel", palette: DUSK,
      word: "gift.wordCongrats", ink: "#1A2747", footInk: "#F4EDE0", wordAt: "top",
    },
  },
  {
    id: "table-morning",
    label: "gift.artTable",
    // Breakfast made for somebody is a thank-you.
    categories: ["Thanks"],
    art: { kind: "scene", scene: "table", palette: MORNING, ink: "#26364A" },
  },
  {
    id: "skyline-sunset",
    label: "gift.artSkyline",
    // The city lit gold. Celebratory enough to earn Congrats, which the night
    // version below is not.
    categories: ["Congrats"],
    art: { kind: "scene", scene: "skyline", palette: SUNSET, ink: "#3A2540" },
  },
  {
    id: "wreath-olive",
    label: "gift.artWreath",
    // A green wreath is a holiday wreath.
    categories: ["Seasonal"],
    art: { kind: "scene", scene: "wreath", palette: OLIVE_GROVE, ink: "#F4EDE0" },
  },
  {
    id: "wreath-rose",
    label: "gift.artWreathRose",
    // A flowered wreath is a laurel, which is what congratulations has looked
    // like for two thousand years, and pink carries a birthday. Two occasions,
    // both real — that is allowed; an occasion plus "no occasion" is not.
    categories: ["Congrats", "Birthday"],
    art: { kind: "scene", scene: "wreath", palette: ROSE, ink: "#5A2A3B" },
  },
  {
    id: "skyline-night",
    label: "gift.artSkylineNight",
    // A night skyline suggests nothing in particular. That is a real answer,
    // and this pill is where it belongs.
    categories: ["Just because"],
    art: { kind: "scene", scene: "skyline", palette: SLATE, ink: "#1B252C" },
  },
  {
    id: "table-rose",
    label: "gift.artTableRose",
    // The same breakfast in pink, which carries a birthday the blue one does
    // not. Colour is the whole difference between these two cards, so it is
    // allowed to be the whole difference in where they file.
    categories: ["Thanks", "Birthday"],
    art: { kind: "scene", scene: "table", palette: ROSE, ink: "#5A2A3B" },
  },
  {
    id: "shop-morning",
    label: "gift.artShopMorning",
    // The shop on a clear morning: the come-by card, which is a thank-you.
    categories: ["Thanks"],
    art: { kind: "scene", scene: "shopClear", palette: MORNING, ink: "#26364A" },
  },
  {
    id: "delivery-dusk",
    label: "gift.artDeliveryDusk",
    // Wordless, so it carries no message the way the on-me version does. A
    // bagel arriving at night names no occasion.
    categories: ["Just because"],
    art: { kind: "scene", scene: "delivery", palette: DUSK, ink: "#1A2747" },
  },
  {
    id: "papel-olive",
    label: "gift.artPapelOlive",
    // A heart with no word on it. Affection, and no occasion attached.
    categories: ["Just because"],
    art: {
      // The paper is cream and the ground under it is olive, so the word and
      // the foot are opposite colours. See footInk on the Art type.
      kind: "scene", scene: "papel", palette: OLIVE_GROVE,
      ink: "#2E3823", footInk: "#F4EDE0",
    },
  },
  {
    id: "gingham-olive",
    label: "gift.artGinghamOlive",
    // Olive check suggests nothing at all, celebratory or otherwise.
    categories: ["Just because"],
    art: { kind: "gingham", ink: OLIVE, ground: CREAM, plate: PAPER },
  },
];
