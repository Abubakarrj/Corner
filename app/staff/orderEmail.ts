import "server-only";

import { emailShell, escapeHtml } from "../email";
import { attachmentName, longDay, type OrderMeta } from "./orderPdf";
import type { PricedOrder } from "./supplies";

// The message a sales rep opens.
//
// The wording here is fixed and was written by the shop, not by me. It is
// reproduced exactly: the greeting, the bolded location, the list, the
// attachment names, the closing line. Somebody on the other end reads dozens of
// these a week from dozens of kitchens, and a message that says the same thing
// in the same order every time is one they can act on in ten seconds. So if
// this needs to change, change it here — do not paraphrase it at a call site.
//
// One email per supplier, never one email listing everything. A rep at the
// dairy has no use for the paper order and should not be reading the shop's
// costs with another company, and "please ignore the lines that aren't yours"
// is how a case of cream cheese fails to arrive.
//
// No prices in the body. They are in the attached invoice, where somebody who
// wants them will look, and out of the way of the person who just needs to
// know what to pick.

export type ComposedOrder = {
  subject: string;
  html: string;
  text: string;
};

export function composeOrderEmail(order: PricedOrder, meta: OrderMeta): ComposedOrder {
  const place = meta.location.name;
  const address = `${meta.location.address}, ${meta.location.city}`;
  const day = longDay(meta.requestedFor);
  const files = [
    attachmentName("Order List", place),
    attachmentName("Invoice", place),
  ];

  const lines = order.lines.map(
    (line) => `${line.name} — ${line.quantity} × ${line.pack}`,
  );

  const text = [
    `Hi ${order.supplier.rep.name},`,
    "",
    `Please see our ingredient order below for ${place}`,
    "",
    "Location:",
    place,
    address,
    "",
    "Requested Delivery",
    day,
    "",
    "Order",
    ...lines.map((line) => `* ${line}`),
    "",
    "Attachments",
    ...files.map((file) => `* ${file}`),
    "",
    "Please confirm receipt and let us know if anything is unavailable," +
      " substituted, or backordered.",
    "",
    "Thank you,",
    "",
    "Corner Bagel Ordering Team",
  ].join("\n");

  // Inline styles only — Gmail throws away <style> blocks, and a stylesheet
  // that survives in Apple Mail and vanishes in Gmail is worse than none.
  const paragraph = "margin:0 0 14px;";
  const label = "margin:0 0 4px;font-weight:600;";
  const list = "margin:0 0 14px;padding-left:20px;";

  const html = emailShell(
    [
      `<p style="${paragraph}">Hi ${escapeHtml(order.supplier.rep.name)},</p>`,
      `<p style="${paragraph}">Please see our ingredient order below for` +
        ` <strong>${escapeHtml(place)}</strong></p>`,
      `<p style="${label}">Location:</p>`,
      `<p style="${paragraph}">${escapeHtml(place)}<br>${escapeHtml(address)}</p>`,
      `<p style="${label}">Requested Delivery</p>`,
      `<p style="${paragraph}">${escapeHtml(day)}</p>`,
      `<p style="${label}">Order</p>`,
      `<ul style="${list}">`,
      ...lines.map((line) => `<li style="margin:0 0 4px;">${escapeHtml(line)}</li>`),
      `</ul>`,
      `<p style="${label}">Attachments</p>`,
      `<ul style="${list}">`,
      ...files.map((file) => `<li style="margin:0 0 4px;">${escapeHtml(file)}</li>`),
      `</ul>`,
      `<p style="${paragraph}">Please confirm receipt and let us know if anything is` +
        ` unavailable, substituted, or backordered.</p>`,
      `<p style="${paragraph}">Thank you,</p>`,
      `<p style="margin:0;">Corner Bagel Ordering Team</p>`,
    ].join(""),
  );

  // The supplier and the day, because a rep's inbox is a hundred of these and
  // the two things they sort by are who it's from and when it's wanted.
  return {
    subject: `Ingredient order — ${place} — delivery ${day}`,
    html,
    text,
  };
}
