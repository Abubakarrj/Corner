import { LOCATIONS, type StoreLocation } from "../(marketing)/locations/locations";
import { getProduct, type Product } from "./products";

// What a given counter can make.
//
// ——— One question, one answer ———
//
// "Can this counter make this" is asked in four places that must agree: the
// catalog decides what to show, the basket decides what to grey out, Riley
// decides what to offer, and the order endpoint decides what to accept. Three
// of those are conveniences and the fourth is the one that matters — a
// sandwich hidden from a list is a tidy screen, a sandwich *refused* is the
// promise the kitchen can keep. They are all this function so they cannot
// drift, and the endpoint is the one that is authoritative because it is the
// only one a customer cannot skip.
//
// ——— Failing open ———
//
// Everything unknown here means "yes". No location, an id that names no
// counter, a category a record forgot to list: all of them serve the full
// menu.
//
// That is the deliberate direction. Getting it wrong toward yes shows
// somebody a sandwich they then get told about at checkout, which is a bad
// minute. Getting it wrong toward no empties a shop silently — a stale
// `locationId` in one person's browser, left over from a counter that closed,
// and the app shows them a catalog with four things in it and no explanation.
// The first is a mistake somebody can see and recover from; the second looks
// exactly like a working app.

/** The counter an order is being placed at, or null.
 *
 *  Null for delivery, which is not placed at a counter at all: it leaves from
 *  the kitchen, and the kitchen serves everything. Also null before the
 *  visitor has chosen. */
export function storeById(locationId: string | null | undefined): StoreLocation | null {
  if (!locationId) return null;
  return LOCATIONS.find((store) => store.id === locationId) ?? null;
}

/** Whether this counter makes things in this category. */
export function servesCategory(
  locationId: string | null | undefined,
  category: string,
): boolean {
  const store = storeById(locationId);
  if (!store?.menu) return true;
  // Gift cards are not made by a counter. They are bought at /gift and spend
  // at any of them, so a counter's menu says nothing about whether one can be
  // had — and dropping the row from the shortest catalog in the app would
  // hide the only thing on it that works the same everywhere.
  if (category === "Gift Cards") return true;
  return store.menu.includes(category);
}

/** Whether this counter makes this product. */
export function servesProduct(
  locationId: string | null | undefined,
  product: Product,
): boolean {
  return servesCategory(locationId, product.category);
}

/** The slugs in this list that the counter cannot make.
 *
 *  Every one of them, not the first. Refusing an order one line at a time is
 *  a loop the customer has to run — pay, get refused, delete a line, pay
 *  again — and the whole basket is already in hand. Same reasoning, and the
 *  same response shape, as the sold-out check next to it in the order
 *  endpoint. */
export function notServedAt(
  locationId: string | null | undefined,
  slugs: readonly string[],
): string[] {
  const store = storeById(locationId);
  if (!store?.menu) return [];
  const missing = slugs.filter((slug) => {
    const product = getProduct(slug);
    // An unknown slug is somebody else's error to report. This function
    // answers one question and inventing a second answer here would have the
    // order endpoint blame the wrong thing.
    return product ? !servesProduct(locationId, product) : false;
  });
  return [...new Set(missing)];
}
