// The gift card designs, and the categories that filter them.
//
// Each design is drawn in CSS and SVG rather than being an image file, for
// two reasons: there is no Corner Bagel gift-card artwork to ship, and a
// drawn card re-colours with the palette and stays sharp at any size. When
// real artwork exists, give the design an `image` and render that instead —
// the gallery doesn't care which it is.
export const CATEGORIES = [
  "Seasonal",
  "Thanks",
  "Congrats",
  "Birthday",
  "Just because",
] as const;

export type Category = (typeof CATEGORIES)[number];

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
  | { kind: "checker"; ink: string; ground: string; word: string }
  | { kind: "wordmark"; ink: string; ground: string; word: string };

export type GiftCard = {
  id: string;
  // Read out to anyone who can't see the card face.
  label: string;
  categories: Category[];
  art: Art;
};

export const CREAM = "#F7F4EB";
const OLIVE = "#3E4A30";
const SAGE = "#B7C9A2";
const RED = "#BE1923";
const WHEAT = "#EFE3C4";

export const GIFT_CARDS: GiftCard[] = [
  {
    id: "gingham-red",
    label: "Red gingham gift card",
    categories: ["Seasonal", "Just because"],
    art: { kind: "gingham", ink: RED, ground: CREAM },
  },
  {
    id: "thank-you-olive",
    label: "Olive gift card reading thank you",
    categories: ["Thanks"],
    art: { kind: "wordmark", ink: CREAM, ground: OLIVE, word: "THANK YOU" },
  },
  {
    id: "bagels-wheat",
    label: "Gift card patterned with bagels",
    categories: ["Just because", "Seasonal"],
    art: { kind: "bagels", ink: OLIVE, ground: WHEAT },
  },
  {
    id: "congrats-checker",
    label: "Checkerboard gift card reading congrats",
    categories: ["Congrats"],
    art: { kind: "checker", ink: OLIVE, ground: SAGE, word: "CONGRATS" },
  },
  {
    id: "birthday-red",
    label: "Red gift card reading happy birthday",
    categories: ["Birthday"],
    art: { kind: "wordmark", ink: CREAM, ground: RED, word: "HAPPY BIRTHDAY" },
  },
  {
    id: "gingham-olive",
    label: "Olive gingham gift card",
    categories: ["Thanks", "Congrats", "Just because"],
    art: { kind: "gingham", ink: OLIVE, ground: CREAM },
  },
];
