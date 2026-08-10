import "server-only";

import type { StoreLocation } from "../(marketing)/locations/locations";
import { CONTENT, MUTED, Sheet, newDocument, safe as safeText } from "../pdf/sheet";
import { money, type PricedOrder } from "./supplies";

// The two documents that ride with a supply order.
//
//   Order List   what to pick and pack. No prices — this is the sheet that
//                gets carried around a warehouse, and cost per case is not
//                the picker's business.
//   Invoice      the same lines priced, with a subtotal, so the shop and the
//                supplier are working from the same arithmetic before anything
//                is delivered.
//
// ——— A note on the word "Invoice" ———
//
// Strictly, the supplier invoices us; what we send is a purchase order. The
// filename and the title say "Invoice" because that is what was asked for and
// it is what the people using this call it. If a supplier's accounts
// department ever queries it, changing the two strings marked below is the
// whole edit — nothing computes off them.
//
// ——— Why two files and not one ———
//
// Because they are read by different people at different moments. Merging them
// would mean either pricing the picking sheet or hiding the prices from the
// person checking the total, and both are worse than an extra attachment.

const UNDRAWABLE = "[see the email]";
const safe = (text: string) => safeText(text, UNDRAWABLE).text;

export type OrderMeta = {
  location: StoreLocation;
  /** The day the shop wants this to arrive, as an ISO yyyy-mm-dd. */
  requestedFor: string;
  /** Who pressed send. On the paperwork so a supplier with a question knows
   *  who at the shop to ask, and so the shop knows who ordered what. */
  placedBy: string;
  placedAt: Date;
};

const stamp = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  dateStyle: "long",
  timeStyle: "short",
});

/** The requested delivery day, written the way the email writes it.
 *
 *  Parsed as noon UTC rather than midnight: "2026-08-14" at midnight UTC is
 *  the evening of the 13th in Los Angeles, which is how a Friday delivery
 *  turns into a Thursday one on the paperwork. Noon is far enough from both
 *  edges that no timezone this shop deals with can move the date. */
export function longDay(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function header(sheet: Sheet, title: string, order: PricedOrder, meta: OrderMeta) {
  sheet.text("Corner Bagel", { size: 16 });
  sheet.text(title, { size: 11, color: MUTED });
  sheet.gap(4);
  sheet.text(`Placed ${stamp.format(meta.placedAt)} by ${safe(meta.placedBy)}`, {
    size: 9,
    color: MUTED,
  });

  sheet.heading("Location");
  sheet.value(`${meta.location.name}\n${meta.location.address}\n${meta.location.city}`);

  sheet.heading("Supplier");
  sheet.value(`${safe(order.supplier.name)}\nAttn: ${safe(order.supplier.rep.name)}`);

  sheet.heading("Requested delivery");
  sheet.value(longDay(meta.requestedFor));
}

/** Item, quantity, pack — the sheet somebody picks against. */
export async function renderOrderList(
  order: PricedOrder,
  meta: OrderMeta,
): Promise<Uint8Array> {
  const { doc, font } = await newDocument();
  const sheet = new Sheet(doc, font);

  header(sheet, "Ingredient order", order, meta);

  sheet.heading("Order");
  const columns = { item: CONTENT - 60 - 150, qty: 60, pack: 150 };
  sheet.columns([
    { text: "Item", width: columns.item, size: 8, color: MUTED },
    { text: "Qty", width: columns.qty, size: 8, color: MUTED, align: "right" },
    { text: "Pack / size", width: columns.pack, size: 8, color: MUTED },
  ]);
  sheet.gap(3);
  sheet.rule();

  for (const line of order.lines) {
    sheet.columns([
      { text: safe(line.name), width: columns.item, size: 10.5 },
      { text: String(line.quantity), width: columns.qty, size: 10.5, align: "right" },
      { text: safe(line.pack), width: columns.pack, size: 10.5 },
    ]);
  }

  sheet.gap(12);
  sheet.text(
    `${order.lines.length} ${order.lines.length === 1 ? "line" : "lines"}.` +
      " Please confirm receipt and tell us about anything unavailable," +
      " substituted or backordered.",
    { size: 9, color: MUTED },
  );

  return doc.save();
}

/** The same lines with money against them. */
export async function renderInvoice(
  order: PricedOrder,
  meta: OrderMeta,
): Promise<Uint8Array> {
  const { doc, font } = await newDocument();
  const sheet = new Sheet(doc, font);

  // ← one of the two strings to change if "Invoice" is ever the wrong word.
  header(sheet, "Invoice", order, meta);

  sheet.heading("Order");
  const columns = { item: CONTENT - 40 - 110 - 70 - 80, qty: 40, pack: 110, unit: 70, total: 80 };
  sheet.columns([
    { text: "Item", width: columns.item, size: 8, color: MUTED },
    { text: "Qty", width: columns.qty, size: 8, color: MUTED, align: "right" },
    { text: "Pack / size", width: columns.pack, size: 8, color: MUTED },
    { text: "Unit", width: columns.unit, size: 8, color: MUTED, align: "right" },
    { text: "Total", width: columns.total, size: 8, color: MUTED, align: "right" },
  ]);
  sheet.gap(3);
  sheet.rule();

  for (const line of order.lines) {
    sheet.columns([
      { text: safe(line.name), width: columns.item, size: 10 },
      { text: String(line.quantity), width: columns.qty, size: 10, align: "right" },
      { text: safe(line.pack), width: columns.pack, size: 10 },
      { text: money.format(line.unitCost), width: columns.unit, size: 10, align: "right" },
      { text: money.format(line.total), width: columns.total, size: 10, align: "right" },
    ]);
  }

  sheet.gap(8);
  sheet.rule();
  sheet.columns([
    {
      text: "Subtotal",
      width: columns.item + columns.qty + columns.pack + columns.unit,
      size: 10.5,
      align: "right",
    },
    { text: money.format(order.subtotal), width: columns.total, size: 10.5, align: "right" },
  ]);

  sheet.gap(14);
  // Said out loud because a document headed "Invoice" carrying a total is
  // exactly the kind of thing somebody pays by mistake.
  sheet.text(
    "Prices are our last recorded cost per pack and are shown so both sides are" +
      " working from the same figures. Tax, delivery and any price changes are not" +
      " included. This is not a payment request and nothing has been charged.",
    { size: 8, color: MUTED },
  );

  return doc.save();
}

/** "Order List — Koreatown.pdf".
 *
 *  The em dash is deliberate: the email body lists the attachments by name,
 *  and a body that says "—" over a file called "-" is a body that is wrong
 *  about its own contents. Anything a filesystem or a mail client would choke
 *  on — slashes, colons, control characters — is dropped from the location
 *  name, which leaves the dash and the words. */
export function attachmentName(kind: "Order List" | "Invoice", location: string): string {
  // Spaces survive: a two-word shop name is still two words. Only the
  // characters a filesystem or a mail client actually refuses are dropped.
  const place =
    location
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Corner Bagel";
  return `${kind} — ${place}.pdf`;
}
