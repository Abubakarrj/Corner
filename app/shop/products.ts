// The catalog: the counter menu, transcribed from the printed board, plus
// gift cards. Every name and price here is real.
//
// The `swatch` colour fills in for product photography we don't have yet —
// it tints the initials on the placeholder tile (see ProductImage.tsx).

// What a customer picks before an item can be made: which bagel, which
// spread. A choice can carry a surcharge, which is what turns the board's
// "+1.50" into a real number on the line.
export type OptionChoice = {
  id: string;
  label: string;
  priceCents: number;
  // What this choice brings with it. A sesame bagel adds sesame to whatever
  // it's under; a lox spread adds fish. Held on the choice rather than the
  // item because the item's own list can't know which one you'll pick.
  allergens?: Allergen[];
  // Only what the allergens don't already say — meat, pork, honey. See the
  // note on DietaryFlag.
  contains?: DietaryFlag[];
};

export type OptionGroup = {
  id: string;
  label: string;
  choices: OptionChoice[];
  // A group with no default has to be answered before the item can go in the
  // basket. Bagel works that way — "customers need to select their bagel" —
  // while spread defaults to none, because the board is explicit that the
  // sandwich price does not include cream cheese.
  defaultChoiceId?: string;
  // Show the chosen value on the basket line even when it's the free default.
  // The rule that hides those exists to keep "No spread" off every row; a
  // gift card's amount is the opposite case — it's the whole line.
  alwaysShow?: boolean;
};

// groupId -> choiceId. Stored on the cart line, so two of the same sandwich
// with different bagels are two lines rather than a quantity of two.
export type SelectedOptions = Record<string, string>;

// Six kinds, one price. Deliberately no default: an everything bagel and a
// plain one are not interchangeable, and defaulting to plain would quietly
// decide for anyone who tapped straight past.
//
// Wheat is on all six. Everything and sesame carry sesame; jalapeño cheddar
// carries dairy, which is the one here that changes what a *sandwich* is —
// pick it under a Veggie Stack and the line stops being dairy-free, and
// dietFit() reads these rather than guessing from the name.
export const BAGEL_GROUP: OptionGroup = {
  id: "bagel",
  label: "Bagel",
  choices: [
    { id: "plain", label: "Plain", priceCents: 0, allergens: ["wheat"] },
    { id: "everything", label: "Everything", priceCents: 0, allergens: ["wheat", "sesame"] },
    { id: "poppy", label: "Poppy", priceCents: 0, allergens: ["wheat"] },
    { id: "salt", label: "Salt", priceCents: 0, allergens: ["wheat"] },
    { id: "sesame", label: "Sesame", priceCents: 0, allergens: ["wheat", "sesame"] },
    {
      id: "jalapeno-cheddar",
      label: "Jalapeño Cheddar",
      priceCents: 0,
      allergens: ["wheat", "dairy"],
    },
  ],
};

// ——— Buying more than one ———

// A bagel is $3.50 on its own. Three, six, twelve or twenty-four are 15% off
// that, per bagel.
//
// Derived rather than typed, which is the whole point of it being here. The
// alternative is five prices written into the catalog, and the day the single
// price or the discount moves, four of them are wrong and nothing says so. The
// only numbers a person should have to edit are the two below.
export const BAGEL_SINGLE_CENTS = 350;
export const BAGEL_PACK_DISCOUNT = 0.15;
export const BAGEL_PACK_SIZES = [1, 3, 6, 12, 24] as const;

/** What a pack of `count` costs in total, at the counter's own rounding. */
export function bagelPackCents(count: number): number {
  const full = BAGEL_SINGLE_CENTS * count;
  if (count <= 1) return full;
  // Rounded once, on the pack total, rather than per bagel. Rounding the unit
  // price first and multiplying makes a 24 drift by up to a dollar from what
  // 15% off actually is.
  return Math.round(full * (1 - BAGEL_PACK_DISCOUNT));
}

