// Two halves of one catalog.
//
// The first four categories are the counter menu — real names and real
// prices, transcribed from the printed menu. The last four are the pantry,
// which is still placeholder: those names, prices, and descriptions are
// stand-ins so the storefront has something to render, and they should be
// replaced before the pantry launches.
//
// The `swatch` color fills in for product photography we don't have for
// either half yet (see ProductImage in ProductCard.tsx).

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

// Menu first, pantry after — the tabs run in this order, and what someone
// came for is a sandwich far more often than a jar of oil. The four pantry
// tabs are the ones that were already here and stay.
export const CATEGORIES = [
  "Sandwiches",
  "Bagels",
  "Cream Cheese + More",
  "Drinks",
  "Pickles & Ferments",
  "Oils & Vinegars",
  "Sauces & Spreads",
  "Pantry Staples",
] as const;

export const PRODUCTS: Product[] = [
  // ——— The counter menu ———
  {
    slug: "baby-got-bec",
    name: "Baby Got BEC",
    priceCents: 1300,
    category: "Sandwiches",
    description: "Bacon, egg, and cheese.",
    swatch: "#C4783A",
  },
  {
    slug: "one-sec-please",
    name: "One Sec Please",
    priceCents: 1700,
    category: "Sandwiches",
    description: "Sausage, egg, and cheese.",
    swatch: "#9E5432",
  },
  {
    slug: "good-lox-today",
    name: "Good Lox Today!",
    priceCents: 2200,
    category: "Sandwiches",
    description: "Lox, cream cheese, red onion, capers, and dill.",
    swatch: "#E08A7E",
  },
  {
    // The menu sells one bagel at one price in three kinds. There is no
    // options step in the cart yet, so the kinds are named in the copy
    // rather than picked — a variant selector is the thing to build before
    // anybody can actually order an everything over a plain.
    slug: "single-bagel",
    name: "Single Bagel",
    priceCents: 325,
    category: "Bagels",
    description: "Plain, everything, or sesame.",
    swatch: "#D9A85F",
  },
  {
    slug: "cream-cheese-plain",
    name: "Plain Cream Cheese",
    priceCents: 325,
    category: "Cream Cheese + More",
    description: "House-whipped, and the one everything else is built on.",
    swatch: "#F2EEE2",
  },
  {
    slug: "cream-cheese-scallion",
    name: "Scallion Cream Cheese",
    priceCents: 400,
    category: "Cream Cheese + More",
    description: "Whipped plain, loaded with fresh scallion.",
    swatch: "#CFDCB4",
  },
  {
    slug: "cream-cheese-jalapeno",
    name: "Jalapeño Cream Cheese",
    priceCents: 400,
    category: "Cream Cheese + More",
    description: "Whipped plain with jalapeño through it.",
    swatch: "#A9C46C",
  },
  {
    slug: "cream-cheese-veggie",
    name: "Veggie Cream Cheese",
    priceCents: 400,
    category: "Cream Cheese + More",
    description: "Whipped plain with vegetables folded in.",
    swatch: "#C3CFA6",
  },
  {
    slug: "cream-cheese-garlic-herb",
    name: "Garlic & Herb Cream Cheese",
    priceCents: 400,
    category: "Cream Cheese + More",
    description: "Whipped plain with garlic and herbs.",
    swatch: "#DCE0C4",
  },
  {
    slug: "lox-spread",
    name: "Lox Spread",
    priceCents: 400,
    category: "Cream Cheese + More",
    description: "Cream cheese whipped through with lox.",
    swatch: "#F0B7A8",
  },
  {
    slug: "cream-cheese-strawberry",
    name: "Strawberry Cream Cheese",
    priceCents: 400,
    category: "Cream Cheese + More",
    description: "Whipped plain, sweetened with strawberry.",
    swatch: "#E7A0AE",
  },
  {
    slug: "cream-cheese-vegan-plain",
    name: "Vegan Plain Cream Cheese",
    priceCents: 400,
    category: "Cream Cheese + More",
    description: "The plain schmear, made without dairy.",
    swatch: "#EDE7D6",
  },
  {
    slug: "peanut-butter",
    name: "Peanut Butter",
    priceCents: 325,
    category: "Cream Cheese + More",
    description: "Spread thick, corner to corner.",
    swatch: "#B07A3E",
  },
  {
    slug: "jelly",
    name: "Jelly",
    priceCents: 200,
    category: "Cream Cheese + More",
    description: "On its own, or on top of the peanut butter.",
    swatch: "#A9364B",
  },
  {
    slug: "butter",
    name: "Butter",
    priceCents: 200,
    category: "Cream Cheese + More",
    description: "On a bagel straight out of the water and into the oven.",
    swatch: "#EFCF7B",
  },
  {
    slug: "hot-honey-schmear",
    name: "Hot Honey",
    priceCents: 175,
    category: "Cream Cheese + More",
    description: "Sweet first, then a slow build of heat.",
    swatch: "#E0A825",
  },
  {
    slug: "chili-crisp",
    name: "Chili Crisp",
    priceCents: 250,
    category: "Cream Cheese + More",
    description: "Crunchy, oily, and hotter than it looks.",
    swatch: "#B8471F",
  },
  {
    slug: "hot-chocolate",
    name: "Hot Chocolate",
    priceCents: 600,
    category: "Drinks",
    description: "For the walk back.",
    swatch: "#5C3A28",
  },
  {
    slug: "orange-juice",
    name: "Orange Juice",
    priceCents: 600,
    category: "Drinks",
    description: "Cold, and the right thing next to an egg sandwich.",
    swatch: "#E88A21",
  },
  {
    slug: "cloud-cold-brew",
    name: "Cloud Cold Brew",
    priceCents: 600,
    category: "Drinks",
    description: "Slow-steeped and poured over ice.",
    swatch: "#4A3728",
  },
  {
    slug: "cloud-tea",
    name: "Cloud Tea",
    priceCents: 600,
    category: "Drinks",
    description: "Brewed by the pot, served by the cup.",
    swatch: "#B9762F",
  },

  // ——— The pantry (placeholder) ———
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
    // "Jar" and "Tub" in the names here and below are doing real work: the
    // counter sells hot honey and scallion schmear by the side, at counter
    // prices, and two products called the same thing at $1.75 and $12 in one
    // catalog is a support ticket waiting to happen.
    slug: "hot-honey",
    name: "Hot Honey Jar",
    priceCents: 1200,
    tag: "New",
    category: "Sauces & Spreads",
    description:
      "Local honey steeped with chilies — sweet first, then a slow build of heat. Great on anything that could use both.",
    swatch: "#E0A825",
  },
  {
    slug: "scallion-cream-cheese",
    name: "Scallion Cream Cheese Tub",
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
