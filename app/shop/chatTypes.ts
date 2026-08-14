// The shape of a reply from Riley, on the wire.
//
// Its own module because both ends need it and they can't share the module
// that produces it: app/api/shop-chat/tools.ts is `server-only` — it reaches
// Google and Uber with secret keys — and importing that from the widget would
// pull the whole server half into the browser bundle, or fail the build
// trying. Types are erased at compile time, so the two ends agree at zero
// runtime cost.

import type { SelectedOptions } from "./products";
import type { StringKey } from "../i18n/en";

// ——— Text the server can't write ———
//
// The chat route has no locale. It answers a fetch, not a person, and the
// visitor's language lives in the browser. Riley's own prose is fine — she is
// told which language to answer in and writes it herself — but the *panels*
// are assembled in TypeScript, and they used to be assembled in English:
// "What that comes to", "Out of range", "At the door in". A visitor with the
// app in Korean got Riley's Korean paragraph with an English table under it,
// and in Persian an RTL panel with LTR labels in it.
//
// So a panel now carries phrases rather than sentences, and the widget turns
// them into words. Four ways a phrase can name its text, because there are
// four genuinely different cases:
//
//   key    a string from the table, with its substitutions. Most things.
//   item   a menu item's slug, whose translated name fills {name}. The server
//          has the English name and the browser has the tables — the same
//          trick ProductCard.needs uses for option groups.
//   hour   an hour on the 24-hour clock, formatted for the locale into {time}.
//          7 is "7am" in English and "7시" in Korean, and only the browser
//          knows which.
//   day    a day of the week, 0 = Sunday, formatted into {day}.
//
// `text` is the escape hatch and it is not a fallback: it is for values that
// genuinely read the same everywhere. A price, a street address, an order
// number. Reaching for it because a string is missing from the table is how
// the English creeps back in.
export type Phrase = {
  key?: StringKey;
  vars?: Record<string, string | number>;
  item?: string;
  hour?: number;
  day?: number;
  text?: string;
};

export type ProductCard = {
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  swatch: string;
  soldOut: boolean;
  // The ids of the option groups this item can't be made without. Present so
  // a card can say "Choose bagel" and open the item's page, rather than
  // offering an Add button that would have to guess.
  //
  // Ids rather than labels because the card is drawn in the visitor's chosen
  // language and the server has none: the widget looks the group up by id and
  // asks the menu tables what to call it.
  needs: string[];
};

export type InfoCard = {
  kind: "hours" | "delivery" | "totals";
  title: Phrase;
  lines: { label: Phrase; value: Phrase }[];
  note?: Phrase;
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