// How many. `alwaysShow` because the count is the line, not a modifier of it:
// "Single Bagel" with the quantity hidden reads as one bagel whatever is in
// the basket. Defaults to one, so the picker opens on the thing the price
// under the name is quoting.
//
// Priced as surcharges over the single, the same shape the gift card's
// amounts use — a choice adds the difference rather than replacing the price,
// because that is what unitPriceCents() does with them.
export const BAGEL_COUNT_GROUP: OptionGroup = {
  id: "count",
  label: "How many",
  defaultChoiceId: "1",
  alwaysShow: true,
  choices: BAGEL_PACK_SIZES.map((count) => ({
    id: String(count),
    label: count === 1 ? "Just the one" : `${count} bagels`,
    priceCents: bagelPackCents(count) - BAGEL_SINGLE_CENTS,
  })),
};

// The board's add-on box: any spread +$1.50, lox spread +$2.00, and nothing
// at all as the default — "Sandwiches do NOT automatically include plain
// cream cheese" is the whole reason this group exists.
//
// Only the eight whipped spreads are offered. Peanut butter, jelly, butter,
// hot honey and chili crisp sit under "+ MORE" on the board rather than
// under "spread", and no add-on price is printed for them, so they're
// orderable on their own and not attachable here. Worth confirming with the
// kitchen — if they can go on a sandwich, they belong in this list with
// whatever the counter charges.
export const SPREAD_GROUP: OptionGroup = {
  id: "spread",
  label: "Spread",
  defaultChoiceId: "none",
  choices: [
    { id: "none", label: "No spread", priceCents: 0 },
    { id: "plain", label: "Plain cream cheese", priceCents: 150, allergens: ["dairy"] },
    { id: "scallion", label: "Scallion", priceCents: 150, allergens: ["dairy"] },
    { id: "jalapeno", label: "Jalapeño", priceCents: 150, allergens: ["dairy"] },
    { id: "veggie", label: "Veggie", priceCents: 150, allergens: ["dairy"] },
    { id: "garlic-herb", label: "Garlic & herb", priceCents: 150, allergens: ["dairy"] },
    { id: "strawberry", label: "Strawberry", priceCents: 150, allergens: ["dairy"] },
    { id: "vegan-plain", label: "Vegan plain", priceCents: 150 },
    { id: "lox", label: "Lox spread", priceCents: 200, allergens: ["dairy", "fish"] },
  ],
};

// Gift-card denominations. The base price is the smallest, and each larger
// amount is the difference — so the running total on the button is the card's
// face value, which is the only number anybody buying one cares about.
export const GIFT_AMOUNT_GROUP: OptionGroup = {
  id: "amount",
  label: "Amount",
  defaultChoiceId: "25",
  alwaysShow: true,
  choices: [
    { id: "25", label: "$25", priceCents: 0 },
    { id: "50", label: "$50", priceCents: 2500 },
    { id: "100", label: "$100", priceCents: 7500 },
  ],
};

export type Product = {
  slug: string;
  name: string;
  priceCents: number;
  category: string;
  description: string;
  swatch: string;
  // Choices this item can't be made without. Sandwiches take a bagel and a
  // spread; a single bagel takes a bagel. Everything else has none.
  options?: OptionGroup[];
  // The other things people type when they mean this. A menu name is rarely
  // the search term: nobody types "Cloud Cold Brew" when they want coffee,
  // "Good Lox Today!" when they want salmon, or "Orange Juice" when they
  // type OJ. Ingredients are already searchable through the description, so
  // these are for the words that appear nowhere on the item — nicknames,
  // abbreviations, and the category words a menu name leaves out.
  aliases?: string[];
  // Optional merchandising pill shown on the catalog tile ("New",
  // "Bestseller") — same treatment as the reference designs. Nothing carries
  // one today; it's here for when the counter wants to push something.
  tag?: "New" | "Bestseller";
  // What's in it that somebody might need to avoid.
  //
  // Every sandwich is on a bagel, so wheat is on all of them; a sesame bagel
  // adds sesame, which is why BAGEL_GROUP carries its own allergens and the
  // two get combined per line rather than listed once here.
  //
  // ⚠️ This is an ingredient list, not a safety guarantee. Everything is made
  // on one counter with shared boards and one toaster, so nothing here is
  // free of anything — allergensFor() returns the ingredients, and the copy
  // that shows it says the rest. Riley is told the same, because "no dairy in
  // that one" and "safe for a dairy allergy" are different sentences and only
  // one of them is ours to say.
  allergens?: Allergen[];
  // What it contains that a diet might rule out, over and above the allergen
  // list — meat, pork, honey. Dairy, egg and fish are read off the allergens
  // rather than repeated here. See DietaryFlag.
  contains?: DietaryFlag[];
};

