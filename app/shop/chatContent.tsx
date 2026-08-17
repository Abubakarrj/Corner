"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale, useT } from "../i18n";
import { localeById } from "../localeScript";
import { clockLabel, weekdayLabel } from "../shopFacts";
import { useMenu, type MenuText } from "../i18n/menu";
import ProductImage from "./ProductImage";
import { formatPrice, getProduct } from "./products";
import type { ChatAction, ChatScreen, InfoCard, Phrase, ProductCard } from "./chatTypes";

// What a reply from Riley is made of, once it stops being a wall of text.
//
// The chat used to print whatever the model wrote, verbatim, into a single
// bubble. That is how "**The Veggie Stack** — $15.50" ended up on screen with
// the asterisks showing: markdown is what a model writes by default, and
// nothing here was reading it. Worse than the asterisks was the shape — a
// numbered list of items and prices, in a chat window, next to a menu where
// each of those items is a card you can tap.
//
// So a reply is now text *plus* attachments: cards for the items she named,
// a panel for an hours or delivery answer, chips for what to say next, and a
// button when there's an obvious next screen. Riley chooses them with tools
// (app/api/shop-chat/tools.ts); this file draws them.

// ——— Text ———

// Just enough markdown, rendered as React nodes rather than HTML.
//
// Deliberately not a markdown library and deliberately not
// dangerouslySetInnerHTML. Everything below builds elements, so a model that
// writes `<img onerror=...>` produces those characters on screen and nothing
// else. The subset is what actually turns up in a chat reply — bold, bullets,
// paragraphs — and anything outside it renders as the plain text it is, which
// is the right way to fail.
function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // **bold** only. Single asterisks are left alone: they're far more often a
  // literal asterisk than an italic, and a greedy rule eats the wrong ones.
  const pattern = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    nodes.push(
      <strong key={`${keyPrefix}-b${index++}`} className="font-medium">
        {match[1]}
      </strong>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function RichText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  let paragraph: string[] = [];
  let bullets: string[] = [];
  let key = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(
      <p key={`p${key++}`} className="m-0">
        {inline(paragraph.join(" "), `p${key}`)}
      </p>,
    );
    paragraph = [];
  };

  const flushBullets = () => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`u${key++}`} className="m-0 flex list-none flex-col gap-1 p-0">
        {bullets.map((item, itemIndex) => (
          <li key={itemIndex} className="flex gap-1.5">
            {/* A real bullet glyph rather than a list-style marker: the
                marker sits outside the content box and gets clipped by the
                bubble's padding at this width. */}
            <span aria-hidden className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-faint" />
            <span className="min-w-0">{inline(item, `u${key}-${itemIndex}`)}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) {
      flushBullets();
      flushParagraph();
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      bullets.push(bullet[1]);
      continue;
    }
    // A heading in a chat bubble is just an emphatic line.
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flushBullets();
      flushParagraph();
      blocks.push(
        <p key={`h${key++}`} className="m-0 font-medium">
          {inline(heading[1], `h${key}`)}
        </p>,
      );
      continue;
    }
    flushBullets();
    paragraph.push(line);
  }
  flushBullets();
  flushParagraph();

  return <div className="flex flex-col gap-2">{blocks}</div>;
}

// ——— Product cards ———

// "Choose bagel", in the visitor's language. The card carries the group's id;
// the group itself is on the product, which the browser already has.
function needLabel(menu: MenuText, slug: string, groupId: string | undefined): string {
  const group = getProduct(slug)?.options?.find((option) => option.id === groupId);
  return group ? menu.placeholder(group) : "";
}

// Whether this item has anything to choose at all — a bagel, a spread, a gift
// card's amount. Read from the catalog rather than from the wire: the card
// only carries the groups that are *required*, and a gift card whose amount
// defaults to $25 has none of those and still shouldn't be added without
// asking which one.
function configurable(slug: string): boolean {
  return (getProduct(slug)?.options?.length ?? 0) > 0;
}

