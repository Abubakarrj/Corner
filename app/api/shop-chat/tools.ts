import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import {
  ALLERGEN_LABEL,
  ALLERGEN_NOTE,
  DIETS,
  choicesFor,
  dietFit,
  dietaryFlagsFor,
  allergensFor,
  CATEGORIES,
  describeOptions,
  groupAnswered,
  formatPrice,
  getProduct,
  normalizeOptions,
  possibleAllergens,
  PRODUCTS,
  searchProducts,
  soldOut,
  unitPriceCents,
  type Product,
  type SelectedOptions,
} from "../../shop/products";
import { servesCategory, servesProduct, storeById } from "../../shop/storeMenu";
import { totalsFor } from "../../shop/money";
import type { ChatAttachments, Phrase, ProductCard } from "../../shop/chatTypes";
import {
  closeHour,
  isOpenNow,
  minutesUntilClose,
  nextOpening,
  nextOpeningAt,
  openingStatus,
  PREP_MINUTES,
} from "../../shopFacts";
import {
  DELIVERY_RADIUS_MILES,
  LOCATIONS,
  addressParts,
  opensAt,
} from "../../(marketing)/locations/locations";
import { driveBetween, geocode } from "../../googleMaps";
import { isUberConfigured, quoteDelivery, structuredAddress } from "../../uberDirect";
import { deliveryOrigin, deliveryStoreFor } from "../../storePlaces";
import { noEmDashes } from "./scrub";
import { refreshSoldOut } from "../../soldOut";

// What Riley can actually do.
//
// Before this she could only talk: she'd quote a price from the menu in her
// briefing, add it up in her head, and tell you she couldn't do anything with
// it. That produced the two failures worth designing against — arithmetic she
// got to do herself, and a conversation that ends in "now go and do it
// manually".
//
// The tools split three ways, and the split is the design:
//
//   READ    — run here, on the server, against the same modules the shop
//             itself uses. The menu, the money, the clock, the courier. Riley
//             never computes a total; totalsFor does, exactly as it does at
//             checkout, so the number she says is the number you'll pay.
//
//   SHOW    — return nothing to Riley and everything to the browser. These
//             are how a reply becomes cards and chips instead of a wall of
//             markdown. She chooses what to attach; the widget renders it.
//
//   ACT     — change the visitor's basket. Adding is reversible and costs
//             nobody anything, so she does it and the basket opens so you can
//             see it happen. Placing the order is not here and will not be:
//             spending someone's money is a tap they make, not a sentence
//             they said.
//
// Descriptions are prescriptive about *when* to call, not just what the tool
// does. That is the single biggest lever on whether a tool gets used at the
// right moment, and this model reaches for tools conservatively by default.

// The wire shape the browser gets back lives in app/shop/chatTypes.ts — this
// module is server-only, and the widget can't import from it.
export type {
  ChatAction,
  ChatAttachments,
  InfoCard,
  ProductCard,
} from "../../shop/chatTypes";
export { emptyAttachments } from "../../shop/chatTypes";

// ——— Tool definitions ———
//
// Kept as a frozen, deterministically ordered array. Tools render *before*
// the system prompt, so any churn here invalidates the cached menu behind it —
// see the cache_control note in route.ts.