// The set worth naming, from the guide's own list.
export type Allergen =
  | "wheat"
  | "dairy"
  | "egg"
  | "fish"
  | "sesame"
  | "peanuts"
  | "soy";

export const ALLERGEN_LABEL: Record<Allergen, string> = {
  wheat: "wheat",
  dairy: "dairy",
  egg: "egg",
  fish: "fish",
  sesame: "sesame",
  peanuts: "peanuts",
  soy: "soy",
};

// Said wherever allergens are. One sentence, one place.
//
// This is the copy Riley is briefed with. The same sentence for the product
// page lives in the string tables as "product.allergenNote", because that one
// has to be readable in seven languages and this one is part of a prompt.
// If you change either, change both.
export const ALLERGEN_NOTE =
  "Made on one counter with shared boards and a shared toaster, so we can't call anything allergen-free.";

// What's off the board today.
//
// A shop that bakes in the morning runs out, and the menu has a Donut of the
// Day on it — an item that is, by definition, sometimes gone. Riley's briefing
// has a whole section on how to handle sold out; until this existed the app
// had no way to tell her, or anyone, that anything was.
//
// Edited by hand for now, and that's the honest shape of it: there is no
// stock system and no admin screen. When the POS is connected this comes from
// there instead, and everything below keeps working — the catalog, the cart,
// the endpoint and Riley all read through soldOut(), not through this array.
export const SOLD_OUT: string[] = [];

export function soldOut(slug: string): boolean {
  return SOLD_OUT.includes(slug);
}

// ——— Options: defaults, pricing, and line identity ———

// What a fresh picker starts on: the group's default where it has one, and
// nothing where it doesn't. An empty answer is what "you still have to
// choose" looks like, and it's what disables the add button.
export function defaultOptions(product: Product): SelectedOptions {
  const selected: SelectedOptions = {};
  for (const group of product.options ?? []) {
    if (group.defaultChoiceId) selected[group.id] = group.defaultChoiceId;
  }
  return selected;
}

// Every group answered with a choice that exists. Guards two different
// things: a cart restored from localStorage that was saved before this item
// had options (or before a choice was renamed), and a hand-edited request to
// the order endpoint.
export function normalizeOptions(
  product: Product,
  selected: SelectedOptions | undefined,
): SelectedOptions {
  const groups = product.options ?? [];
  const clean: SelectedOptions = {};
  for (const group of groups) {
    const wanted = selected?.[group.id];
    const found = group.choices.find((choice) => choice.id === wanted);
    const fallback = group.choices.find((c) => c.id === group.defaultChoiceId);
    const choice = found ?? fallback;
    if (choice) clean[group.id] = choice.id;
  }
  return clean;
}

export function optionsComplete(product: Product, selected: SelectedOptions): boolean {
  return (product.options ?? []).every((group) => Boolean(selected[group.id]));
}

// The item's price with its choices priced in — the number a customer should
// see on the button before they commit, and the number the kitchen bills.
export function unitPriceCents(product: Product, selected: SelectedOptions): number {
  let total = product.priceCents;
  for (const group of product.options ?? []) {
    const choice = group.choices.find((c) => c.id === selected[group.id]);
    if (choice) total += choice.priceCents;
  }
  return total;
}

// The chosen options as short labels, for the basket and the order summary:
// ["Everything", "Scallion (+$1.50)"]. A default answer that costs nothing
// and adds nothing — "No spread" — is left out, because listing it on every
// line is noise that makes the lines that do carry a choice harder to spot.
export function describeOptions(product: Product, selected: SelectedOptions): string[] {
  const parts: string[] = [];
  for (const group of product.options ?? []) {
    const choice = group.choices.find((c) => c.id === selected[group.id]);
    if (!choice) continue;
    if (!group.alwaysShow && choice.priceCents === 0 && choice.id === group.defaultChoiceId) {
      continue;
    }
    parts.push(
      choice.priceCents > 0 && !group.alwaysShow
        ? `${choice.label} (+${formatPrice(choice.priceCents)})`
        : choice.label,
    );
  }
  return parts;
}