// A rail, not a stack. Three items down the thread pushes the conversation off
// the top of a 344px panel; three across keeps the reply and the options on
// screen together, and the overflow is its own signal that there are more.
export function ProductCards({
  products,
  onAdd,
  onConfigure,
}: {
  products: ProductCard[];
  onAdd: (product: ProductCard) => void;
  // Opens the choices inside the panel. Optional, and the fallback is the link
  // out to the item's page — so a surface that has nowhere to put a picker
  // still behaves, rather than offering a button that does nothing.
  onConfigure?: (product: ProductCard) => void;
}) {
  const t = useT();
  const menu = useMenu();
  // Which of these have been added, so the button can say so.
  //
  // Local to this rail, which means per message, which is the right scope: the
  // rail under "here are three sandwiches" should remember that you added one
  // of them, and the rail under a later reply should start clean even if it
  // names the same item. It is a record of what you did *here*, not of what is
  // in the basket — the cart tab is for that, and reading the basket for this
  // would light up items somebody added days ago.
  const [added, setAdded] = useState<Record<string, true>>({});
  if (products.length === 0) return null;

  return (
    <div className="-mx-3.5 flex snap-x gap-2 overflow-x-auto px-3.5 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {products.map((product) => (
        <div
          key={product.slug}
          className="flex w-[132px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-line-faint bg-surface"
        >
          <Link href={`/shop/product/${product.slug}`} className="cursor-pointer">
            <ProductImage
              swatch={product.swatch}
              // A chat card is a wire payload built by the server and it
              // carries no category, so the icon comes from the menu here.
              // Undefined for an item that has since left it, which is the
              // food icon and is right for everything this shop sells.
              category={getProduct(product.slug)?.category}
              name={menu.name(product)}
              className="h-[74px] w-full rounded-none"
            />
          </Link>
          <div className="flex min-h-0 flex-1 flex-col gap-1 p-2.5">
            <Link
              href={`/shop/product/${product.slug}`}
              className="cursor-pointer text-[12px] font-medium leading-[1.3] text-ink hover:underline"
            >
              {menu.name(product)}
            </Link>
            <span className="text-[12px] text-muted">{formatPrice(product.priceCents)}</span>

            {/* Four states, and the differences matter more than they look.
                Sold out can't be added at all. Anything with a choice on it
                opens the picker rather than adding — a plus button that
                silently picked for you is how somebody gets a sesame they
                didn't ask for — and the button says which choice is waiting
                ("Choose bagel") when there is one that has to be made. */}
            {product.soldOut ? (
              <span className="mt-auto pt-1 text-[11px] text-quiet">{t("common.soldOutToday")}</span>
            ) : onConfigure && configurable(product.slug) ? (
              <button
                type="button"
                onClick={() => onConfigure(product)}
                className="cb-press mt-auto cursor-pointer rounded-full border border-line-soft px-2 py-1.5 text-center text-[11px] text-ink transition-colors hover:bg-raise"
              >
                {product.needs.length > 0
                  ? needLabel(menu, product.slug, product.needs[0])
                  : t("common.add")}
              </button>
            ) : product.needs.length > 0 ? (
              <Link
                href={`/shop/product/${product.slug}`}
                className="cb-press mt-auto cursor-pointer rounded-full border border-line-soft px-2 py-1.5 text-center text-[11px] text-ink transition-colors hover:bg-raise"
              >
                {needLabel(menu, product.slug, product.needs[0])}
              </Link>
            ) : added[product.slug] ? (
              // Stays a button rather than becoming a label: adding a second
              // one is a normal thing to want, and a control that disables
              // itself after one press is a control you have to leave the
              // conversation to work around.
              <button
                type="button"
                onClick={() => onAdd(product)}
                className="cb-press mt-auto flex cursor-pointer items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[11px] font-medium transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: "var(--cb-chat-good)",
                  color: "var(--cb-on-chat-good)",
                }}
              >
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path
                    d="M2.5 6.2 5 8.6l4.5-5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {t("chat.added")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onAdd(product);
                  setAdded((was) => ({ ...was, [product.slug]: true }));
                }}
                className="cb-press mt-auto cursor-pointer rounded-full bg-ink px-2 py-1.5 text-[11px] font-medium text-on-ink transition-opacity hover:opacity-90"
              >
                {t("common.add")}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ——— Info panels ———

