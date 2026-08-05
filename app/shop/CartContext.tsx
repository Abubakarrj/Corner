"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { peekFulfillment, useFulfillment } from "../fulfillment";
import {
  describeOptions,
  getProduct,
  lineKey,
  normalizeOptions,
  optionsComplete,
  unitPriceCents,
  type Product,
  type SelectedOptions,
  soldOut,
} from "./products";

const STORAGE_KEY = "cb-shop-cart-v1";

// The most of any one thing a basket will hold. Past this the answer is
// catering, not a bigger number.
export const MAX_PER_LINE = 24;

// Which kind of order the basket was started for.
//
// A basket outlives the destination it was filled for: you can put four
// sandwiches in for pickup, go back to the map, switch to delivery, and the
// basket comes with you without a word said. Nothing about it is wrong — the
// prices are the same — but it is a different order from the one you started,
// and the basket should say so rather than let you notice at the counter.
const STARTED_KEY = "cb-cart-started-for-v1";

function readStartedFor(): string | null {
  try {
    return window.localStorage.getItem(STARTED_KEY);
  } catch {
    return null;
  }
}

function writeStartedFor(mode: string | null) {
  try {
    if (mode === null) window.localStorage.removeItem(STARTED_KEY);
    else window.localStorage.setItem(STARTED_KEY, mode);
  } catch {
    // Nothing to persist to; the note just won't appear.
  }
}

// Slug + the choices made + quantity — not a snapshot of name/price, which
// are looked up from the catalog at render time so the basket never shows
// stale pricing if the catalog changes.
//
// `options` is what makes an everything bagel and a plain one two lines
// instead of a quantity of two. Lines are addressed by lineKey(), not by
// slug, since slug alone is no longer unique in the basket.
export type CartLine = { slug: string; quantity: number; options: SelectedOptions };

const EMPTY_LINES: CartLine[] = [];

// Reading is also a migration. A cart saved before options existed has bare
// {slug, quantity} lines, and a cart saved before a choice was renamed has an
// id nothing matches — normalizeOptions repairs both, filling each group with
// its default (or dropping it, for a group like Bagel that has none).
//
// Repairing can make two lines collapse onto the same key, so they're merged
// rather than left as duplicates the quantity controls would fight over.
function readStoredLines(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_LINES;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY_LINES;

    const merged = new Map<string, CartLine>();
    for (const entry of parsed) {
      if (typeof entry !== "object" || entry === null) continue;
      const { slug, quantity, options } = entry as Partial<CartLine>;
      if (typeof slug !== "string") continue;
      if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
        continue;
      }
      const product = getProduct(slug);
      // A slug the catalog no longer has is dropped here rather than carried
      // as a row every screen has to filter out.
      if (!product) continue;

      const clean = normalizeOptions(
        product,
        typeof options === "object" && options !== null
          ? (options as SelectedOptions)
          : undefined,
      );
      const key = lineKey(slug, clean);
      const existing = merged.get(key);
      if (existing) existing.quantity += Math.floor(quantity);
      else merged.set(key, { slug, quantity: Math.floor(quantity), options: clean });
    }
    return merged.size > 0 ? [...merged.values()] : EMPTY_LINES;
  } catch {
    return EMPTY_LINES;
  }
}

// A tiny external store, module-scoped so every useCart() call in the tree
// shares one source of truth without prop drilling. useSyncExternalStore
// (rather than useState + an effect that reads localStorage) is what makes
// this hydration-safe: the server, and the client's very first render
// (before it's touched localStorage), both see EMPTY_LINES via
// getServerSnapshot; React swaps in the real persisted cart right after —
// no setState-inside-an-effect render loop, no hydration mismatch.
let lines: CartLine[] = typeof window !== "undefined" ? readStoredLines() : EMPTY_LINES;
const listeners = new Set<() => void>();

function getSnapshot() {
  return lines;
}
function getServerSnapshot() {
  return EMPTY_LINES;
}
// A second tab is a second copy of this module with its own `lines`. Without
// this, filling a basket in one tab and then adding something in another
// silently throws the first tab's work away: both write the whole array, and
// the last write wins.
//
// The `storage` event fires only in the *other* documents on the origin, which
// is exactly the ones that need to hear it — the tab that made the change
// already knows.
function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  lines = readStoredLines();
  listeners.forEach((listener) => listener());
}

function subscribe(callback: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}
function commit(next: CartLine[]) {
  lines = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing or blocked storage — the cart just doesn't persist.
  }
  listeners.forEach((listener) => listener());
}

// The price of one of this line, choices included.
export function lineUnitPriceCents(line: CartLine): number {
  const product = getProduct(line.slug);
  return product ? unitPriceCents(product, line.options) : 0;
}

