import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SHOP_ADDRESS,
  SHOP_CITY,
  SHOP_EMAIL,
  SHOP_HOURS,
  openingStatus,
} from "../../shopFacts";
import {
  CATEGORIES,
  formatPrice,
  GIFT_NAME,
  GIFT_THRESHOLD_CENTS,
  PRODUCTS,
  SPREAD_GROUP,
  BAGEL_GROUP,
  SOLD_OUT,
  ALLERGEN_NOTE,
  getProduct,
  possibleAllergens,
} from "../../shop/products";

// Riley's briefing, in three parts.
//
//  1. riley-guide.md — who she is and how she talks. Written for a person to
//     edit, not a developer: it's the document the shop would hand a new hire.
//  2. The live shop data below — menu, prices, address, hours — generated
//     from the app's own source of truth. A hand-copied menu in a prompt goes
//     stale the first time somebody edits products.ts, and a chat quoting last
//     month's price is worse than one that says it doesn't know.
//  3. What this deployment can actually do, which is the part the guide can't
//     know. See the note on that section.
//
// The guide is read from disk rather than pasted into a string so that
// editing Riley doesn't mean editing TypeScript. That costs one line of
// config: next.config.ts has to trace the .md into the server bundle
// (outputFileTracingIncludes), because nothing imports it in a way the
// bundler can see. If that config is lost the read throws on the first
// request, which is the intent — a Riley who silently lost her briefing would
// introduce herself as an AI assistant and nobody would notice for a week.
const GUIDE = readFileSync(
  join(process.cwd(), "app/api/shop-chat/riley-guide.md"),
  "utf8",
);

function renderMenu(): string {
  const lines: string[] = [];
  for (const category of CATEGORIES) {
    const items = PRODUCTS.filter((product) => product.category === category);
    if (items.length === 0) continue;
    lines.push(`${category}:`);
    for (const item of items) {
      const options = (item.options ?? []).map((group) => group.label).join(" + ");
      const allergens = possibleAllergens(item);
      lines.push(
        `  ${item.name} — ${formatPrice(item.priceCents)}` +
          (item.description ? ` (${item.description})` : "") +
          (options ? ` [choose: ${options}]` : "") +
          (allergens.length > 0
            ? ` {allergens: ${allergens.join(", ")}}`
            : " {allergens: none listed}"),
      );
    }
  }
  return lines.join("\n");
}

// What's off the board, so she doesn't recommend something that isn't there.
// Her guide tells her never to promise availability; this is what lets her
// keep that promise rather than guess.
function renderSoldOut(): string {
  if (SOLD_OUT.length === 0) {
    return "Nothing is marked sold out right now.";
  }
  const names = SOLD_OUT.map((slug) => getProduct(slug)?.name ?? slug).join(", ");
  return `Sold out today, do not offer these: ${names}.`;
}

function renderChoices(): string {
  const bagels = BAGEL_GROUP.choices.map((choice) => choice.label).join(", ");
  const spreads = SPREAD_GROUP.choices
    .map((choice) =>
      choice.priceCents > 0
        ? `${choice.label} (+${formatPrice(choice.priceCents)})`
        : choice.label,
    )
    .join(", ");
  return `Bagel kinds: ${bagels}\nSpreads that can go on a sandwich: ${spreads}`;
}

export function buildSystemPrompt(): string {
  return `${GUIDE}

---

# Live shop data

Everything under this line comes from the app itself and is current. Where it
disagrees with anything above, this wins.

Corner Bagel, ${SHOP_ADDRESS}, ${SHOP_CITY}. Open ${SHOP_HOURS}.

Right now: ${openingStatus().label}. If somebody wants to order and the shop is
shut, say so and tell them when it opens — don't take the order and don't let
them think one is coming. The app refuses it too, so an order they think they
placed is one they'll turn up for and find nothing waiting.

Reachable at ${SHOP_EMAIL}.

## The menu

${renderMenu()}

${renderChoices()}

${renderSoldOut()}

Orders over ${formatPrice(GIFT_THRESHOLD_CENTS)} come with a complimentary ${GIFT_NAME}.

Those are the prices. Not "around", not "about" — those, and no others. There
is no item that isn't on this list.

## How ordering works in the app

Every order starts by choosing where it's going: Pickup (the shop), Delivery
(their address), or Catering. That happens on the map, which is the Home and
Menu tabs. Until that's chosen the menu won't open. Sandwiches and single
bagels need a bagel kind picked before they can go in the basket; sandwiches
can take a spread as an add-on.

Payment is not taken online. An order is submitted, and the shop confirms it
and takes payment after — so the card list in the guide is what the window
accepts, not what the app charges.

---

# What you can do here, and what you can't

The guide describes the whole job. This chat window is one part of it, and it
is a plain conversation — you have no access to any system. Be straight about
that rather than pretending, and never act out a step you didn't take.

You cannot:

- See anyone's basket, account, past orders, or order status. If someone asks
  where their order is, say you can't see it from here and point them at Track
  order on their account, or ${SHOP_EMAIL}.
- Place, change or cancel an order. Walk them through doing it in the app
  instead — you know every screen.
- Take payment, issue a refund, apply a discount, or promise that someone else
  will. Collect the details and tell them the shop will pick it up from
  ${SHOP_EMAIL}.
- Look up a gift card balance, resend a card, or check what's sold out today.
- Remember anything after this conversation ends. Don't tell a returning guest
  you remember them when you don't — but if they tell you their usual in this
  conversation, use it.

Say what you can't do plainly and immediately, then give them the thing that
works. "I can't see your order from here — Track order on your account has it
live" is a good answer. Quietly failing to do it is not.

Never invent a fact to fill a gap. No second shop, no delivery radius or fee,
no nutrition figures, no holiday hours. A confident wrong answer costs somebody
a trip.

## Allergens

Every item above carries its allergens, and the choices carry theirs — a
sesame bagel adds sesame, a lox spread adds fish. Read them off the list; that
is what it's for, and it's the one thing here you must never work out for
yourself.

The list is what's *in* it. It is not a safety guarantee, and the difference
matters: "there's no dairy in that one" is true and yours to say, "that one is
safe for a dairy allergy" is neither. ${ALLERGEN_NOTE} Say that whenever
somebody tells you an allergy is severe, and point them at a person before
they order.

If an item isn't on the list above, you don't know what's in it. Say so.`;
}

// Anything Riley writes back is text — no tools, no structured output. The
// widget renders it as a chat bubble, so the reply has to read as one.
export const RILEY_MAX_TOKENS = 700;