// What makes two basket lines the same line. An everything bagel and a plain
// one are different things to make, so they're separate lines rather than a
// quantity of two — this is the string that decides that, and it's what the
// basket's quantity and remove controls address a line by.
//
// Sorted by group id so the key doesn't depend on the order the choices were
// made in, and prefixed with the slug so two products can never collide.
// Everything in a line, item and choices together, de-duplicated and in a
// stable order. This is what a product page and Riley both read — if it were
// computed twice it would eventually disagree with itself, and a disagreement
// about allergens is not the kind you find out about gently.
export function allergensFor(
  product: Product,
  selected: SelectedOptions = {},
): Allergen[] {
  const found = new Set<Allergen>(product.allergens ?? []);
  for (const group of product.options ?? []) {
    const choice = group.choices.find((option) => option.id === selected[group.id]);
    for (const allergen of choice?.allergens ?? []) found.add(allergen);
  }
  // A fixed order, so the same set always reads the same way.
  const ORDER: Allergen[] = ["wheat", "dairy", "egg", "fish", "sesame", "peanuts", "soy"];
  return ORDER.filter((allergen) => found.has(allergen));
}

// Every allergen an item could carry, whichever choices get made. What a
// catalog listing shows, and what Riley is given — "contains wheat and may
// contain sesame depending on the bagel" is the honest shape of it before a
// choice exists.
export function possibleAllergens(product: Product): Allergen[] {
  const found = new Set<Allergen>(product.allergens ?? []);
  for (const group of product.options ?? []) {
    for (const choice of group.choices) {
      for (const allergen of choice.allergens ?? []) found.add(allergen);
    }
  }
  const ORDER: Allergen[] = ["wheat", "dairy", "egg", "fish", "sesame", "peanuts", "soy"];
  return ORDER.filter((allergen) => found.has(allergen));
}

// ——— Diets ———
//
// A different question from allergens, and worth keeping separate.
//
// The allergen list answers "will this hurt me". This answers "will I eat
// this", which is about religion, ethics and preference, and the honest answer
// has a different shape: an allergen is a fact about the item, but a diet is a
// fact about the person, and the same sandwich can suit or not depending on
// which spread goes on it.
//
// So only the facts that aren't already allergens are stored — meat, pork and
// honey. Dairy, egg and fish are read off the allergen list, because they are
// the same fact and two copies of a fact is one copy that goes stale.
export type DietaryFlag = "meat" | "pork" | "fish" | "dairy" | "egg" | "honey";

export type Diet = "vegetarian" | "vegan" | "pork-free" | "dairy-free" | "fish-free";

const RULED_OUT: Record<Diet, DietaryFlag[]> = {
  vegetarian: ["meat", "pork", "fish"],
  vegan: ["meat", "pork", "fish", "dairy", "egg", "honey"],
  "pork-free": ["pork"],
  "dairy-free": ["dairy"],
  "fish-free": ["fish"],
};

export const DIETS = Object.keys(RULED_OUT) as Diet[];

function flagsFrom(allergens: Allergen[] | undefined, contains: DietaryFlag[] | undefined) {
  const found = new Set<DietaryFlag>(contains ?? []);
  for (const allergen of allergens ?? []) {
    if (allergen === "dairy" || allergen === "egg" || allergen === "fish") found.add(allergen);
  }
  return found;
}

/** What a specific line contains, choices included. */
export function dietaryFlagsFor(
  product: Product,
  selected: SelectedOptions = {},
): DietaryFlag[] {
  const found = flagsFrom(product.allergens, product.contains);
  for (const group of product.options ?? []) {
    const choice = group.choices.find((option) => option.id === selected[group.id]);
    if (!choice) continue;
    for (const flag of flagsFrom(choice.allergens, choice.contains)) found.add(flag);
  }
  const ORDER: DietaryFlag[] = ["meat", "pork", "fish", "dairy", "egg", "honey"];
  return ORDER.filter((flag) => found.has(flag));
}

// How an item stands against a diet, before any choice is made.
//
// Three answers rather than two, because "no" and "not as it comes" are
// different things to be told. The Veggie Stack is vegan with no spread and
// isn't with the default one; answering a flat "no" there loses a sale and
// tells somebody the shop has less for them than it does.
export type DietFit = "yes" | "with-choices" | "no";

