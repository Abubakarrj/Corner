import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import {
  ALLERGEN_LABEL,
  allergensFor,
  CATEGORIES,
  describeOptions,
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
import { totalsFor } from "../../shop/money";
import type { ChatAttachments, ProductCard } from "../../shop/chatTypes";
import {
  isOpenNow,
  minutesUntilClose,
  nextOpening,
  openingStatus,
  PREP_MINUTES,
  SHOP_ADDRESS_PARTS,
} from "../../shopFacts";
import { DELIVERY_ORIGIN, DELIVERY_RADIUS_MILES } from "../../(marketing)/locations/locations";
import { driveBetween, geocode } from "../../googleMaps";
import { isUberConfigured, quoteDelivery, structuredAddress } from "../../uberDirect";

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
      "Search the live menu. Call this before naming any item, price, or ingredient. " +
      "never answer from memory, because prices and availability change and a wrong " +
      "price costs somebody a trip. Also call it when asked what's vegetarian, what " +
      "has no dairy, what's under a price, or what's in a category. Returns each " +
      "item's real price, description, required choices, allergens and whether it " +
      "sold out today.",
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
            "A specific combination to price and check allergens for, e.g. {\"bagel\":\"sesame\",\"spread\":\"scallion\"}.",
          additionalProperties: { type: "string" },
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "price_order",
    description:
      "Work out what a basket comes to. subtotal, tax and total. ALWAYS call this " +
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
      "depends on the time. 'are you open', 'can I order now', 'when will it be " +
      "ready'. rather than assuming.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "check_delivery",
    description:
      "Whether a courier will deliver to an address, how far it is by road, what the " +
      "delivery costs and how long it takes. Call this the moment somebody gives an " +
      "address or asks whether you deliver to them. Never guess a delivery fee. it's " +
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
      "button. Use this instead of listing items in your text. a card is one tap to " +
      "the basket and a paragraph is not. Call it alongside your reply whenever you " +
      "mention two or more items, or recommend a specific one. Keep your text about " +
      "*why*; let the cards carry the names and prices.",
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
      "without dairy'. so answering is a tap. Write them as the visitor would say " +
      "them, not as menu options. Skip them when you've asked a direct question that " +
      "needs a real answer, like an address.",
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
      "take two', 'sounds good, get me that'. never on your own initiative or to be " +
      "helpful. Every required choice must be filled in; call get_item first if you " +
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
      "thread of conversation. checkout once the basket is right, locations to set a " +
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

function cardFor(product: Product): ProductCard {
  // A group with no default has to be answered before the item can go in a
  // basket — see OptionGroup.defaultChoiceId.
  const needs = (product.options ?? [])
    .filter((group) => !group.defaultChoiceId)
    .map((group) => group.label);
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
      options: group.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        extra: choice.priceCents > 0 ? formatPrice(choice.priceCents) : undefined,
      })),
    })),
    mayContain: possibleAllergens(product).map((allergen) => ALLERGEN_LABEL[allergen]),
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

export async function runTool(name: string, input: unknown): Promise<ToolResult> {
  const args = (input ?? {}) as Record<string, unknown>;

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
            "Ingredient lists, not safety guarantees. one counter, shared boards, one toaster.",
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
          },
        },
      };
    }

    case "price_order": {
      const raw = Array.isArray(args.items) ? args.items : [];
      const lines: { name: string; quantity: number; each: string; lineCents: number }[] = [];
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
              title: "What that comes to",
              lines: [
                ...lines.map((line) => ({
                  label: `${line.quantity}× ${line.name}`,
                  value: formatPrice(line.lineCents),
                })),
                { label: "Tax", value: formatPrice(totals.taxCents) },
                { label: "Total", value: formatPrice(totals.totalCents) },
              ],
              note: "Before delivery and tip.",
            },
          ],
        },
      };
    }

    case "check_hours": {
      const status = openingStatus();
      const open = isOpenNow();
      const left = minutesUntilClose();
      const accepting = open && left >= PREP_MINUTES;
      return {
        forModel: {
          openNow: open,
          status: status.label,
          minutesUntilClose: open ? left : null,
          acceptingOrders: accepting,
          nextOpening: open ? null : nextOpening(),
          prepMinutes: PREP_MINUTES,
        },
        attach: {
          info: [
            {
              kind: "hours",
              title: open ? "Open now" : "Closed",
              lines: [
                { label: "Status", value: status.label },
                {
                  label: accepting ? "Ready in" : "Ordering",
                  value: accepting ? `about ${PREP_MINUTES} min` : "not right now",
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

      const place = await geocode(address, DELIVERY_ORIGIN.position);
      if (!place) {
        return {
          forModel: {
            found: false,
            message: "Couldn't find that address. Ask them for the city or ZIP.",
          },
        };
      }

      const drive = await driveBetween(DELIVERY_ORIGIN.position, [place.lat, place.lng]);
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
                title: "Out of range",
                lines: [
                  { label: "Address", value: place.address },
                  { label: "Distance", value: `${miles?.toFixed(1)} driving miles` },
                  { label: "We deliver within", value: `${DELIVERY_RADIUS_MILES} miles` },
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

      const quote = await quoteDelivery({
        pickupAddress: structuredAddress(SHOP_ADDRESS_PARTS),
        pickupLat: DELIVERY_ORIGIN.position[0],
        pickupLng: DELIVERY_ORIGIN.position[1],
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

      return {
        forModel: {
          found: true,
          address: place.address,
          drivingMiles: miles,
          deliverable: true,
          fee: formatPrice(quote.quote.feeCents),
          etaMinutes: quote.quote.etaMinutes,
        },
        attach: {
          info: [
            {
              kind: "delivery",
              title: "We deliver there",
              lines: [
                { label: "Address", value: place.address },
                { label: "Delivery", value: formatPrice(quote.quote.feeCents) },
                ...(quote.quote.etaMinutes !== null
                  ? [{ label: "At the door in", value: `about ${quote.quote.etaMinutes} min` }]
                  : []),
              ],
              note: "Quoted for this address. the checkout re-quotes before you pay.",
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
        .map((reply) => reply.trim().slice(0, 40))
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

      const chosen = normalizeOptions(product, asOptions(args.options));
      // A group with no default that still isn't answered can't be made. Riley
      // is told which one is missing so she can ask rather than pick — a bagel
      // guessed on somebody's behalf is a bagel they didn't order.
      const missing = (product.options ?? []).filter((group) => !chosen[group.id]);
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
      return {
        forModel: {
          added: true,
          item: product.name,
          quantity,
          chosen: describeOptions(product, chosen),
          each: formatPrice(unitPriceCents(product, chosen)),
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
      const label = String(args.label ?? "Open").slice(0, 32);
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
