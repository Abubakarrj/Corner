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
export type Art =
  | { kind: "gingham"; ink: string; ground: string }
  | { kind: "bagels"; ink: string; ground: string }
  | { kind: "checker"; ink: string; ground: string; word: StringKey }
  | { kind: "wordmark"; ink: string; ground: string; word: StringKey }
  // The illustrated three. `scene` picks the drawing and `palette` colours it,
  // so a second Valentine or a summer shopfront is a palette rather than a
  // fourth illustration.
  | {
      kind: "scene";
      scene: "papel" | "delivery" | "shop";
      palette: Palette;
      word: StringKey;
      /** Lettering colour, and the strip along the foot. Kept out of the
       *  palette because it answers to the art rather than being part of it:
       *  the same palette reads over a pale panel and under a night sky. */
      ink: string;
      /** Where the word sits. A scene with its subject in the middle wants the
       *  lettering above it; one with a horizon wants it across the top. */
      wordAt: "top" | "middle";
    };

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

// The illustrated cards carry more colour than the rest of the app does, and
// that is correct rather than a lapse: a gift card is printed artwork, it is
// looked at once, and it is the one surface here allowed to be louder than
// the shop. Still literals, for the reason above — a card is the same card in
// dark mode as in light, the way it would be in somebody's hand.
const CRUST = "#E8B14C";
const SESAME = "#F6EBD2";

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

export const GIFT_CARDS: GiftCard[] = [
  {
    id: "gingham-red",
    label: "gift.artGinghamRed",
    categories: ["Seasonal", "Just because"],
    art: { kind: "gingham", ink: RED, ground: CREAM },
  },
  {
    id: "thank-you-olive",
    label: "gift.artThankYouOlive",
    categories: ["Thanks"],
    art: { kind: "wordmark", ink: CREAM, ground: OLIVE, word: "gift.wordThankYou" },
  },
  {
    id: "bagels-wheat",
    label: "gift.artBagelsWheat",
    categories: ["Just because", "Seasonal"],
    art: { kind: "bagels", ink: OLIVE, ground: WHEAT },
  },
  {
    id: "congrats-checker",
    label: "gift.artCongratsChecker",
    categories: ["Congrats"],
    art: { kind: "checker", ink: OLIVE, ground: SAGE, word: "gift.wordCongrats" },
  },
  {
    id: "birthday-red",
    label: "gift.artBirthdayRed",
    categories: ["Birthday"],
    art: { kind: "wordmark", ink: CREAM, ground: RED, word: "gift.wordBirthday" },
  },
  {
    id: "on-me-delivery",
    label: "gift.artOnMe",
    categories: ["Just because", "Thanks"],
    art: {
      kind: "scene", scene: "delivery", palette: MORNING,
      word: "gift.wordOnMe", ink: "#26364A", wordAt: "top",
    },
  },
  {
    id: "valentine-papel",
    label: "gift.artValentine",
    categories: ["Seasonal", "Just because"],
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
      kind: "scene", scene: "shop", palette: WINTER,
      word: "gift.wordHolidays", ink: "#F4EDE0", wordAt: "top",
    },
  },
  {
    id: "congrats-papel",
    label: "gift.artCongratsPapel",
    categories: ["Congrats", "Birthday"],
    art: {
      kind: "scene", scene: "papel", palette: DUSK,
      word: "gift.wordCongrats", ink: "#F4EDE0", wordAt: "top",
    },
  },
  {
    id: "gingham-olive",
    label: "gift.artGinghamOlive",
    categories: ["Thanks", "Congrats", "Just because"],
    art: { kind: "gingham", ink: OLIVE, ground: CREAM },
  },
];