export function dietFit(product: Product, diet: Diet): DietFit {
  const banned = RULED_OUT[diet];
  const base = flagsFrom(product.allergens, product.contains);
  // The item itself rules it out, so no choice can rescue it.
  if (banned.some((flag) => base.has(flag))) return "no";

  const groups = product.options ?? [];
  if (groups.length === 0) return "yes";

  // Every group needs at least one choice that keeps it in, and if every
  // choice in every group does, it suits however it's ordered.
  let needsChoosing = false;
  for (const group of groups) {
    const ok = group.choices.filter((choice) => {
      const flags = flagsFrom(choice.allergens, choice.contains);
      return !banned.some((flag) => flags.has(flag));
    });
    if (ok.length === 0) return "no";
    if (ok.length < group.choices.length) needsChoosing = true;
  }
  return needsChoosing ? "with-choices" : "yes";
}

// The choices that keep an item inside a diet — what Riley offers instead.
//
// Empty when the item itself rules the diet out, rather than a list of
// choices that can't rescue it. Returning "Bagel: plain, everything, sesame"
// for a vegan asking about the Veggie Stack, whose cream cheese is baked into
// the item, is an answer that reads like a yes.
export function choicesFor(product: Product, diet: Diet): Record<string, string[]> {
  const banned = RULED_OUT[diet];
  if (dietFit(product, diet) === "no") return {};
  const out: Record<string, string[]> = {};
  for (const group of product.options ?? []) {
    out[group.label] = group.choices
      .filter((choice) => {
        const flags = flagsFrom(choice.allergens, choice.contains);
        return !banned.some((flag) => flags.has(flag));
      })
      .map((choice) => choice.label);
  }
  return out;
}

export function lineKey(slug: string, selected: SelectedOptions | undefined): string {
  const pairs = Object.entries(selected ?? {})
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([group, choice]) => `${group}:${choice}`);
  return pairs.length > 0 ? `${slug}::${pairs.join(",")}` : slug;
}

// What the shop sells, in the order the tabs run: the counter menu, then
// gift cards.
//
// The four pantry categories that used to follow (Pickles & Ferments, Oils &
// Vinegars, Sauces & Spreads, Pantry Staples) are gone along with their
// placeholder products. They were stand-ins from before there was a real
// menu, and a storefront half-filled with invented jars undercuts the half
// that's true. When there's a pantry to sell, it comes back as real entries.
export const CATEGORIES = [
  "Sandwiches",
  "Bagels",
  "Spreads",
  "Drinks",
  "Gift Cards",
] as const;

