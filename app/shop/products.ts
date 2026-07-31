// Placeholder catalog — names, prices, and descriptions here are stand-ins
// so the storefront has something real to render, not the actual menu.
// Swap in real products, prices, and photography before this goes live; the
// `swatch` color is filling in for product photography we don't have yet
// (see ProductImage in ProductCard.tsx).

export type Product = {
  slug: string;
  name: string;
  priceCents: number;
  category: string;
  description: string;
  swatch: string;
};

export const CATEGORIES = [
  "Pickles & Ferments",
  "Oils & Vinegars",
  "Sauces & Spreads",
  "Pantry Staples",
] as const;

export const PRODUCTS: Product[] = [
  {
    slug: "pickled-red-onions",
    name: "Pickled Red Onions",
    priceCents: 900,
    category: "Pickles & Ferments",
    description:
      "The same quick-pickled onions that go on the sandwiches — sharp, bright, and ready for anything you'd put a pickle on.",
    swatch: "#C0546B",
  },
  {
    slug: "house-giardiniera",
    name: "House Giardiniera",
    priceCents: 1100,
    category: "Pickles & Ferments",
    description:
      "A crunchy, vinegar-forward mix of pickled vegetables, cut small enough to pile onto a sandwich or spoon straight out of the jar.",
    swatch: "#8A9B4F",
  },
  {
    slug: "house-olive-oil",
    name: "House Olive Oil",
    priceCents: 2400,
    category: "Oils & Vinegars",
    description:
      "Our everyday finishing oil — good enough for the counter, sturdy enough for the pan.",
    swatch: "#A8A13D",
  },
  {
    slug: "chili-oil",
    name: "Chili Oil",
    priceCents: 1400,
    category: "Oils & Vinegars",
    description:
      "Slow-steeped with dried chilies and aromatics. A spoonful wakes up eggs, bagels, or anything that needs a little heat.",
    swatch: "#B8471F",
  },
  {
    slug: "sandwich-sauce",
    name: "Sandwich Sauce",
    priceCents: 900,
    category: "Sauces & Spreads",
    description:
      "The house sauce, bottled. Tangy, a little sweet, and the reason people ask what's on their sandwich.",
    swatch: "#D68A3C",
  },
  {
    slug: "hot-honey",
    name: "Hot Honey",
    priceCents: 1200,
    category: "Sauces & Spreads",
    description:
      "Local honey steeped with chilies — sweet first, then a slow build of heat. Great on anything that could use both.",
    swatch: "#E0A825",
  },
  {
    slug: "scallion-cream-cheese",
    name: "Scallion Cream Cheese",
    priceCents: 700,
    category: "Sauces & Spreads",
    description:
      "House-whipped, loaded with fresh scallion. The same tub we schmear behind the counter.",
    swatch: "#DCE3C6",
  },
  {
    slug: "everything-seasoning",
    name: "Everything Bagel Seasoning",
    priceCents: 800,
    category: "Pantry Staples",
    description:
      "Sesame, poppy, garlic, onion, and flake salt — the blend that goes on every everything bagel, in a jar for your own kitchen.",
    swatch: "#4A4038",
  },
];

export function getProduct(slug: string): Product | undefined {
  return PRODUCTS.find((product) => product.slug === slug);
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