export const RILEY_TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: "search_menu",
    description:
      "Search the live menu. Call this before naming any item, price, or ingredient, " +
      "and never from memory: prices and availability change, and a wrong " +
      "price costs somebody a trip. Also call it when asked what's under a price or " +
      "what's in a category. Returns each item's real price, description, required " +
      "choices, allergens and whether it sold out today. For what somebody eats or " +
      "avoids, vegetarian, vegan, no pork, no dairy, use check_diet instead: meat " +
      "and honey are not allergens, so this tool cannot answer those.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "What they're looking for, in their words: 'lox', 'coffee', 'something vegetarian'. Leave empty to list a whole category.",
        },
        category: {
          type: "string",
          enum: [...CATEGORIES],
          description: "Narrow to one section of the menu.",
        },
        without_allergen: {
          type: "string",
          enum: Object.keys(ALLERGEN_LABEL),
          description:
            "Only items whose ingredients don't include this. Use when somebody names something they avoid.",
        },
        max_price_cents: {
          type: "integer",
          description: "Only items at or under this price, in cents.",
        },
      },
      required: [],
    },
  },
  {
    name: "check_diet",
    description:
      "What the shop has for a diet: vegetarian, vegan, pork-free, dairy-free or " +
      "fish-free. Call this whenever somebody says what they do or don't eat, rather " +
      "than working it out from the menu yourself. It returns three lists: what " +
      "suits however it's ordered, what suits with the right choices (and which " +
      "choices those are), and what doesn't, so you can offer the second group " +
      "instead of turning somebody away. There is no gluten-free option; every " +
      "bagel is wheat, and the tool says so.",
    input_schema: {
      type: "object",
      properties: {
        diet: {
          type: "string",
          enum: [...DIETS],
          description: "The diet to check the menu against.",
        },
      },
      required: ["diet"],
    },
  },
  {
    name: "get_item",
    description:
      "Full detail for one menu item: every choice it needs, what each choice costs, " +
      "and the allergens for a specific combination. Call this when somebody is " +
      "deciding on a particular item, or before adding it to a basket, so you know " +
      "which choices it can't be made without.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "The item's slug, from search_menu." },
        options: {
          type: "object",
          description:
            'A specific combination to price and check allergens for, e.g. ' +
            '{"bagel":"sesame","spread":"scallion"}. A group marked `mix` in ' +
            'get_item_detail takes counts instead: {"count":"12",' +
            '"bagel":"plain*6+everything*6"}, and they must add up to the count.',
          additionalProperties: { type: "string" },
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "price_order",
    description:
      "Work out what a basket comes to: subtotal, tax and total. ALWAYS call this " +
      "instead of adding prices up yourself: it runs the same arithmetic the checkout " +
      "runs, so the figure you quote is the figure they'll be charged. Mental " +
      "arithmetic here is how a chat quotes one number and the till charges another.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "The lines to price.",
          items: {
            type: "object",
            properties: {
              slug: { type: "string" },
              quantity: { type: "integer" },
              options: { type: "object", additionalProperties: { type: "string" } },
            },
            required: ["slug", "quantity"],
          },
        },
      },
      required: ["items"],
    },
  },
  {
    name: "check_hours",
    description:
      "Whether the counter is open right now, when it next opens, and whether there's " +
      "still time to make an order before it shuts. Call this whenever the answer " +
      "depends on the time: 'are you open', 'can I order now', 'when will it be " +
      "ready', rather than assuming.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "check_delivery",
    description:
      "Whether a courier will deliver to an address, how far it is by road, what the " +
      "delivery costs and how long it takes. Call this the moment somebody gives an " +
      "address or asks whether you deliver to them. Never guess a delivery fee: it's " +
      "quoted per address, so there is no flat rate to quote.",
    input_schema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "The address as they said it. A street and a city or ZIP is enough.",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "show_items",
    description:
      "Put menu items on screen as tappable cards, each with its price and an Add " +
      "button. Use this instead of listing items in your text: a card is one tap to " +
      "the basket and a paragraph is not. Call it alongside your reply whenever you " +
      "mention two or more items, recommend a specific one, or end your message " +
      "inviting them to choose. Asking 'anything sound good?' without calling this " +
      "asks somebody to react to nothing. Naming categories is not showing: " +
      "'bagels, sandwiches and spreads' is four shelves, not four things to pick " +
      "between. Keep your text about *why*; let the cards carry the names and prices.",
    input_schema: {
      type: "object",
      properties: {
        slugs: {
          type: "array",
          items: { type: "string" },
          description: "Up to 4 item slugs, most relevant first.",
        },
      },
      required: ["slugs"],
    },
  },
  {
    name: "suggest_replies",
    description:
      "Offer two or three short things they might say next, as tappable chips. Use " +
      "them for the obvious follow-ups. 'What's on it?', 'Add it', 'Something " +
      "without dairy', so answering is a tap. Write them as the visitor would say " +
      "them, not as menu options. Reach for this whenever you would otherwise " +
      "offer a direction in prose: 'want to hear what's popular?' is a question " +
      "with a tappable answer, so make it one instead of asking permission. Skip " +
      "them when you've asked a direct question that needs a real answer, like an " +
      "address.",
    input_schema: {
      type: "object",
      properties: {
        replies: {
          type: "array",
          items: { type: "string" },
          description: "Two or three, each a handful of words.",
        },
      },
      required: ["replies"],
    },
  },
  {
    name: "add_to_basket",
    description:
      "Put an item in their basket. Only when they've asked for it. 'add it', 'I'll " +
      "take two', 'sounds good, get me that', and never on your own initiative or " +
      "to be helpful. Every required choice must be filled in; call get_item first if you " +
      "don't know what they are, and ask them rather than guessing which bagel they " +
      "want. This does not place or pay for anything: the basket opens so they can see " +
      "what went in, and checkout is still theirs to press.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        quantity: { type: "integer", description: "Default 1." },
        options: {
          type: "object",
          description: "Every required choice, e.g. {\"bagel\":\"plain\",\"spread\":\"none\"}.",
          additionalProperties: { type: "string" },
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "open_screen",
    description:
      "Offer a button that takes them somewhere in the app. Use it at the end of a " +
      "thread of conversation: checkout once the basket is right, locations to set a " +
      "delivery address, account to find an order. One button, and only when there's a " +
      "clear next step; a button on every reply is navigation, not help.",
    input_schema: {
      type: "object",
      properties: {
        screen: {
          type: "string",
          enum: ["menu", "basket", "checkout", "locations", "account", "gift"],
        },
        label: {
          type: "string",
          description: "What the button says, e.g. 'Go to checkout'. A few words.",
        },
      },
      required: ["screen", "label"],
    },
  },
];

