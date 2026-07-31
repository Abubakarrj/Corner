"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { getProduct } from "./products";

const STORAGE_KEY = "cb-shop-cart-v1";

// Just slug + quantity, not a snapshot of name/price — those are looked up
// from the catalog at render time, so the cart never shows stale pricing if
// the catalog changes.
type CartLine = { slug: string; quantity: number };

const EMPTY_LINES: CartLine[] = [];

function readStoredLines(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_LINES;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return EMPTY_LINES;
    return parsed.filter(
      (line): line is CartLine =>
        typeof line === "object" &&
        line !== null &&
        typeof (line as CartLine).slug === "string" &&
        typeof (line as CartLine).quantity === "number",
    );
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
function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
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

type CartContextValue = {
  lines: CartLine[];
  itemCount: number;
  subtotalCents: number;
  addItem: (slug: string, quantity?: number) => void;
  removeItem: (slug: string) => void;
  setQuantity: (slug: string, quantity: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const currentLines = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const addItem = useCallback((slug: string, quantity = 1) => {
    const existing = lines.find((line) => line.slug === slug);
    if (existing) {
      commit(
        lines.map((line) =>
          line.slug === slug ? { ...line, quantity: line.quantity + quantity } : line,
        ),
      );
    } else {
      commit([...lines, { slug, quantity }]);
    }
  }, []);

  const removeItem = useCallback((slug: string) => {
    commit(lines.filter((line) => line.slug !== slug));
  }, []);

  const setQuantity = useCallback((slug: string, quantity: number) => {
    if (quantity <= 0) {
      commit(lines.filter((line) => line.slug !== slug));
      return;
    }
    commit(lines.map((line) => (line.slug === slug ? { ...line, quantity } : line)));
  }, []);

  const clear = useCallback(() => commit([]), []);

  const itemCount = useMemo(
    () => currentLines.reduce((sum, line) => sum + line.quantity, 0),
    [currentLines],
  );

  const subtotalCents = useMemo(
    () =>
      currentLines.reduce((sum, line) => {
        const product = getProduct(line.slug);
        return product ? sum + product.priceCents * line.quantity : sum;
      }, 0),
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
      clear,
    }),
    [currentLines, itemCount, subtotalCents, addItem, removeItem, setQuantity, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within a CartProvider");
  return context;
}
