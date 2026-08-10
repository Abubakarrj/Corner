// What the shop buys, and who it buys it from.
//
// ⚠️ EVERY SUPPLIER AND EVERY REP BELOW IS A PLACEHOLDER. ⚠️
//
// The names are invented and every address is @example.com, on purpose. This
// screen sends a real purchase order to whatever address is written here, so
// the failure mode of shipping a plausible-looking guess is a stranger at a
// real company receiving an order for nine hundred bagels' worth of flour. An
// address that visibly cannot receive mail is the safe placeholder; a real
// company's real rep, guessed, is not.
//
// Replacing them is the whole setup for this feature: put the real supplier
// names, the real rep names and the real addresses in, and check the pack
// sizes and costs against a recent invoice. Nothing else has to change.
//
// ——— Why this is a file and not a database table ———
//
// It changes when a supplier changes, which is a handful of times a year, and
// it wants to be reviewed when it does — a wrong unit cost quietly misprices
// every invoice after it, and a wrong address quietly sends orders nowhere. A
// pull request is a better place for that than an admin form nobody watches.

export type SupplyItem = {
  id: string;
  name: string;
  /** How it is sold. This is what goes in the "[Qty] × [Pack/Size]" column, so
   *  it reads as the supplier writes it on their own sheet, not as a
   *  normalised unit — ordering "3 × 50 lb bag" is unambiguous in a way that
   *  "150 lb" is not. */
  pack: string;
  /** Dollars for one pack, as last invoiced. Used for the priced document and
   *  nowhere else — nothing is charged and no payment is taken here. */
  unitCost: number;
};

export type Supplier = {
  id: string;
  name: string;
  rep: { name: string; email: string };
  items: SupplyItem[];
};

export const SUPPLIERS: Supplier[] = [
  {
    id: "milling",
    name: "Placeholder Milling Co.",
    rep: { name: "Sales Rep", email: "flour-rep@example.com" },
    items: [
      { id: "flour-hg", name: "High-gluten flour", pack: "50 lb bag", unitCost: 32.5 },
      { id: "malt", name: "Barley malt syrup", pack: "5 lb tub", unitCost: 18.75 },
      { id: "yeast", name: "Instant dry yeast", pack: "1 lb vacuum pack", unitCost: 9.4 },
      { id: "salt", name: "Kosher salt", pack: "25 lb bag", unitCost: 12.2 },
      { id: "sugar", name: "Cane sugar", pack: "25 lb bag", unitCost: 28.0 },
      { id: "poppy", name: "Poppy seeds", pack: "5 lb bag", unitCost: 34.0 },
      { id: "sesame", name: "Sesame seeds", pack: "5 lb bag", unitCost: 22.5 },
      { id: "everything", name: "Everything blend", pack: "5 lb bag", unitCost: 26.0 },
      { id: "onion-dried", name: "Dried minced onion", pack: "3 lb jar", unitCost: 19.8 },
    ],
  },
  {
    id: "dairy",
    name: "Placeholder Dairy Distributors",
    rep: { name: "Sales Rep", email: "dairy-rep@example.com" },
    items: [
      { id: "cc-plain", name: "Plain cream cheese", pack: "3 lb loaf, case of 10", unitCost: 74.0 },
      { id: "cc-scallion", name: "Scallion cream cheese", pack: "3 lb loaf, case of 6", unitCost: 52.0 },
      { id: "butter", name: "Unsalted butter", pack: "1 lb, case of 36", unitCost: 128.0 },
      { id: "milk", name: "Whole milk", pack: "1 gal, case of 4", unitCost: 22.4 },
      { id: "cream", name: "Heavy cream", pack: "1 qt, case of 12", unitCost: 58.0 },
      { id: "eggs", name: "Large eggs", pack: "15 dozen case", unitCost: 46.0 },
      { id: "cheddar", name: "Sliced cheddar", pack: "5 lb pack", unitCost: 24.6 },
    ],
  },
  {
    id: "produce",
    name: "Placeholder Produce Market",
    rep: { name: "Sales Rep", email: "produce-rep@example.com" },
    items: [
      { id: "tomato", name: "Roma tomatoes", pack: "25 lb case", unitCost: 28.0 },
      { id: "onion-red", name: "Red onions", pack: "25 lb sack", unitCost: 19.5 },
      { id: "capers", name: "Capers", pack: "32 oz jar, case of 6", unitCost: 41.0 },
      { id: "avocado", name: "Hass avocado", pack: "48 count case", unitCost: 52.0 },
      { id: "lettuce", name: "Green leaf lettuce", pack: "24 count case", unitCost: 26.5 },
      { id: "scallion", name: "Scallions", pack: "4 dozen case", unitCost: 18.0 },
      { id: "lemon", name: "Lemons", pack: "40 lb case", unitCost: 38.0 },
    ],
  },
  {
    id: "packaging",
    name: "Placeholder Paper & Packaging",
    rep: { name: "Sales Rep", email: "packaging-rep@example.com" },
    items: [
      { id: "bagel-bags", name: "Bagel bags", pack: "case of 1000", unitCost: 42.0 },
      { id: "deli-sheets", name: 'Deli sheets, 12"', pack: "case of 1000", unitCost: 28.0 },
      { id: "kraft-bags", name: "Kraft to-go bags", pack: "case of 500", unitCost: 36.0 },
      { id: "hot-cups", name: "12 oz hot cups", pack: "case of 1000", unitCost: 68.0 },
      { id: "lids", name: "Hot cup lids", pack: "case of 1000", unitCost: 34.0 },
      { id: "napkins", name: "Napkins", pack: "case of 6000", unitCost: 44.0 },
      { id: "gloves", name: "Nitrile gloves", pack: "case of 1000", unitCost: 58.0 },
      { id: "deli-8oz", name: "8 oz deli containers", pack: "case of 500", unitCost: 46.0 },
    ],
  },
  {
    id: "coffee",
    name: "Placeholder Coffee Roasters",
    rep: { name: "Sales Rep", email: "coffee-rep@example.com" },
    items: [
      { id: "espresso", name: "Espresso beans", pack: "5 lb bag", unitCost: 78.0 },
      { id: "drip", name: "House drip blend", pack: "5 lb bag", unitCost: 62.0 },
      { id: "oat", name: "Oat milk", pack: "32 oz, case of 12", unitCost: 46.0 },
      { id: "vanilla", name: "Vanilla syrup", pack: "750 ml, case of 6", unitCost: 38.0 },
    ],
  },
];