type CartContextValue = {
  lines: CartLine[];
  itemCount: number;
  subtotalCents: number;
  addItem: (slug: string, quantity?: number, options?: SelectedOptions) => void;
  removeItem: (key: string) => void;
  setQuantity: (key: string, quantity: number) => void;
  setLineOptions: (key: string, options: SelectedOptions) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const currentLines = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const addItem = useCallback(
    (slug: string, quantity = 1, options?: SelectedOptions) => {
      const product = getProduct(slug);
      if (!product) return;
      // Normalised on the way in as well as on the way out, so a caller that
      // passes a half-filled or stale selection can't put a line in the
      // basket that priceOf() and describeOptions() then disagree about.
      // First thing in: remember what kind of order this basket began as.
      if (lines.length === 0) writeStartedFor(peekFulfillment()?.mode ?? null);
      const clean = normalizeOptions(product, options);
      const key = lineKey(slug, clean);
      const existing = lines.find((line) => lineKey(line.slug, line.options) === key);
      if (existing) {
        commit(
          lines.map((line) =>
            lineKey(line.slug, line.options) === key
              ? { ...line, quantity: Math.min(line.quantity + quantity, MAX_PER_LINE) }
              : line,
          ),
        );
      } else {
        commit([...lines, { slug, quantity, options: clean }]);
      }
    },
    [],
  );

  const removeItem = useCallback((key: string) => {
    commit(lines.filter((line) => lineKey(line.slug, line.options) !== key));
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    // A walk-up window is not a wholesale counter. Nothing stopped 999
    // sandwiches reaching the kitchen, and the person who does it is far more
    // likely to have leaned on the + button than to want 999 sandwiches.
    // Catering is the door for a real bulk order — see CateringModal.
    quantity = Math.min(quantity, MAX_PER_LINE);
    if (quantity <= 0) {
      commit(lines.filter((line) => lineKey(line.slug, line.options) !== key));
      return;
    }
    commit(
      lines.map((line) =>
        lineKey(line.slug, line.options) === key ? { ...line, quantity } : line,
      ),
    );
  }, []);

  // Change the choices on a line that's already in the basket.
  //
  // This exists for the line that arrives without them: a cart saved before
  // an item had options, or before a required group was added to one, has a
  // row nobody can check out with — the endpoint rejects a bagel with no
  // kind, and rightly. Without a way to answer from the basket, that row is
  // a dead end that can only be resolved by deleting something the customer
  // did choose to buy.
  //
  // Re-keys the line, so answering merges it into an identical row if one is
  // already there rather than leaving two of the same thing.
  const setLineOptions = useCallback((key: string, options: SelectedOptions) => {
    const target = lines.find((line) => lineKey(line.slug, line.options) === key);
    if (!target) return;
    const product = getProduct(target.slug);
    if (!product) return;

    const clean = normalizeOptions(product, options);
    const nextKey = lineKey(target.slug, clean);
    const rest = lines.filter((line) => lineKey(line.slug, line.options) !== key);
    const merged = rest.find((line) => lineKey(line.slug, line.options) === nextKey);

    if (merged) {
      commit(
        rest.map((line) =>
          lineKey(line.slug, line.options) === nextKey
            ? { ...line, quantity: line.quantity + target.quantity }
            : line,
        ),
      );
      return;
    }
    commit(
      lines.map((line) =>
        lineKey(line.slug, line.options) === key ? { ...line, options: clean } : line,
      ),
    );
  }, []);

  const clear = useCallback(() => {
    writeStartedFor(null);
    commit([]);
  }, []);

  const itemCount = useMemo(
    () => currentLines.reduce((sum, line) => sum + line.quantity, 0),
    [currentLines],
  );

  const subtotalCents = useMemo(
    () =>
      currentLines.reduce(
        (sum, line) => sum + lineUnitPriceCents(line) * line.quantity,
        0,
      ),
    [currentLines],
  );

  const value = useMemo(
    () => ({
      lines: currentLines,
      itemCount,
      subtotalCents,
      addItem,
      removeItem,
      setQuantity,
      setLineOptions,
      clear,
    }),
    [
      currentLines,
      itemCount,
      subtotalCents,
      addItem,
      removeItem,
      setQuantity,
      setLineOptions,
      clear,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within a CartProvider");
  return context;
}

// Everything a basket row needs to render itself, resolved once. The drawer,
// the cart page and the checkout summary all showed the same three lines of
// derivation before options existed; with options in play they'd all have to
// price and describe the choices too, and three copies of that is three
// chances for the basket, the summary, and the total to disagree.
export type CartRow = {
  line: CartLine;
  product: Product;
  // Addresses this row for setQuantity/removeItem.
  key: string;
  // Price of one, choices included.
  unitCents: number;
  lineCents: number;
  // The chosen options as labels, e.g. ["Everything", "Scallion (+$1.50)"].
  chosen: string[];
  // False when a required group is still unanswered — see setLineOptions.
  // The basket shows a picker on these rows and checkout refuses them.
  complete: boolean;
  // True when the item has gone off the board since it went in the basket.
  // A basket outlives the morning it was filled in, so this is a normal
  // state, not an error: the row says so and checkout refuses it.
  gone: boolean;
};

export function useCartRows(): CartRow[] {
  const { lines: currentLines } = useCart();
  return useMemo(
    () =>
      currentLines.flatMap<CartRow>((line) => {
        const product = getProduct(line.slug);
        if (!product) return [];
        const unitCents = unitPriceCents(product, line.options);
        return [
          {
            line,
            product,
            key: lineKey(line.slug, line.options),
            unitCents,
            lineCents: unitCents * line.quantity,
            chosen: describeOptions(product, line.options),
            complete: optionsComplete(product, line.options),
            gone: soldOut(line.slug),
          },
        ];
      }),
    [currentLines],
  );
}

// Whether the basket was started for a different kind of order than the one
// it's now attached to — "you began this for pickup, it's going to delivery".
// Returns null when they agree, or when there's nothing in the basket.
export function useBasketMoved(): { from: string; to: string } | null {
  const { lines: currentLines } = useCart();
  const fulfillment = useFulfillment();
  if (currentLines.length === 0 || !fulfillment) return null;
  const from = readStartedFor();
  if (!from || from === fulfillment.mode) return null;
  return { from, to: fulfillment.mode };
}