// ——— Executing them ———

type ToolResult = {
  // What Riley sees. Kept compact: this comes back into her context on every
  // subsequent turn of the conversation.
  forModel: unknown;
  // What the browser gets. Merged across every tool call in a turn.
  attach?: Partial<ChatAttachments>;
};

/** A delivery address the customer has already settled, with the point they
 *  placed on it. */
export type Destination = { address: string; lat: number; lng: number };

/** What a tool needs from the request that the model has no way to supply.
 *
 *  Passed in rather than read here, because both fields belong to the caller
 *  and this module has no request to read them from. */
export type ToolContext = {
  /** Claims one of this caller's delivery-quote allowance, returning false
   *  when there is none left. A function and not a number because it counts:
   *  the tool that spends money is the tool that should mark the spend, and
   *  a caller who never asks about delivery should never use any of it. */
  quotesLeft: () => boolean;
  /** Where their order is already going, when they've chosen. */
  destination?: Destination;
  /** The counter they are collecting from, when they have picked one.
   *
   *  Absent for delivery, which leaves from the kitchen and can have
   *  anything. Present so Riley does not offer a sandwich to somebody
   *  standing at a counter that cannot make one — the order endpoint refuses
   *  it either way, but being told no by the shop after being offered it by
   *  the shop is worse than not being offered it. */
  orderAt?: string;
};

// Two addresses are the same address if they're the same words. Deliberately
// crude: this decides whether the customer's own pin can stand in for a
// geocode, so it has to be *sure*, and the way to be sure is to only say yes
// when Riley is repeating back the string the app gave her. Anything looser
// ("close enough") would silently answer a question about somebody's office
// with the coordinates of their flat.
function sameAddress(a: string, b: string): boolean {
  const flatten = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return flatten(a).length > 0 && flatten(a) === flatten(b);
}

function cardFor(product: Product): ProductCard {
  // A group with no default has to be answered before the item can go in a
  // basket — see OptionGroup.defaultChoiceId.
  // Group *ids*, not labels: the card is rendered in whatever language the
  // visitor chose, and the id is the only part of a group that survives the
  // trip. See ProductCard.needs.
  const needs = (product.options ?? [])
    .filter((group) => !group.defaultChoiceId)
    .map((group) => group.id);
  return {
    slug: product.slug,
    name: product.name,
    description: product.description,
    priceCents: product.priceCents,
    swatch: product.swatch,
    soldOut: soldOut(product.slug),
    needs,
  };
}

// The shape a menu item takes in Riley's context. Deliberately not the whole
// Product: the swatch hex and the alias list are for the catalog, and every
// token here is one she carries for the rest of the conversation.
function itemForModel(product: Product) {
  return {
    slug: product.slug,
    name: product.name,
    price: formatPrice(product.priceCents),
    priceCents: product.priceCents,
    category: product.category,
    description: product.description,
    soldOutToday: soldOut(product.slug),
    choices: (product.options ?? []).map((group) => ({
      id: group.id,
      label: group.label,
      required: !group.defaultChoiceId,
      // A group that takes a multiset rather than one answer, and how to
      // write one. Told rather than assumed: without this Riley would send
      // {"bagel":"everything"} for a dozen somebody asked to be split, and
      // that is a dozen everything bagels, silently.
      mix: group.mix
        ? {
            countGroup: group.countGroupId,
            format:
              'counts summing to the chosen count, e.g. "plain*6+everything*6" ' +
              'for a dozen split evenly. One flavour throughout is just its id.',
          }
        : undefined,
      options: group.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        extra: choice.priceCents > 0 ? formatPrice(choice.priceCents) : undefined,
      })),
    })),
    mayContain: possibleAllergens(product).map((allergen) => ALLERGEN_LABEL[allergen]),
  };
}