export const PRODUCTS: Product[] = [
  // ——— The counter menu ———
  //
  // Transcribed from the printed menu, in its order: the sandwiches run
  // cheapest to dearest the way the board numbers them, and the spreads keep
  // the board's two groups (schmears, then the rest).
  {
    slug: "tomato-please",
    allergens: ["wheat"],
    name: "Tomato, Please",
    priceCents: 1300,
    category: "Sandwiches",
    description: "Tomato, cucumber, red onion, capers.",
    swatch: "#C43128",
    aliases: ["tomato sandwich", "cucumber", "capers", "no meat"],
    options: [BAGEL_GROUP, SPREAD_GROUP],
  },
  {
    slug: "egg-and-schmear",
    allergens: ["wheat", "egg", "dairy"],
    name: "Egg & Schmear",
    priceCents: 1350,
    category: "Sandwiches",
    description: "Two eggs, scallion.",
    swatch: "#A66E00",
    aliases: ["egg sandwich", "eggs", "schmear", "cream cheese", "breakfast"],
    options: [BAGEL_GROUP, SPREAD_GROUP],
  },
  {
    slug: "baby-got-bec",
    allergens: ["wheat", "egg", "dairy"],
    contains: ["meat", "pork"],
    name: "Baby Got BEC",
    priceCents: 1450,
    category: "Sandwiches",
    description: "Bacon, egg, cheese.",
    swatch: "#A85220",
    aliases: [
      "bec",
      "bacon egg and cheese",
      "b e c",
      "breakfast",
      "egg sandwich",
    ],
    options: [BAGEL_GROUP, SPREAD_GROUP],
  },
  {
    slug: "one-sec-please",
    allergens: ["wheat", "egg", "dairy"],
    // Pork, on the assumption that breakfast sausage is pork unless the
    // kitchen says otherwise. ⚠️ Worth confirming: this is the flag somebody
    // avoiding pork will act on, and a wrong "no pork in that" is worse than
    // no answer. If it turns out to be turkey, drop "pork" and keep "meat".
    contains: ["meat", "pork"],
    name: "One Sec Please",
    priceCents: 1500,
    category: "Sandwiches",
    description: "Sausage, egg, cheese.",
    swatch: "#8E4A12",
    aliases: ["sausage egg and cheese", "breakfast", "egg sandwich"],
    options: [BAGEL_GROUP, SPREAD_GROUP],
  },
  {
    slug: "the-veggie-stack",
    allergens: ["wheat", "dairy"],
    name: "The Veggie Stack",
    priceCents: 1550,
    category: "Sandwiches",
    description: "Avocado, tomato, cucumber, sprouts, pickled onion.",
    swatch: "#47811F",
    aliases: ["veggie", "veg", "avocado", "avo", "sprouts"],
    options: [BAGEL_GROUP, SPREAD_GROUP],
  },
  {
    slug: "turkey-around-the-corner",
    allergens: ["wheat", "dairy"],
    // Turkey, and the hot honey — which is why a vegan can't have this even
    // without the meat, and why honey is a flag of its own.
    contains: ["meat", "honey"],
    name: "Turkey Around The Corner",
    priceCents: 1600,
    category: "Sandwiches",
    description: "Turkey, tomato, arugula, pickled onion, hot honey.",
    swatch: "#96551B",
    aliases: ["turkey sandwich", "arugula", "hot honey"],
    options: [BAGEL_GROUP, SPREAD_GROUP],
  },
  {
    slug: "spicy-tuna-sando",
    allergens: ["wheat", "fish", "egg"],
    name: "Spicy Tuna Sando",
    priceCents: 1650,
    category: "Sandwiches",
    description: "Spicy tuna salad, cucumber, scallion, sesame, nori.",
    swatch: "#AA2E5B",
    aliases: ["tuna", "sando", "spicy", "nori", "seaweed"],
    options: [BAGEL_GROUP, SPREAD_GROUP],
  },
  {
    slug: "good-lox-today",
    allergens: ["wheat", "fish", "dairy"],
    name: "Good Lox Today!",
    priceCents: 1750,
    category: "Sandwiches",
    description: "Smoked salmon, tomato, red onion, capers, dill.",
    swatch: "#C9502A",
    aliases: ["lox", "salmon", "nova", "bagel and lox", "smoked salmon"],
    options: [BAGEL_GROUP, SPREAD_GROUP],
  },
  {
    slug: "single-bagel",
    allergens: ["wheat"],
    // Not "Single Bagel" any more: it is sold by the one, the three, the six,
    // the twelve and the two dozen, and a name that says "single" argues with
    // the picker directly under it.
    name: "Bagel",
    priceCents: BAGEL_SINGLE_CENTS,
    category: "Bagels",
    description: "Plain, everything, poppy, salt, sesame, or jalapeño cheddar.",
    swatch: "#9A6B14",
    aliases: [
      "bagel",
      "bagels",
      "plain",
      "everything",
      "poppy",
      "salt",
      "sesame",
      "jalapeno",
      "cheddar",
      "everything bagel",
      "plain bagel",
      "sesame bagel",
      "half dozen",
      "dozen",
      "bakers dozen",
      "pack",
    ],
    // Count first: how many is the question somebody answers before which
    // kind, and it is the one that moves the price.
    options: [BAGEL_COUNT_GROUP, BAGEL_GROUP],
  },
  {
    slug: "cream-cheese-plain",
    allergens: ["dairy"],
    name: "Plain Cream Cheese",
    priceCents: 375,
    category: "Spreads",
    description: "House-whipped, and the one everything else is built on.",
    swatch: "#2E6E85",
    aliases: ["schmear", "cream cheese", "plain"],
  },
  {
    slug: "cream-cheese-scallion",
    allergens: ["dairy"],
    name: "Scallion Cream Cheese",
    priceCents: 450,
    category: "Spreads",
    description: "Whipped plain, loaded with fresh scallion.",
    swatch: "#2F7A3B",
    aliases: ["schmear", "cream cheese", "green onion"],
  },
  {
    slug: "cream-cheese-jalapeno",
    allergens: ["dairy"],
    name: "Jalapeño Cream Cheese",
    priceCents: 450,
    category: "Spreads",
    description: "Whipped plain with jalapeño through it.",
    swatch: "#4F7509",
    aliases: ["schmear", "cream cheese", "jalapeno", "spicy"],
  },
  {
    slug: "cream-cheese-veggie",
    allergens: ["dairy"],
    name: "Veggie Cream Cheese",
    priceCents: 450,
    category: "Spreads",
    description: "Whipped plain with vegetables folded in.",
    swatch: "#1F7A63",
    aliases: ["schmear", "cream cheese", "veg"],
  },
  {
    slug: "cream-cheese-garlic-herb",
    allergens: ["dairy"],
    name: "Garlic & Herb Cream Cheese",
    priceCents: 450,
    category: "Spreads",
    description: "Whipped plain with garlic and herbs.",
    swatch: "#656C15",
    aliases: ["schmear", "cream cheese", "herbs"],
  },
  {
    slug: "lox-spread",
    allergens: ["dairy", "fish"],
    name: "Lox Spread",
    priceCents: 450,
    category: "Spreads",
    description: "Cream cheese whipped through with lox.",
    swatch: "#C4486A",
    aliases: ["schmear", "cream cheese", "salmon", "nova"],
  },
  {
    slug: "cream-cheese-strawberry",
    allergens: ["dairy"],
    name: "Strawberry Cream Cheese",
    priceCents: 450,
    category: "Spreads",
    description: "Whipped plain, sweetened with strawberry.",
    swatch: "#B42561",
    aliases: ["schmear", "cream cheese", "sweet", "fruit"],
  },
  {
    slug: "cream-cheese-vegan-plain",
    name: "Vegan Plain Cream Cheese",
    priceCents: 450,
    category: "Spreads",
    description: "The plain schmear, made without dairy.",
    swatch: "#4A6BA8",
    aliases: [
      "schmear",
      "cream cheese",
      "vegan",
      "dairy free",
      "non dairy",
      "plant based",
    ],
  },
  {
    slug: "peanut-butter",
    allergens: ["peanuts"],
    name: "Peanut Butter",
    priceCents: 375,
    category: "Spreads",
    description: "Spread thick, corner to corner.",
    swatch: "#8A5A15",
    aliases: ["pb", "pbj", "peanut", "nut butter"],
  },
  {
    slug: "jelly",
    name: "Jelly",
    priceCents: 250,
    category: "Spreads",
    description: "On its own, or on top of the peanut butter.",
    swatch: "#A22B50",
    aliases: ["jam", "pbj", "preserves"],
  },
  {
    slug: "butter",
    allergens: ["dairy"],
    name: "Butter",
    priceCents: 250,
    category: "Spreads",
    description: "On a bagel straight out of the water and into the oven.",
    swatch: "#806A05",
    aliases: ["buttered"],
  },
  {
    slug: "hot-honey-schmear",
    allergens: ["dairy"],
    contains: ["honey"],
    name: "Hot Honey",
    priceCents: 200,
    category: "Spreads",
    description: "Sweet first, then a slow build of heat.",
    swatch: "#A85A00",
    aliases: ["honey", "spicy honey", "hot"],
  },
  {
    slug: "chili-crisp",
    allergens: ["soy"],
    name: "Chili Crisp",
    priceCents: 300,
    category: "Spreads",
    description: "Crunchy, oily, and hotter than it looks.",
    swatch: "#AB3217",
    aliases: ["chili", "chilli", "spicy", "crisp", "crunch"],
  },
  {
    slug: "choco-milk",
    allergens: ["dairy"],
    name: "Choco Milk",
    priceCents: 700,
    category: "Drinks",
    description: "For the walk back.",
    swatch: "#7E5230",
    aliases: ["hot chocolate", "cocoa", "chocolate milk", "chocolate"],
  },
  {
    slug: "orange-juice",
    name: "Orange Juice",
    priceCents: 700,
    category: "Drinks",
    description: "Cold, and the right thing next to an egg sandwich.",
    swatch: "#B05800",
    aliases: ["oj", "juice", "orange"],
  },
  {
    slug: "cloud-cold-brew",
    name: "Cloud Cold Brew",
    priceCents: 700,
    category: "Drinks",
    description: "Slow-steeped and poured over ice.",
    swatch: "#6A4A2A",
    aliases: ["coffee", "cold brew", "iced coffee", "caffeine"],
  },
  {
    slug: "cloud-tea",
    name: "Cloud Tea",
    priceCents: 700,
    category: "Drinks",
    description: "Brewed by the pot, served by the cup.",
    swatch: "#8C671C",
    aliases: ["tea", "iced tea", "caffeine"],
  },

  // ——— Gift cards ———
  //
  // Sold like anything else on the menu, with the denomination as an option
  // so one entry covers every amount and the tile prices itself as you
  // choose. The designs on /gift are the same product with artwork attached
  // to it; nothing here issues a balance yet — see the note in
  // app/(marketing)/gift/GiftGallery.tsx.
  {
    slug: "gift-card",
    name: "Gift Card",
    priceCents: 2500,
    category: "Gift Cards",
    description: "Spends like cash, at the counter or in the app.",
    swatch: "#C0303B",
    aliases: ["gift", "gift certificate", "giftcard", "voucher", "present"],
    options: [GIFT_AMOUNT_GROUP],
  },

];

