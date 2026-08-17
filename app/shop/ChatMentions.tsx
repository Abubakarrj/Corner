"use client";

import { useMemo, useState } from "react";
import { useT } from "../i18n";
import { useMenu } from "../i18n/menu";
import ProductImage from "./ProductImage";
import { formatPrice, PRODUCTS, searchProducts, type Product } from "./products";

// Typing @ in the chat, and getting the menu.
//
// The problem it solves is that "the lox one" is a guess and "@Good Lox Today"
// is not. Riley can search the menu herself, but a name half-remembered or
// half-spelled costs a round trip and sometimes lands on the wrong sandwich —
// so this pins the item at the moment of typing, and what goes up with the
// message is the slug, resolved against the catalog rather than against a name
// she has to match.
//
// The ranking is the shop's own `searchProducts`, deliberately: the same
// spelling that finds a sandwich in the search bar should find it here, and a
// second scoring function would eventually disagree with the first about what
// "cold" means. What's added on top is the translated name, because the search
// index is English and somebody reading the menu in Spanish is typing what
// they can see.

export type Mention = { slug: string; label: string };

// How far back from the caret an @ can be and still be the one being typed.
// A cap because a stray @ three sentences ago should not reopen a picker when
// somebody edits the middle of a message.
const TOKEN = /(^|\s)@([^\s@]{0,40})$/;

export type MentionState = {
  /** The @token being typed, or null. */
  query: string | null;
  results: Product[];
  highlighted: number;
  /** Handles the keys the list owns; returns true when it consumed the event. */
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => boolean;
  /** Where the caret is now. Called on anything that can move it. */
  syncCaret: (input: HTMLInputElement) => void;
  choose: (product: Product) => void;
  /** The mentions still present in the text, for the request. */
  resolve: (text: string) => Mention[];
  clear: () => void;
};

export function useMentions(
  draft: string,
  setDraft: (value: string) => void,
  inputRef: React.RefObject<HTMLInputElement | null>,
): MentionState {
  const menu = useMenu();
  // Everything picked while composing. Filtered down at send time to whatever
  // survived editing, so deleting "@Good Lox Today" out of the box also takes
  // the mention with it.
  const [picked, setPicked] = useState<Mention[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  // The caret, tracked rather than read during render: reading selectionStart
  // in a render is reading the DOM mid-render, and it changes on keys that
  // don't change the value at all (arrows, clicks).
  const [caret, setCaret] = useState(0);

  const at = Math.min(caret, draft.length);
  const token = TOKEN.exec(draft.slice(0, at));
  const query = token ? token[2] : null;

  const results = useMemo(() => {
    if (query === null) return [];
    const trimmed = query.trim().toLowerCase();
    // A bare @ opens on the first few, the way any mention picker does — it is
    // a menu, and a menu that needs a letter typed before it shows anything is
    // a search box wearing a menu's clothes.
    if (trimmed.length === 0) return PRODUCTS.slice(0, 6);
    const found = searchProducts(trimmed, 6);
    if (found.length >= 6) return found;
    // The English index missed some, so try what's actually on screen.
    const seen = new Set(found.map((product) => product.slug));
    const translated = PRODUCTS.filter(
      (product) =>
        !seen.has(product.slug) && menu.name(product).toLowerCase().includes(trimmed),
    );
    return [...found, ...translated].slice(0, 6);
  }, [query, menu]);

  function choose(product: Product) {
    if (!token) return;
    const label = menu.name(product);
    const start = at - token[2].length - 1;
    const next = `${draft.slice(0, start)}@${label} ${draft.slice(at)}`;
    setDraft(next);
    setPicked((was) => [...was.filter((m) => m.slug !== product.slug), { slug: product.slug, label }]);
    setHighlighted(0);

    // The caret goes after the space this just inserted. In an effect-free
    // way: the input is the source of truth for its own selection, so it gets
    // set on the element directly once React has written the new value.
    const position = start + label.length + 2;
    const input = inputRef.current;
    if (input) {
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(position, position);
        setCaret(position);
      });
    }
  }

  function syncCaret(input: HTMLInputElement) {
    setCaret(input.selectionStart ?? input.value.length);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): boolean {
    // Arrows and Home/End move the caret without changing the value, so
    // onChange never fires for them. Read the position after the browser has
    // moved it rather than trying to predict it from the key.
    const input = event.currentTarget;
    requestAnimationFrame(() => syncCaret(input));

    if (query === null || results.length === 0) return false;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % results.length);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => (index <= 0 ? results.length - 1 : index - 1));
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      choose(results[Math.min(highlighted, results.length - 1)]);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      // Closing means moving off the token, not deleting it — somebody who
      // typed an @ on purpose gets to keep it.
      setCaret(draft.length);
      return true;
    }
    return false;
  }

  return {
    query,
    results,
    highlighted: Math.min(highlighted, Math.max(results.length - 1, 0)),
    onKeyDown,
    syncCaret,
    choose,
    resolve: (text) => picked.filter((mention) => text.includes(`@${mention.label}`)),
    clear: () => {
      setPicked([]);
      setHighlighted(0);
    },
  };
}

export function MentionList({
  state,
  onSyncCaret,
}: {
  state: MentionState;
  onSyncCaret: () => void;
}) {
  const t = useT();
  const menu = useMenu();
  if (state.query === null || state.results.length === 0) return null;

  return (
    // Docked above the composer rather than floating over the thread: the
    // panel is 344px wide and a popover positioned at the caret would spend
    // its life clipped by one edge or the other.
    <div className="border-t border-line-faint bg-panel px-2 pt-2">
      <p className="m-0 px-1.5 pb-1 text-[10px] uppercase tracking-[0.07em] text-hint">
        {t("chat.mentionHeading")}
      </p>
      <ul className="m-0 flex max-h-[188px] list-none flex-col gap-0.5 overflow-y-auto p-0">
        {state.results.map((product, index) => (
          <li key={product.slug}>
            <button
              type="button"
              // onMouseDown, not onClick: the composer has focus, and a click
              // would blur it first — which on a phone closes the keyboard and
              // makes picking an item feel like leaving the message.
              onMouseDown={(event) => {
                event.preventDefault();
                state.choose(product);
                onSyncCaret();
              }}
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition-colors ${
                index === state.highlighted ? "bg-raise" : "hover:bg-raise"
              }`}
            >
              <ProductImage
                swatch={product.swatch}
                category={product.category}
                name={menu.name(product)}
                className="h-7 w-7 shrink-0 rounded-md"
              />
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                {menu.name(product)}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted">
                {formatPrice(product.priceCents)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
