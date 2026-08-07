"use client";

import { useT } from "../i18n";
import { useMenu } from "../i18n/menu";
import { mixTotal, parseMix } from "./bagelMix";
import {
  groupAnswered,
  packSize,
  type Product,
  type SelectedOptions,
} from "./products";

// What still has to be answered before this can go in a basket, in words.
//
// ——— Why this exists ———
//
// The add button used to be the only thing saying an item wasn't ready, and it
// said so by not working. That failed in the most direct way possible: the
// user looked at his own product page, saw a dead button, and asked whether
// the build was broken. It wasn't — he hadn't chosen a bagel, and nothing on
// the screen said so.
//
// A disabled control is a poor messenger. It carries no reason, and at the
// contrast a disabled control is drawn at, it reads as a page that failed to
// load rather than a question waiting for an answer. So the button says the
// question instead: "Choose bagel" where it would have said "Add to basket",
// and it goes back to "Add to basket" the moment it can be pressed.
//
// One implementation, three surfaces — the product page, the catalog tile and
// the chat's picker. They are all asking the same question about the same
// item, and three copies of this rule is three chances for one of them to say
// something different.
//
// Returns null when there is nothing left to ask, which is also the signal
// that the button should be its normal self.
export default function useOptionPrompt(): (
  product: Product,
  selected: SelectedOptions,
) => string | null {
  const t = useT();
  const menu = useMenu();

  return (product, selected) => {
    for (const group of product.options ?? []) {
      if (groupAnswered(product, selected, group)) continue;

      // A part-filled box is a different question from an empty one. "Choose
      // bagel" is right when none are picked and wrong when nine of twelve
      // are — there, the thing they need to know is how many are left.
      if (group.mix) {
        const size = packSize(product, selected);
        const left = size - mixTotal(parseMix(group, selected[group.id], size));
        if (left > 0 && left < size) return t("mix.pickMore", { count: String(left) });
      }

      // "Choose bagel" — the same sentence the empty dropdown shows, so the
      // button and the control it is pointing at use the same words.
      return menu.placeholder(group);
    }
    return null;
  };
}
