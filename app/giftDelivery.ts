import "server-only";

import { SCHEMA, db, explainDbError, ready } from "./db";
import { isEmailConfigured } from "./email";
import { isSmsConfigured } from "./sms";
import type { DeliveryMethod } from "./(marketing)/gift/buy/giftOrder";

// Gift cards that have been issued, and who they still have to reach.
//
// ——— Why this is a table and not a send-and-forget ———
//
// The buy form has always taken a recipient, a method, a message and a date to
// send on. Three of those are only meaningful if something remembers them: a
// card bought on Tuesday for a birthday on Saturday has to survive four days
// and however many deploys happen in between.
//
// It also has to survive its own send failing. A gift card is money already
// taken — if the email bounces, or Resend is down for the ten minutes the cron
// happened to run, the card still exists and somebody is still owed it. So
// every row carries what it takes to try again, and a failed attempt leaves the
// row waiting rather than dropping it.
//
// ⚠️ The card number is not in here.
//
// A gift account number is a bearer instrument: whoever reads it can spend it.
// Putting it in this app's database would mean a second copy of live money
// sitting next to a table anybody with a backup can read, for no benefit —
// Square already holds the card, and the id is enough to ask for the number at
// the moment of sending. So the row stores `square_gift_card_id` and the number
// is fetched, used, and dropped.
//
// That also means a leak of this table is embarrassing rather than expensive.
//
// ——— What it can and cannot send ———
//
// The form offers three methods. Email and "send it to me" go through Resend;
// a text goes through Twilio, which is optional — a shop that has not set
// TWILIO_* can still sell gift cards, it just cannot text them.
//
// ⚠️ `undeliverable` below is checked before anything is charged, not after.
// Taking fifty dollars and then discovering there is no way to deliver the card
// is the one failure this whole file exists to prevent.

const DDL = `
  CREATE TABLE IF NOT EXISTS ${SCHEMA}.gift_deliveries (
    id                  text PRIMARY KEY,
    square_gift_card_id text NOT NULL,
    square_order_id     text NOT NULL,
    amount_cents        integer NOT NULL,
    design_id           text NOT NULL,
    method              text NOT NULL,
    recipient_contact   text NOT NULL DEFAULT '',
    recipient_name      text NOT NULL DEFAULT '',
    sender_name         text NOT NULL DEFAULT '',
    buyer_email         text NOT NULL,
    message             text NOT NULL DEFAULT '',
    deliver_on          date,
    sent_at             timestamptz,
    attempts            integer NOT NULL DEFAULT 0,
    last_error          text NOT NULL DEFAULT '',
    created_at          timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS gift_deliveries_pending
    ON ${SCHEMA}.gift_deliveries (deliver_on) WHERE sent_at IS NULL;
`;

const prepared = () => ready("gift_deliveries", DDL);

export type GiftDelivery = {
  id: string;
  squareGiftCardId: string;
  squareOrderId: string;
  amountCents: number;
  designId: string;
  method: DeliveryMethod;
  recipientContact: string;
  recipientName: string;
  senderName: string;
  buyerEmail: string;
  message: string;
  /** ISO date, or null for "as soon as it is paid for". */
  deliverOn: string | null;
};

/** Whether this app can actually deliver by the method chosen.
 *
 *  ⚠️ A card that is issued and silently never sent is the worst outcome
 *  available, because the money has already moved. So this is checked *before*
 *  anything is charged — see /api/gift-card — rather than discovered by a cron
 *  job three days later.
 *
 *  Email and "send it to me" both go through Resend. A text needs Twilio, and
 *  Twilio is optional: without those three variables the text option is refused
 *  at the door rather than accepted into a queue nothing can drain.
 *
 *  Returning a reason rather than a boolean so the row can say why it is
 *  waiting. */
export function undeliverable(method: DeliveryMethod): string | null {
  if (method === "text" && !isSmsConfigured()) {
    return "no SMS provider is configured; this card cannot be sent by text";
  }
  if (method !== "text" && !isEmailConfigured()) {
    return "no email provider is configured; this card cannot be sent by email";
  }
  return null;
}

/** Where a card is going, by the method chosen. */
export function destinationFor(delivery: GiftDelivery): string {
  // "self" means the buyer wanted it themselves — to print, to forward, to
  // hand over in person. Their own address, not a recipient's.
  return delivery.method === "self"
    ? delivery.buyerEmail
    : delivery.recipientContact || delivery.buyerEmail;
}

/** Is this one due?
 *
 *  Null means now. A date means the morning of that day in the shop's own
 *  timezone, which the caller supplies as today's ISO date — comparing an ISO
 *  date to another ISO date is the one comparison that cannot be an hour wrong.
 *
 *  ⚠️ Past dates are due, not skipped. A card whose date went by while the cron
 *  was broken is a card somebody is still owed. */