// A phrase from the server, turned into words in the visitor's language.
//
// The four fields it can carry are documented on the type in chatTypes.ts, and
// each one exists because the server could not have written that fragment
// itself: a menu item's name, an hour on the clock, a weekday. Everything else
// is a key and its substitutions.
function usePhrase(): (phrase: Phrase) => string {
  const t = useT();
  const locale = useLocale();
  const menu = useMenu();
  const tag = localeById(locale).tag;

  return (phrase: Phrase) => {
    if (!phrase.key) return phrase.text ?? "";
    const product = phrase.item ? getProduct(phrase.item) : undefined;
    return t(phrase.key, {
      ...phrase.vars,
      ...(product ? { name: menu.name(product) } : null),
      ...(phrase.hour !== undefined ? { time: clockLabel(phrase.hour, tag) } : null),
      ...(phrase.day !== undefined ? { day: weekdayLabel(phrase.day, tag) } : null),
    });
  };
}

// The answer to "are you open", "do you deliver to me", "what does that come
// to" — as a small table rather than a sentence with numbers buried in it.
export function InfoPanel({ card }: { card: InfoCard }) {
  const say = usePhrase();
  return (
    <div className="rounded-2xl border border-line-faint bg-surface p-3">
      <p className="m-0 text-[12px] font-medium text-ink">{say(card.title)}</p>
      <div className="mt-1.5 flex flex-col gap-1">
        {card.lines.map((line, index) => (
          <div key={index} className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] text-muted">{say(line.label)}</span>
            <span
              className={`shrink-0 text-[12px] text-ink ${
                // The last row of a totals panel is the total.
                card.kind === "totals" && index === card.lines.length - 1 ? "font-medium" : ""
              }`}
            >
              {say(line.value)}
            </span>
          </div>
        ))}
      </div>
      {card.note ? <p className="m-0 mt-1.5 text-[11px] text-quiet">{say(card.note)}</p> : null}
    </div>
  );
}

// ——— The screen button ———

const SCREEN_HREF: Record<Extract<ChatAction, { type: "open" }>["screen"], string> = {
  menu: "/shop",
  basket: "/shop/cart",
  checkout: "/shop/checkout",
  locations: "/locations",
  account: "/shop/account",
  gift: "/gift",
};

const CHROME =
  "cb-press inline-flex cursor-pointer items-center gap-1.5 self-start rounded-full border border-ink px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-raise";

function Arrow() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M3 6h6M6.5 3.5 9 6l-2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Riley offering to take you somewhere.
//
// Two shapes, and which one you get depends on whether the panel can do the
// thing itself. The basket and the checkout live inside it now, so for those
// this is a button that flips the panel's view — and that is the whole
// handoff: she can open the sheet, and the sheet does the transaction.
// Everything else stays a link out to a page, because the panel has no map or
// account screen in it.
export function ScreenButton({
  action,
  onNavigate,
  openHere,
}: {
  action: Extract<ChatAction, { type: "open" }>;
  onNavigate: () => void;
  // Returns true if it handled the screen in place. Absent — or false — and
  // this falls back to the link, so a screen the panel gains or loses needs
  // no change here.
  openHere?: (screen: ChatScreen) => boolean;
}) {
  if (openHere && CAN_OPEN_IN_PANEL.has(action.screen)) {
    return (
      <button type="button" onClick={() => openHere(action.screen)} className={CHROME}>
        {action.label}
        <Arrow />
      </button>
    );
  }
  return (
    <Link href={SCREEN_HREF[action.screen]} onClick={onNavigate} className={CHROME}>
      {action.label}
      <Arrow />
    </Link>
  );
}

// Kept next to SCREEN_HREF so the two can't disagree about what a screen is.
const CAN_OPEN_IN_PANEL = new Set<ChatScreen>(["basket", "checkout"]);
