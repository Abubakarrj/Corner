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
  // Optional merchandising pill shown on the catalog tile ("New",
  // "Bestseller") — same treatment as the reference designs. Placeholder
  // picks below, like everything else in this file.
  tag?: "New" | "Bestseller";
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
    tag: "Bestseller",
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
    tag: "New",
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

// A placeholder threshold for the basket's free-shipping progress bar —
// there's no real shipping-rate table yet, so $50 is a stand-in round
// number. Swap once real shipping costs are known.
export const FREE_SHIPPING_THRESHOLD_CENTS = 5000;

// Picks products for the basket drawer's cross-sell strip: whatever isn't
// already in the basket, tagged items ("New"/"Bestseller") first since
// those are the ones actually worth surfacing, catalog order otherwise.
export function getCrossSellProducts(excludeSlugs: string[], limit = 4): Product[] {
  const excluded = new Set(excludeSlugs);
  return PRODUCTS.filter((product) => !excluded.has(product.slug))
    .sort((a, b) => Number(Boolean(b.tag)) - Number(Boolean(a.tag)))
    .slice(0, limit);
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Amazon-style word matching: the query is split into words and a product
// only matches if EVERY word hits something (AND, not OR) — "chili oil"
// shouldn't surface every oil in the catalog. Where a word matches decides
// the ranking: the start of the name beats a later word in the name, which
// beats the category, which beats the description. Ties keep catalog order.
//
// Deliberately plain substring matching, no fuzzy/typo tolerance: with a
// catalog this size that would surface more noise than it rescues, and it
// can be added later against real search logs rather than guesses.
export function searchProducts(query: string, limit = 6): Product[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const scored: { product: Product; score: number; order: number }[] = [];

  PRODUCTS.forEach((product, order) => {
    const name = product.name.toLowerCase();
    const category = product.category.toLowerCase();
    const description = product.description.toLowerCase();
    const nameWords = name.split(/\s+/);

    let score = 0;
    for (const word of words) {
      if (name.startsWith(word)) score += 100;
      else if (nameWords.some((w) => w.startsWith(word))) score += 60;
      else if (name.includes(word)) score += 30;
      else if (category.includes(word)) score += 15;
      else if (description.includes(word)) score += 5;
      else return; // this word matched nothing — the product is out
    }

    scored.push({ product, score, order });
  });

  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((hit) => hit.product);
}

export const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "name-asc", label: "Name: A to Z" },
  { value: "name-desc", label: "Name: Z to A" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest" },
  { value: "bestsellers", label: "Best Sellers" },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];

export function isSortValue(value: string | undefined): value is SortValue {
  return SORT_OPTIONS.some((option) => option.value === value);
}

// "Featured" is the catalog's own hand-arranged order (PRODUCTS above), so
// it's the identity case. "Newest" has no real added-at timestamp to sort
// by yet — it stands in with the catalog's order reversed (last-defined
// reads as most-recent) until products carry real dates.
export function sortProducts(products: Product[], sort: SortValue): Product[] {
  const sorted = [...products];
  switch (sort) {
    case "name-asc":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "name-desc":
      return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case "price-asc":
      return sorted.sort((a, b) => a.priceCents - b.priceCents);
    case "price-desc":
      return sorted.sort((a, b) => b.priceCents - a.priceCents);
    case "newest":
      return sorted.reverse();
    case "bestsellers":
      return sorted.sort(
        (a, b) => Number(b.tag === "Bestseller") - Number(a.tag === "Bestseller"),
      );
    case "featured":
    default:
      return sorted;
  }
}