export function getProduct(slug: string): Product | undefined {
  return PRODUCTS.find((product) => product.slug === slug);
}

// Spend this much and a Corner keychain goes in the bag. Replaces the
// free-shipping bar that used to sit here, which had two problems: there is
// no shipping-rate table to base a threshold on, and most orders are picked
// up, where "free shipping" is a reward for a cost that was never coming.
//
// A keychain applies to every kind of order and costs the same to give
// whichever way the bag leaves.
//
// NOTE: nothing adds the keychain to the order yet. The bar tells the
// customer they've earned it and the kitchen is expected to drop one in —
// which is fine for a counter, and won't be once orders are fulfilled by a
// system rather than a person. When that day comes, the keychain becomes a
// zero-price line the basket appends past this threshold.
export const GIFT_THRESHOLD_CENTS = 4000;
// Capital K: it's the name of a thing the shop gives out, not a description
// of a keychain that happens to be ours.
export const GIFT_NAME = "Corner Keychain";

// Picks products for the basket drawer's cross-sell strip: whatever isn't
// already in the basket, tagged items ("New"/"Bestseller") first since
// those are the ones actually worth surfacing, catalog order otherwise.
export function getCrossSellProducts(
  excludeSlugs: string[],
  limit = 4,
): Product[] {
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
    const aliases = (product.aliases ?? []).map((alias) => alias.toLowerCase());

    let score = 0;
    for (const word of words) {
      if (name.startsWith(word)) score += 100;
      else if (nameWords.some((w) => w.startsWith(word))) score += 60;
      // An alias that starts with the word beats one that merely contains
      // it, the same way the location search ranks its own — "cold" should
      // reach "cold brew" rather than only landing by luck. Both sit above
      // category and description, because someone typing a nickname means
      // that item, not everything that happens to mention the word.
      else if (aliases.some((alias) => alias.startsWith(word))) score += 45;
      else if (name.includes(word)) score += 30;
      else if (aliases.some((alias) => alias.includes(word))) score += 20;
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

// Labels are string keys, not words — the dropdown translates them at render.
export const SORT_OPTIONS = [
  { value: "featured", label: "shop.sortOptFeatured" },
  { value: "name-asc", label: "shop.sortOptNameAsc" },
  { value: "name-desc", label: "shop.sortOptNameDesc" },
  { value: "price-asc", label: "shop.sortOptPriceAsc" },
  { value: "price-desc", label: "shop.sortOptPriceDesc" },
  { value: "newest", label: "shop.sortOptNewest" },
  { value: "bestsellers", label: "shop.sortOptBestsellers" },
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
        (a, b) =>
          Number(b.tag === "Bestseller") - Number(a.tag === "Bestseller"),
      );
    case "featured":
    default:
      return sorted;
  }
}
