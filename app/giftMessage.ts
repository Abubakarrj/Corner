import "server-only";

import { escapeHtml, emailShell } from "./email";
import type { GiftDelivery } from "./giftDelivery";

// What a gift card says when it arrives.
//
// ——— One renderer for both ways it can arrive ———
//
// An email and a text are not the same medium — one gets a laid-out card and
// the other gets four lines — but they must not be able to disagree about the
// facts. The amount, the number, who it is from and what they wrote are read
// from the same row and assembled here, so a change to the wording changes both
// or neither.
//
// ——— ⚠️ The number in this file is money ———
//
// Everything below takes a `gan`, and a gift account number is a bearer
// instrument: whoever reads it can spend it. So:
//
//   · nothing here is logged, ever, and no caller may log what it returns
//   · it is never put in a URL, where it would end up in an access log, a
//     referer header, and the recipient's browser history
//   · it is fetched at the moment of sending and dropped afterwards, which is
//     why giftDelivery.ts stores Square's id for the card and not the number
//
// The one place it does land is the recipient's inbox or phone, which is what
// a gift card is.
//
// ——— English, deliberately ———
//
// The rest of this app is in ten languages, and this is not, for one reason:
// nothing here knows the recipient's. The buyer's own choice is the only
// signal available and it is the wrong one — the whole point of a gift is that
// it goes to somebody else, and sending a card in Persian to somebody who
// reads English is worse than a plain English card, because they cannot even
// tell what arrived.
//
// The buyer's own note is passed through untouched and unmodified, in whatever
// language they wrote it, which is the part of the message that is actually
// theirs.
//
// If the buy form ever asks the buyer what the *recipient* reads, this is one
// function to translate and a column to carry it.

/** How the message signs off.
 *
 *  ⚠️ Not a street address, and this used to be one — an invented one, "100 W
 *  5th St", which is none of the three counters. Naming a street here is wrong
 *  twice over: the card is stored value on the Square account and spends at any
 *  counter, so pointing the recipient at one of them is pointing them away from
 *  the other two. Where the shops are is a question the site answers properly,
 *  with a map and opening hours per counter. */
const SHOP = "Corner Bagel · thecornerbagel.com";

/** One GSM-7 segment. See the note where the text message is assembled. */
const SMS_LIMIT = 160;

export type GiftMessage = {
  subject: string;
  html: string;
  text: string;
  /** The same card, short enough for a text without being split across
   *  segments the carrier may deliver out of order. */
  sms: string;
};

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** The number, grouped in fours so somebody can read it off a screen and type
 *  it into another one without losing their place. */
export function groupGan(gan: string): string {
  const digits = gan.replace(/\s/g, "");
  return digits.replace(/(.{4})(?=.)/g, "$1 ");
}

/** Who it is from, as far as the buyer told us.
 *
 *  Falls back to the shop rather than to an empty space or the buyer's email
 *  address — an address is not a name, and a card that says it is from
 *  "ada@example.com" reads as a receipt rather than a present. */
function from(delivery: GiftDelivery): string {
  return delivery.senderName.trim() || "someone at Corner Bagel";
}

/** The line that opens the message. `self` is the buyer sending it to
 *  themselves to forward or print, so it does not address them as a
 *  recipient. */
function greeting(delivery: GiftDelivery): string {
  const name = delivery.recipientName.trim();
  if (delivery.method === "self") {
    return "Here is the gift card you bought.";
  }
  return name ? `${name}, you have a gift card.` : "You have a gift card.";
}

