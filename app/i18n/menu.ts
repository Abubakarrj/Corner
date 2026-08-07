"use client";

import { useLocale } from "./index";
import { TABLES } from "./menuTables";
import {
  ALLERGEN_LABEL,
  formatPrice,
  getProduct,
  type Allergen,
  type OptionChoice,
  type OptionGroup,
  type Product,
  type SelectedOptions,
} from "../shop/products";

// The menu, translated — the hooks that read it.
//
// The tables live in menuTables.ts, which has no "use client" on it so the
// chat route can import them too. Everything here is what a component needs
// on top of them; the key shapes and the reasoning behind them are documented
// over there.

// The lookup. The fallback is the English already in products.ts, so a product
// nobody has translated shows its own name rather than an id.
export function useMenuText(): (id: string, fallback: string) => string {
  const locale = useLocale();
  const table = TABLES[locale];
  return (id, fallback) => table?.[id] ?? fallback;
}

// describeOptions() with the labels looked up. Shared by options() and
// recorded() so the two can't drift on which choices are worth listing.
function chosenLabels(
  m: (id: string, fallback: string) => string,
  product: Product,
  selected: SelectedOptions | undefined,
): string[] {
  const chosen = selected ?? {};
  const parts: string[] = [];
  for (const group of product.options ?? []) {
    const choice = group.choices.find((c) => c.id === chosen[group.id]);
    if (!choice) continue;
    if (
      !group.alwaysShow &&
      choice.priceCents === 0 &&
      choice.id === group.defaultChoiceId
    ) {
      continue;
    }
    const label = m(`choice.${group.id}.${choice.id}`, choice.label);
    parts.push(
      choice.priceCents > 0 && !group.alwaysShow
        ? `${label} (+${formatPrice(choice.priceCents)})`
        : label,
    );
  }
  return parts;
}

export type MenuText = {
  name(product: Pick<Product, "slug" | "name">): string;
  description(product: Pick<Product, "slug" | "description">): string;
  category(category: string): string;
  group(group: OptionGroup): string;
  /** What a group with no default opens on: "Choose bagel". */
  placeholder(group: OptionGroup): string;
  choice(group: OptionGroup, choice: OptionChoice): string;
  allergen(allergen: Allergen): string;
  /** describeOptions(), translated — see the note on that function. */
  options(product: Product, selected: SelectedOptions | undefined): string[];
  /**
   * A line out of a stored order or a usual, which names a product by slug and
   * carries the English it was recorded with.
   */
  recorded(item: RecordedItem): { name: string; options: string };
};

// What account.ts writes into localStorage for every line of every order: a
// slug, plus the English name and options label as they read on the day.
export type RecordedItem = {
  slug: string;
  name: string;
  options?: SelectedOptions;
  optionsLabel?: string;
};

// The same lookup with the key shapes spelled out, so call sites don't each
// write `m(\`name.${product.slug}\`, product.name)` and get to disagree about
// which half is the fallback. Everything a screen renders off the menu goes
// through one of these.
export function useMenu(): MenuText {
  const m = useMenuText();
  return {
    name: (product) => m(`name.${product.slug}`, product.name),
    description: (product) => m(`desc.${product.slug}`, product.description),
    category: (category) => m(`cat.${category}`, category),
    group: (group) => m(`opt.${group.id}`, group.label),
    // Its own string rather than "Choose" + the group name, because that
    // sentence isn't built the same way twice: Japanese puts the verb last,
    // Urdu puts it last and reads right to left, and English wants the noun
    // lowercased mid-sentence in a way no other language here does. The
    // fallback keeps the English exactly as it always read.
    placeholder: (group) =>
      m(`choose.${group.id}`, `Choose ${group.label.toLowerCase()}`),
    choice: (group, choice) => m(`choice.${group.id}.${choice.id}`, choice.label),
    allergen: (allergen) => m(`allergen.${allergen}`, ALLERGEN_LABEL[allergen]),
    // A translation of describeOptions rather than a wrapper around it: the
    // rules for which choices are worth listing are the same, but the labels
    // and the surcharge both have to come from here. Keeping the two in step
    // is the cost of the basket reading in the same language as the tile that
    // filled it.
    options: (product, selected) => chosenLabels(m, product, selected),
    // Order history is written in English and kept on the device, so it can't
    // be translated where it's stored — a basket placed in Spanish and read
    // back in Korean has to come out Korean, and the localStorage record was
    // frozen months ago. It's re-derived from the slug instead, which is the
    // one part of the record that means the same thing in every language.
    //
    // The recorded English is the fallback, not the source: an item the shop
    // has since taken off the menu has no slug to look up any more, and the
    // name it was bought under is the only honest thing left to show.
    recorded: (item) => {
      const product = getProduct(item.slug);
      if (!product) return { name: item.name, options: item.optionsLabel ?? "" };
      return {
        name: m(`name.${product.slug}`, product.name),
        options: chosenLabels(m, product, item.options).join(" · "),
      };
    },
  };
}