export function isDue(deliverOn: string | null, todayIso: string): boolean {
  if (!deliverOn) return true;
  return deliverOn <= todayIso;
}

export async function recordGiftDelivery(delivery: GiftDelivery): Promise<boolean> {
  const client = db();
  if (!client) {
    // ⚠️ Loud, because at this point the money has been taken and the card
    // exists. Somebody has to send it by hand, and this line is the only thing
    // that will tell them so.
    console.error(
      `[gift] NO DATABASE — card ${delivery.squareGiftCardId} for` +
        ` ${(delivery.amountCents / 100).toFixed(2)} is issued and unrecorded.` +
        ` It must be sent by hand to ${destinationFor(delivery)}.`,
    );
    return false;
  }
  try {
    // ⚠️ Inside the try. ready() rejects when the schema cannot be created, and
    // the catch below is what turns that into a loud line about a card that
    // needs sending by hand rather than an unhandled rejection.
    await prepared();
    await client.query(
      `INSERT INTO ${SCHEMA}.gift_deliveries
         (id, square_gift_card_id, square_order_id, amount_cents, design_id,
          method, recipient_contact, recipient_name, sender_name, buyer_email,
          message, deliver_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO NOTHING`,
      [
        delivery.id,
        delivery.squareGiftCardId,
        delivery.squareOrderId,
        delivery.amountCents,
        delivery.designId,
        delivery.method,
        delivery.recipientContact,
        delivery.recipientName,
        delivery.senderName,
        delivery.buyerEmail,
        delivery.message,
        delivery.deliverOn,
      ],
    );
    return true;
  } catch (error) {
    console.error(
      `[gift] could not record card ${delivery.squareGiftCardId}: ${explainDbError(error)}.` +
        ` It is issued and must be sent by hand to ${destinationFor(delivery)}.`,
    );
    return false;
  }
}

/** Everything owed and not yet sent, oldest first.
 *
 *  `limit` because a cron that has been broken for a week should catch up in
 *  batches rather than in one request that times out halfway and leaves nobody
 *  knowing which half went. */
export async function pendingGiftDeliveries(
  todayIso: string,
  limit = 50,
): Promise<GiftDelivery[]> {
  const client = db();
  if (!client) return [];
  try {
    await prepared();
    const result = await client.query(
      `SELECT id, square_gift_card_id, square_order_id, amount_cents, design_id,
              method, recipient_contact, recipient_name, sender_name,
              buyer_email, message, to_char(deliver_on, 'YYYY-MM-DD') AS deliver_on
         FROM ${SCHEMA}.gift_deliveries
        WHERE sent_at IS NULL
          AND (deliver_on IS NULL OR deliver_on <= $1::date)
        ORDER BY created_at
        LIMIT $2`,
      [todayIso, limit],
    );
    return result.rows.map((row) => ({
      id: String(row.id),
      squareGiftCardId: String(row.square_gift_card_id),
      squareOrderId: String(row.square_order_id),
      amountCents: Number(row.amount_cents),
      designId: String(row.design_id),
      method: String(row.method) as DeliveryMethod,
      recipientContact: String(row.recipient_contact ?? ""),
      recipientName: String(row.recipient_name ?? ""),
      senderName: String(row.sender_name ?? ""),
      buyerEmail: String(row.buyer_email),
      message: String(row.message ?? ""),
      deliverOn: row.deliver_on === null ? null : String(row.deliver_on),
    }));
  } catch (error) {
    console.error(`[gift] could not read pending deliveries: ${explainDbError(error)}`);
    return [];
  }
}

/** It went. */
export async function markGiftDelivered(id: string): Promise<void> {
  const client = db();
  if (!client) return;
  try {
    await prepared();
    await client.query(
      `UPDATE ${SCHEMA}.gift_deliveries SET sent_at = now(), last_error = '' WHERE id = $1`,
      [id],
    );
  } catch (error) {
    // ⚠️ Sent but not recorded as sent, which means the next run sends it
    // again. Better a second copy of a gift than none, but it is worth
    // knowing about.
    console.error(
      `[gift] delivered ${id} but could not mark it sent: ${explainDbError(error)}.` +
        " It may be sent again on the next run.",
    );
  }
}

/** It did not go, and why. Leaves the row waiting. */
export async function markGiftFailed(id: string, why: string): Promise<void> {
  const client = db();
  if (!client) return;
  try {
    await prepared();
    await client.query(
      `UPDATE ${SCHEMA}.gift_deliveries
          SET attempts = attempts + 1, last_error = $2
        WHERE id = $1`,
      [id, why.slice(0, 500)],
    );
  } catch {
    // The send already failed and said so. A second line about the bookkeeping
    // failing too is noise on top of the thing that matters.
  }
}