export function giftMessage(delivery: GiftDelivery, gan: string): GiftMessage {
  const amount = dollars(delivery.amountCents);
  const number = groupGan(gan);
  const sender = from(delivery);
  const note = delivery.message.trim();
  const opening = greeting(delivery);

  const subject =
    delivery.method === "self"
      ? `Your ${amount} Corner Bagel gift card`
      : `${sender} sent you a ${amount} Corner Bagel gift card`;

  // ⚠️ Every value that reaches the HTML is escaped. The buyer's note and both
  // names are typed by a member of the public into a form, and a name with an
  // ampersand in it is ordinary.
  const html = emailShell(
    [
      `<p style="margin:0 0 6px;font-size:13px;letter-spacing:0.08em;`,
      `text-transform:uppercase;color:#8a8578;">Corner Bagel</p>`,
      `<h1 style="margin:0 0 14px;font-size:22px;font-weight:500;line-height:1.25;">`,
      escapeHtml(opening),
      `</h1>`,
      note
        ? `<p style="margin:0 0 18px;font-size:15px;line-height:1.55;">` +
          `${escapeHtml(note)}</p>` +
          `<p style="margin:0 0 18px;font-size:13px;color:#6b675e;">` +
          `— ${escapeHtml(sender)}</p>`
        : `<p style="margin:0 0 18px;font-size:15px;line-height:1.55;">` +
          `From ${escapeHtml(sender)}.</p>`,
      // The card itself. A block rather than a picture: a message that is one
      // image is a message half the recipients see as a grey box, and this is
      // the half of it they actually need.
      `<div style="margin:0 0 18px;padding:20px;border-radius:12px;`,
      `background:#f0ece0;text-align:center;">`,
      `<p style="margin:0;font-size:28px;font-weight:500;">${escapeHtml(amount)}</p>`,
      `<p style="margin:10px 0 0;font-size:12px;letter-spacing:0.08em;`,
      `text-transform:uppercase;color:#6b675e;">Card number</p>`,
      // Monospaced and spaced out, because this is the one string in the
      // message somebody has to copy by hand.
      `<p style="margin:4px 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,`,
      `Consolas,monospace;font-size:19px;letter-spacing:0.06em;">`,
      escapeHtml(number),
      `</p></div>`,
      `<p style="margin:0 0 6px;font-size:14px;line-height:1.55;">`,
      `Give the number at the counter, or enter it at checkout. It does not `,
      `expire and there are no fees.</p>`,
      `<p style="margin:0;font-size:13px;color:#6b675e;">${escapeHtml(SHOP)}</p>`,
    ].join(""),
  );

  const text = [
    opening,
    "",
    note ? `${note}\n\n— ${sender}` : `From ${sender}.`,
    "",
    `Amount: ${amount}`,
    `Card number: ${number}`,
    "",
    "Give the number at the counter, or enter it at checkout.",
    "It does not expire and there are no fees.",
    "",
    SHOP,
  ].join("\n");

  // ——— The text message, and why it is measured rather than trimmed by eye ———
  //
  // ⚠️ A text over 160 characters is sent as several segments and billed as
  // several messages. That is the ordinary cost. The trap underneath it is the
  // alphabet: a single character outside GSM-7 switches the whole message to
  // UCS-2, and the limit drops from 160 to 70. One typographer's ellipsis in
  // the trimming code turns a one-segment message into four.
  //
  // So nothing added here is outside GSM-7 — "..." rather than "…", straight
  // quotes rather than curly — and the note is fitted to what is actually left
  // after the parts that have to be there.
  //
  // The buyer's own note can still be in any alphabet, and that is theirs to
  // spend. What this file will not do is spend it for them.
  const smsSender = sender.length > 24 ? `${sender.slice(0, 23)}.` : sender;
  const opener =
    delivery.method === "self"
      ? `Your ${amount} Corner Bagel gift card.`
      : `${smsSender} sent you a ${amount} Corner Bagel gift card.`;
  const closer = `Card number: ${number}\nGive it at the counter or enter it at checkout.`;

  // What is left for the note once the two lines that must survive are in,
  // minus the newline and the two quotation marks that wrap it.
  const room = SMS_LIMIT - opener.length - closer.length - 4;
  // ⚠️ Below this there is no room for a note worth reading, and a two-word
  // fragment of somebody's message is worse than none. The whole note is in the
  // email either way.
  const smsNote = room < 12 ? "" : note.length <= room ? note : `${note.slice(0, room - 3)}...`;

  const sms = [opener, smsNote ? `"${smsNote}"` : "", closer].filter(Boolean).join("\n");

  return { subject, html, text, sms };
}
