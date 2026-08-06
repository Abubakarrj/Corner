// The shape of a reply from Riley, on the wire.
//
// Its own module because both ends need it and they can't share the module
// that produces it: app/api/shop-chat/tools.ts is `server-only` — it reaches
// Google and Uber with secret keys — and importing that from the widget would
// pull the whole server half into the browser bundle, or fail the build
// trying. Types are erased at compile time, so the two ends agree at zero
// runtime cost.

import type { SelectedOptions } from "./products";

export type ProductCard = {
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  swatch: string;
  soldOut: boolean;
  // The choices this item can't be made without. Present so a card can say
  // "Choose bagel" and open the item's page, rather than offering an Add
  // button that would have to guess.
  needs: string[];
};

export type InfoCard = {
  kind: "hours" | "delivery" | "totals";
  title: string;
  lines: { label: string; value: string }[];
  note?: string;
};

export type ChatScreen = "menu" | "basket" | "checkout" | "locations" | "account" | "gift";

export type ChatAction =
  | {
      type: "add_to_basket";
      slug: string;
      name: string;
      quantity: number;
      options: SelectedOptions;
    }
  | { type: "open"; screen: ChatScreen; label: string };

export type ChatAttachments = {
  products: ProductCard[];
  info: InfoCard[];
  chips: string[];
  actions: ChatAction[];
};

export function emptyAttachments(): ChatAttachments {
  return { products: [], info: [], chips: [], actions: [] };
}