// "Open until 2pm" / "Closed · opens tomorrow at 7am", as parts rather than a
// sentence. openingStatus().label is the same fact already written out in
// English, which is fine for Riley's own context and useless on a card that a
// Korean speaker is looking at.
function statusPhrase(): Phrase {
  if (isOpenNow()) {
    // ⚠️ 24 means there is no closing time: SHOP_OPEN_PREVIEW is on and the
    // gate has been told the counter never shuts. The obvious `closeHour() %
    // 24` turns that into 0, and clockLabel(0) is "12am", so the card claimed
    // the shop closes at midnight while Riley's own briefing, which reads
    // CLOSE_HOUR, said 4pm. Nothing to name is not the same as midnight.
    const closes = closeHour();
    if (closes >= 24) return { key: "chat.hoursOpenNow" };
    return { key: "shop.openUntil", hour: closes };
  }
  const next = nextOpeningAt();
  if (!next) return { key: "shop.closed" };
  return {
    key:
      next.when === "today"
        ? "shop.closedOpensToday"
        : next.when === "tomorrow"
          ? "shop.closedOpensTomorrow"
          : "shop.closedOpensDay",
    hour: next.hour,
    day: next.day,
  };
}

function asOptions(raw: unknown): SelectedOptions {
  if (typeof raw !== "object" || raw === null) return {};
  const out: SelectedOptions = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export async function runTool(
  name: string,
  input: unknown,
  context: ToolContext,
): Promise<ToolResult> {
  const args = (input ?? {}) as Record<string, unknown>;

  // What's off the board, before anything reads it. Riley is the surface that
  // states availability in a sentence rather than dimming a tile, so she is
  // the one that must not be a deploy behind. Cached for thirty seconds in
  // app/soldOut.ts, so this is a map read on all but the first call of a
  // conversation.
  await refreshSoldOut();

  switch (name) {
    case "search_menu": {
      const query = typeof args.query === "string" ? args.query.trim() : "";
      const category = typeof args.category === "string" ? args.category : null;
      const without = typeof args.without_allergen === "string" ? args.without_allergen : null;
      const maxCents =
        typeof args.max_price_cents === "number" ? args.max_price_cents : null;

      let found: Product[] = query.length > 0 ? searchProducts(query, 12) : [...PRODUCTS];
      if (category) found = found.filter((product) => product.category === category);
      if (maxCents !== null) found = found.filter((product) => product.priceCents <= maxCents);
      if (without) {
        found = found.filter(
          (product) => !possibleAllergens(product).some((allergen) => allergen === without),
        );
      }

      return {
        forModel: {
          count: found.length,
          items: found.slice(0, 8).map(itemForModel),
          // Said every time, because the honest answer to "is this dairy free"
          // is never yes on a counter with one toaster.
          allergenCaveat:
            "Ingredient lists, not safety guarantees: one counter, shared boards, one toaster.",
        },
      };
    }

    case "get_item": {
      const product = getProduct(String(args.slug ?? ""));
      if (!product) return { forModel: { error: "No item with that slug." } };
      const chosen = normalizeOptions(product, asOptions(args.options));
      return {
        forModel: {
          ...itemForModel(product),
          withTheseChoices: {
            chosen: describeOptions(product, chosen),
            price: formatPrice(unitPriceCents(product, chosen)),
            contains: allergensFor(product, chosen).map((allergen) => ALLERGEN_LABEL[allergen]),
            // The dietary half of the same question. Separate from `contains`
            // because they answer different things: that one is "will this hurt
            // me", this is "will I eat this", and meat and honey appear on
            // neither allergen list.
            dietary: dietaryFlagsFor(product, chosen),
          },
        },
      };
    }

    case "price_order": {
      const raw = Array.isArray(args.items) ? args.items : [];
      const lines: {
        slug: string;
        name: string;
        quantity: number;
        each: string;
        lineCents: number;
      }[] = [];
      let subtotalCents = 0;

      for (const entry of raw) {
        const row = (entry ?? {}) as Record<string, unknown>;
        const product = getProduct(String(row.slug ?? ""));
        if (!product) continue;
        const quantity = Math.max(1, Math.min(Number(row.quantity) || 1, 20));
        const chosen = normalizeOptions(product, asOptions(row.options));
        const each = unitPriceCents(product, chosen);
        subtotalCents += each * quantity;
        lines.push({
          slug: product.slug,
          name: product.name,
          quantity,
          each: formatPrice(each),
          lineCents: each * quantity,
        });
      }

      const totals = totalsFor({ subtotalCents });
      return {
        forModel: {
          lines,
          subtotal: formatPrice(totals.subtotalCents),
          tax: formatPrice(totals.taxCents),
          total: formatPrice(totals.totalCents),
          note: "Delivery, if any, is quoted separately at checkout. Tip is theirs to set.",
        },
        attach: {
          info: [
            {
              kind: "totals",
              title: { key: "chat.totalsTitle" },
              lines: [
                ...lines.map((line) => ({
                  // The slug, not the name: the browser has the menu tables
                  // and this module has the English. See Phrase.
                  label: {
                    key: "chat.totalsLine" as const,
                    item: line.slug,
                    vars: { quantity: line.quantity },
                  },
                  value: { text: formatPrice(line.lineCents) },
                })),
                { label: { key: "checkout.tax" }, value: { text: formatPrice(totals.taxCents) } },
                { label: { key: "common.total" }, value: { text: formatPrice(totals.totalCents) } },
              ],
              note: { key: "chat.totalsNote" },
            },
          ],
        },
      };
    }

    case "check_diet": {
      const diet = String(args.diet ?? "");
      if (!DIETS.some((known) => known === diet)) {
        return { forModel: { error: "Unknown diet." } };
      }
      const eligible = PRODUCTS.filter((product) => product.category !== "Gift Cards");
      const of = (fit: "yes" | "with-choices") =>
        eligible
          .filter((product) => dietFit(product, diet as (typeof DIETS)[number]) === fit)
          .filter((product) => !soldOut(product.slug));

      return {
        forModel: {
          diet,
          // Split rather than one list, because "yes" and "yes if you skip the
          // cream cheese" are different things to tell somebody, and flattening
          // them is how a vegan gets handed a sandwich with dairy in it.
          suits: of("yes").map((product) => ({
            slug: product.slug,
            name: product.name,
            price: formatPrice(product.priceCents),
          })),
          suitsWithChoices: of("with-choices").map((product) => ({
            slug: product.slug,
            name: product.name,
            price: formatPrice(product.priceCents),
            // Only the choices that keep it inside the diet. Offer these by
            // name rather than saying "some of the spreads work".
            choose: choicesFor(product, diet as (typeof DIETS)[number]),
          })),
          // The one thing this shop cannot do, said before anybody has to ask
          // twice. Every bagel and every sandwich is wheat.
          note:
            "There is nothing gluten-free on the menu: every bagel is wheat, so every " +
            "sandwich is too. The spreads and the drinks have no wheat in them, but they " +
            "are made and served in the same place. " +
            ALLERGEN_NOTE,
        },
      };
    }

    case "check_hours": {
      // ——— Whose hours ———
      //
      // "Are we open" stopped having one answer the day the counters stopped
      // opening together: between 7 and 11 the store is open and the outlet
      // is dark. So this answers for the counter the customer is actually
      // collecting from when there is one, and for the earliest-opening
      // counter when there is not — which is the honest answer to "are you
      // open" asked by somebody who has not chosen yet, since one of them is.
      //
      // Every counter's own hours ride along regardless. Riley is asked "what
      // time do you open" as often as "are you open now", and the second
      // question is the one a single boolean cannot answer.
      const counter = storeById(context.orderAt ?? null);
      const hour = opensAt(counter);
      const status = openingStatus(new Date(), hour);
      const open = isOpenNow(new Date(), hour);
      const left = minutesUntilClose(new Date(), hour);
      const accepting = open && left >= PREP_MINUTES;
      return {
        forModel: {
          forCounter: counter?.name ?? null,
          openNow: open,
          status: status.label,
          minutesUntilClose: open ? left : null,
          acceptingOrders: accepting,
          nextOpening: open ? null : nextOpening(new Date(), hour),
          prepMinutes: PREP_MINUTES,
          counters: LOCATIONS.map((store) => ({
            name: store.name,
            hours: store.hours,
            openNow: isOpenNow(new Date(), opensAt(store)),
            makesSandwiches: servesCategory(store.id, "Sandwiches"),
          })),
        },
        attach: {
          info: [
            {
              kind: "hours",
              title: open ? { key: "chat.hoursOpenNow" } : { key: "shop.closed" },
              lines: [
                // status.label is English prose, so it can't go on a card. The
                // same fact, in parts the browser can put into a sentence: the
                // hour, and which key to put it in. Same three keys the
                // checkout's closed notice uses.
                { label: { key: "chat.hoursStatus" }, value: statusPhrase() },
                {
                  label: accepting ? { key: "chat.hoursReadyIn" } : { key: "chat.hoursOrdering" },
                  value: accepting
                    ? { key: "chat.aboutMinutes", vars: { minutes: PREP_MINUTES } }
                    : { key: "chat.notRightNow" },
                },
              ],
            },
          ],
        },
      };
    }

    case "check_delivery": {
      const address = typeof args.address === "string" ? args.address.trim() : "";
      if (!address) return { forModel: { error: "No address given." } };

      // ——— The customer's own point, when this is the address they set ———
      //
      // She is often asking about the address the app already has, because
      // they told her about it and it's on the fulfillment bar behind her.
      // That address has a coordinate attached that the *customer* placed on
      // a map, and geocoding the words again throws it away to substitute a
      // guess. PinPicker exists to stop exactly that, and this was the last
      // hop still doing it. Only when the strings match: see sameAddress.
      const pinned =
        context.destination && sameAddress(address, context.destination.address)
          ? context.destination
          : null;

      // Chosen against the destination when there is one, so the kitchen that
      // serves this address is the one the distance is measured from. Without
      // a point there is nothing to choose against until the geocode lands, so
      // the first delivering kitchen biases that lookup and the real origin is
      // taken after — the same order /api/delivery/quote runs in.
      const biasFrom = await deliveryOrigin(pinned ? [pinned.lat, pinned.lng] : undefined);

      const place = pinned ?? (await geocode(address, biasFrom));
      if (!place) {
        return {
          forModel: {
            found: false,
            message: "Couldn't find that address. Ask them for the city or ZIP.",
          },
        };
      }

      // Now the destination is known either way, settle which kitchen it
      // leaves from. The store and not just its point, because Uber is handed
      // an address as well as a coordinate and those two have to name the same
      // counter. This used to be the SHOP_ADDRESS_PARTS constant, which was
      // right while there was one kitchen and quietly wrong the day there are
      // two: Riley would quote every address in the city from Koreatown while
      // the checkout beside her quoted it from wherever is nearest.
      const { store, place: pickup } = await deliveryStoreFor([place.lat, place.lng]);
      const origin = pickup.position;

      const drive = await driveBetween(origin, [place.lat, place.lng]);
      const miles = drive?.miles ?? null;
      const inRadius = miles === null || miles <= DELIVERY_RADIUS_MILES;

      if (!inRadius) {
        return {
          forModel: {
            found: true,
            address: place.address,
            drivingMiles: miles,
            deliverable: false,
            radiusMiles: DELIVERY_RADIUS_MILES,
            message: "Outside the delivery area. Pickup is still open to them.",
          },
          attach: {
            info: [
              {
                kind: "delivery",
                title: { key: "chat.deliveryOutOfRange" },
                lines: [
                  // The address as `text`: a street address is the one thing
                  // on this card that reads the same in every language.
                  { label: { key: "chat.deliveryAddressLabel" }, value: { text: place.address } },
                  {
                    label: { key: "chat.deliveryDistance" },
                    value: { key: "chat.drivingMiles", vars: { miles: miles?.toFixed(1) ?? "" } },
                  },
                  {
                    label: { key: "chat.deliveryWithin" },
                    value: { key: "chat.milesPlain", vars: { miles: DELIVERY_RADIUS_MILES } },
                  },
                ],
              },
            ],
          },
        };
      }

      if (!isUberConfigured()) {
        return {
          forModel: {
            found: true,
            address: place.address,
            drivingMiles: miles,
            deliverable: null,
            message: "Delivery can't be priced right now. Don't quote a fee.",
          },
        };
      }

      // The one billed call in this file, and the only place a chat message
      // reaches a vendor who invoices per request. Claimed here rather than at
      // the top of the tool so the free half still answers: somebody who has
      // used their allowance can still be told whether an address is in range,
      // which is most of what they wanted.
      if (!context.quotesLeft()) {
        return {
          forModel: {
            found: true,
            address: place.address,
            drivingMiles: miles,
            deliverable: null,
            message:
              "In range, but the fee can't be priced right now. Don't quote one. " +
              "Tell them the checkout quotes it for their address.",
          },
        };
      }

      const quote = await quoteDelivery({
        pickupAddress: structuredAddress(addressParts(store)),
        pickupLat: origin[0],
        pickupLng: origin[1],
        dropoffAddress: place.address,
        dropoffLat: place.lat,
        dropoffLng: place.lng,
        readyAt: new Date(Date.now() + PREP_MINUTES * 60_000),
      });

      if (!quote.ok) {
        return {
          forModel: {
            found: true,
            address: place.address,
            drivingMiles: miles,
            deliverable: quote.undeliverable ? false : null,
            message: quote.undeliverable
              ? "No courier will take that address right now. Pickup is still open."
              : "Couldn't price it just now. Don't quote a fee.",
          },
        };
      }

      // What the customer pays, not what the courier charges.
      //
      // Riley reads this straight out into a sentence, and the shop absorbs
      // half of every delivery fee — so quoting the raw quote here would have
      // Riley naming a number nobody is charged, roughly twice the one on the
      // checkout two taps later. totalsFor() is the only thing allowed to work
      // out a customer's delivery charge; this asks it rather than halving the
      // number itself, so the chat and the bill cannot drift apart.
      //
      // Only the charged figure goes to the model. Handing it the courier's
      // quote as well invites it to narrate the difference, and the shop paying
      // part of a delivery fee is not something a customer needs told twice —
      // or at all, in a chat message about whether we come to their street.
      //
      // No subtotal is passed: the free-delivery threshold is about a basket
      // and this tool answers a question about an address, often before there
      // is one. That makes this the un-waived price, which is the right thing
      // to quote — it is what they pay unless their order grows into a better
      // answer, and a fee that turns out to be zero is a welcome surprise in a
      // way that one which turns out to be double is not.
      const charged = totalsFor({
        subtotalCents: 0,
        deliveryCents: quote.quote.feeCents,
      });

      return {
        forModel: {
          found: true,
          address: place.address,
          drivingMiles: miles,
          deliverable: true,
          fee: formatPrice(charged.deliveryCents),
          etaMinutes: quote.quote.etaMinutes,
        },
        attach: {
          info: [
            {
              kind: "delivery",
              title: { key: "chat.deliveryYes" },
              lines: [
                { label: { key: "chat.deliveryAddressLabel" }, value: { text: place.address } },
                {
                  label: { key: "chat.deliveryFeeLabel" },
                  value: { text: formatPrice(charged.deliveryCents) },
                },
                ...(quote.quote.etaMinutes !== null
                  ? [
                      {
                        label: { key: "chat.deliveryEta" as const },
                        value: {
                          key: "chat.aboutMinutes" as const,
                          vars: { minutes: quote.quote.etaMinutes },
                        },
                      },
                    ]
                  : []),
              ],
              note: { key: "chat.deliveryQuoteNote" },
            },
          ],
        },
      };
    }

    case "show_items": {
      const slugs = Array.isArray(args.slugs) ? args.slugs.slice(0, 4) : [];
      const products = slugs
        .map((slug) => getProduct(String(slug)))
        .filter((product): product is Product => product !== undefined);
      return {
        forModel: { shown: products.map((product) => product.name) },
        attach: { products: products.map(cardFor) },
      };
    }

    case "suggest_replies": {
      const replies = (Array.isArray(args.replies) ? args.replies : [])
        .filter((reply): reply is string => typeof reply === "string")
        // Scrubbed like her prose is. A chip is text Riley wrote, and the rule
        // about dashes doesn't stop applying because the words ended up on a
        // button: "Something without dairy — vegan?" used to ship intact
        // underneath a paragraph held to the opposite standard.
        .map((reply) => noEmDashes(reply).trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 3);
      return { forModel: { ok: true }, attach: { chips: replies } };
    }

    case "add_to_basket": {
      const product = getProduct(String(args.slug ?? ""));
      if (!product) return { forModel: { error: "No item with that slug." } };
      if (soldOut(product.slug)) {
        return { forModel: { error: `${product.name} sold out today.` } };
      }
      // Not made at the counter this order is going to. The same refusal
      // /api/shop-order gives, given here so the basket never holds a line
      // that checkout will bounce — and phrased so Riley can say what the
      // alternative is rather than only that she failed.
      if (!servesProduct(context.orderAt ?? null, product)) {
        return {
          forModel: {
            error:
              `${product.name} is not made at the counter this order is going to. ` +
              `Offer to collect it from Wilshire Blvd instead, or suggest something ` +
              `this counter does make.`,
          },
        };
      }

      // ——— The clock, and what it now stops ———
      //
      // This used to refuse everything out of hours. The reason was sound: at
      // 3am Riley would cheerfully fill a basket and the refusal arrived
      // several screens later at checkout, by which point somebody has picked
      // a bagel, picked a spread and pressed a button for nothing.
      //
      // A shut counter is no longer a refusal for a **pickup** — the checkout
      // gives it a collection time and the order goes through. So the gate is
      // narrowed to the case that is still genuinely refused: a delivery
      // outside opening hours, which has no courier to book and no way to be
      // scheduled. Leaving it as it was would mean Riley refusing to fill a
      // basket the app is perfectly willing to take.
      //
      // Against the chosen counter's own hours, not the shop's. Wilshire opens
      // at 7 and the outlet at 11, and this was asking the default question of
      // both.
      const scheduledPickup = typeof context.orderAt === "string";
      if (!isOpenNow(new Date(), opensAt(storeById(context.orderAt ?? null))) && !scheduledPickup) {
        return {
          forModel: {
            added: false,
            openNow: false,
            nextOpening: nextOpening(),
            message:
              "We're shut, and this order is a delivery, which cannot be " +
              "scheduled — a courier can't be booked for the morning. Tell them " +
              "when we open, and offer a pickup instead, which can be ordered now " +
              "and collected at a time they choose at the checkout. Do not say " +
              "anything was added.",
          },
        };
      }
      // Some things in the catalog are not sold through this basket — a gift
      // card is not food and cannot ride in a food order. She can talk about
      // one and say where to buy it; she cannot bag it. addItem refuses these
      // too, so an attach that slipped past here would silently do nothing,
      // and a Riley who says "added" about nothing is the failure to avoid.
      if (product.offsite) {
        return {
          forModel: {
            added: false,
            buyItAt: product.offsite.href,
            message:
              `${product.name} isn't sold through the basket — it isn't food and ` +
              `can't go into a food order. Tell them where to buy it. Do not say ` +
              `it was added.`,
          },
        };
      }

      const chosen = normalizeOptions(product, asOptions(args.options));
      // A group with no default that still isn't answered can't be made. Riley
      // is told which one is missing so she can ask rather than pick — a bagel
      // guessed on somebody's behalf is a bagel they didn't order.
      // groupAnswered, not "is there a value": a pack of twelve with six
      // flavours chosen has a value for the bagel group and is still six
      // bagels short. The same function decides whether the add button is on,
      // so Riley can't put something in a basket the shop's own UI would
      // refuse. See products.ts.
      const missing = (product.options ?? []).filter(
        (group) => !groupAnswered(product, chosen, group),
      );
      if (missing.length > 0) {
        return {
          forModel: {
            added: false,
            needs: missing.map((group) => ({
              id: group.id,
              label: group.label,
              options: group.choices.map((choice) => choice.label),
            })),
            message: `Ask them which ${missing[0].label.toLowerCase()} they want, then call this again.`,
          },
        };
      }

      const quantity = Math.max(1, Math.min(Number(args.quantity) || 1, 20));
      // Added while the counter is shut, which is now allowed and is not the
      // same as added at noon. Riley cannot see which slots are free, so she
      // is told that a time gets chosen rather than told a time — a minute
      // from her that the checkout then contradicts is worse than no minute.
      const forLater =
        scheduledPickup &&
        !isOpenNow(new Date(), opensAt(storeById(context.orderAt ?? null)));
      return {
        forModel: {
          added: true,
          item: product.name,
          quantity,
          chosen: describeOptions(product, chosen),
          each: formatPrice(unitPriceCents(product, chosen)),
          ...(forLater
            ? {
                collectLater: true,
                message:
                  "We're shut, so this one is for collection later. They pick the " +
                  "time at the checkout, where the earliest available is already " +
                  "selected. Say that rather than naming a time yourself.",
              }
            : {}),
        },
        attach: {
          actions: [
            {
              type: "add_to_basket",
              slug: product.slug,
              name: product.name,
              quantity,
              options: chosen,
            },
          ],
        },
      };
    }

    case "open_screen": {
      const screen = String(args.screen ?? "");
      const allowed = ["menu", "basket", "checkout", "locations", "account", "gift"] as const;
      if (!allowed.includes(screen as (typeof allowed)[number])) {
        return { forModel: { error: "Unknown screen." } };
      }
      // Same scrub as the chips, for the same reason.
      const label = noEmDashes(String(args.label ?? "Open")).slice(0, 32);
      return {
        forModel: { ok: true },
        attach: {
          actions: [{ type: "open", screen: screen as (typeof allowed)[number], label }],
        },
      };
    }

    default:
      return { forModel: { error: `No tool called ${name}.` } };
  }
}