export function supplierById(id: string): Supplier | undefined {
  return SUPPLIERS.find((supplier) => supplier.id === id);
}

export function itemById(supplier: Supplier, id: string): SupplyItem | undefined {
  return supplier.items.find((item) => item.id === id);
}

// ——— An order, as it travels ———
//
// The browser posts quantities keyed by supplier and item. It does not post
// names, packs or prices: those are looked up here on the server from the
// tables above, so what reaches a supplier is what this file says, not what a
// request body claimed. A form that could name its own price is a form that
// will eventually be asked to.

export type OrderLine = { itemId: string; quantity: number };
export type SupplierOrder = { supplierId: string; lines: OrderLine[] };

export type PricedLine = {
  name: string;
  pack: string;
  quantity: number;
  unitCost: number;
  total: number;
};

export type PricedOrder = {
  supplier: Supplier;
  lines: PricedLine[];
  subtotal: number;
};

/** Turns "two of item X" into the priced lines the documents are built from,
 *  dropping anything that isn't a real item of that supplier's. */
export function priceOrder(supplier: Supplier, lines: OrderLine[]): PricedOrder {
  const priced: PricedLine[] = [];
  for (const line of lines) {
    const item = itemById(supplier, line.itemId);
    if (!item) continue;
    // Whole packs only, and a sane ceiling. Nobody orders 4000 cases of
    // napkins, and a fat finger that does should not reach a supplier.
    const quantity = Math.floor(line.quantity);
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 999) continue;
    priced.push({
      name: item.name,
      pack: item.pack,
      quantity,
      unitCost: item.unitCost,
      // Rounded per line rather than at the end: this is the number printed
      // next to the line, and a total that doesn't equal the visible column
      // is a total somebody has to reconcile by hand.
      total: Math.round(item.unitCost * quantity * 100) / 100,
    });
  }
  return {
    supplier,
    lines: priced,
    subtotal: Math.round(priced.reduce((sum, line) => sum + line.total, 0) * 100) / 100,
  };
}

export const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
