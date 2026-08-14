import "server-only";

import { SCHEMA, db, explainDbError, isDatabaseConfigured, ready } from "../db";

// Where push subscriptions live.
//
// ——— Why this is the one thing that needed a database ———
//
// Everything else in this app gets by without one: orders live in Toast,
// applications live in a mailbox, the cart and the order history live in the
// browser, staff accounts live in a config value. A push subscription can do
// none of that. It is created on a device at runtime, it lasts months, it has
// to be enumerable to send to, and there can be one per device per customer.
//
// In memory it would work perfectly in testing and fail silently in the way
// that matters most: every deploy would drop every subscription, customers
// would keep the permission they granted, and notifications would simply stop
// with no error on either side. For a feature whose entire point is not losing
// messages, that is the wrong shape.
//
// ——— The table ———
//
// Keyed by endpoint, which is what the browser gives us and what identifies a
// subscription to the push service. `orderId` is what a notification is about,
// so a device that is watching one order can be found without scanning every
// row, and so a finished order's subscriptions can be swept.
//
// Created on first use rather than in a migration step. One table, one index,
// and a deploy that has never run before should not need a second command.

const DDL = `
  CREATE TABLE IF NOT EXISTS ${SCHEMA}.push_subscriptions (
    endpoint    TEXT PRIMARY KEY,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    order_id    TEXT NOT NULL,
    -- The provider's own ids for the same order. The webhooks that trigger a
    -- notification know only these: Toast says "guid X is ready", Uber says
    -- "delivery Y was collected", and neither has heard of CB-1234. Stored
    -- here so a status change can find the devices to tell without a second
    -- table to join through.
    toast_guid  TEXT,
    delivery_id TEXT,
    locale      TEXT NOT NULL DEFAULT 'en',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS push_subscriptions_order
    ON ${SCHEMA}.push_subscriptions (order_id);
  CREATE INDEX IF NOT EXISTS push_subscriptions_toast
    ON ${SCHEMA}.push_subscriptions (toast_guid);
  CREATE INDEX IF NOT EXISTS push_subscriptions_uber
    ON ${SCHEMA}.push_subscriptions (delivery_id);
`;

export type PushSubscriptionRecord = {
  endpoint: string;
  p256dh: string;
  auth: string;
  orderId: string;
  toastGuid: string | null;
  deliveryId: string | null;
  locale: string;
};

const SELECT_COLUMNS = `SELECT endpoint, p256dh, auth, order_id, toast_guid, delivery_id, locale
  FROM ${SCHEMA}.push_subscriptions`;

function toRecord(row: Record<string, unknown>): PushSubscriptionRecord {
  return {
    endpoint: row.endpoint as string,
    p256dh: row.p256dh as string,
    auth: row.auth as string,
    orderId: row.order_id as string,
    toastGuid: (row.toast_guid as string | null) ?? null,
    deliveryId: (row.delivery_id as string | null) ?? null,
    locale: row.locale as string,
  };
}

export function isPushStoreConfigured(): boolean {
  return isDatabaseConfigured();
}

// The pool and the once-per-process schema bookkeeping live in app/db.ts,
// which is where they moved when the kitchen queue became the second feature
// here that needs a database. See the note at the top of that file for why
// there is one pool and not two.
const prepared = () => ready("push_subscriptions", DDL);

/** Remember a device's subscription, against the order it is watching.
 *
 *  Upserted on the endpoint: browsers hand back the same endpoint for the same
 *  device and site, and a customer who places a second order should have that
 *  device follow the new one rather than accumulate rows. */
export async function saveSubscription(record: PushSubscriptionRecord): Promise<boolean> {
  const client = db();
  if (!client) return false;
  try {
    await prepared();
    await client.query(
      `INSERT INTO ${SCHEMA}.push_subscriptions
         (endpoint, p256dh, auth, order_id, toast_guid, delivery_id, locale)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (endpoint) DO UPDATE
         SET p256dh = EXCLUDED.p256dh,
             auth = EXCLUDED.auth,
             order_id = EXCLUDED.order_id,
             toast_guid = EXCLUDED.toast_guid,
             delivery_id = EXCLUDED.delivery_id,
             locale = EXCLUDED.locale`,
      [
        record.endpoint,
        record.p256dh,
        record.auth,
        record.orderId,
        record.toastGuid,
        record.deliveryId,
        record.locale,
      ],
    );
    return true;
  } catch (error) {
    console.error("[push] could not save a subscription:", explainDbError(error));
    return false;
  }
}

/** Every device watching this order. */
export async function subscriptionsFor(orderId: string): Promise<PushSubscriptionRecord[]> {
  const client = db();
  if (!client) return [];
  try {
    await prepared();
    const result = await client.query(
      `${SELECT_COLUMNS} WHERE order_id = $1`,
      [orderId],
    );
    return result.rows.map(toRecord);
  } catch (error) {
    console.error("[push] could not read subscriptions:", explainDbError(error));
    return [];
  }
}

/** Forget one. Called when somebody turns notifications off, and when the push
 *  service answers 404 or 410 — which is how it tells us a subscription is
 *  dead. Keeping those would mean retrying a gone endpoint forever. */
export async function forgetSubscription(endpoint: string): Promise<void> {
  const client = db();
  if (!client) return;
  try {
    await prepared();
    await client.query(`DELETE FROM ${SCHEMA}.push_subscriptions WHERE endpoint = $1`, [endpoint]);
  } catch (error) {
    console.error("[push] could not delete a subscription:", explainDbError(error));
  }
}

/** Sweep subscriptions for orders that finished a while ago.
 *
 *  A subscription is only ever about one order, so once that order is done
 *  the row is dead weight — and it is a device identifier, which is not
 *  something to keep once it has no purpose. Called after a delivered or
 *  closed notification goes out. */
export async function forgetOrder(orderId: string): Promise<void> {
  const client = db();
  if (!client) return;
  try {
    await prepared();
    await client.query(`DELETE FROM ${SCHEMA}.push_subscriptions WHERE order_id = $1`, [orderId]);
  } catch (error) {
    console.error("[push] could not clear an order's subscriptions:", explainDbError(error));
  }
}

/** Every device watching whatever the provider is talking about.
 *
 *  The webhooks know a Toast guid or an Uber delivery id and nothing else, so
 *  this is the lookup a status change actually has to make. */
export async function subscriptionsForProvider(
  kind: "toast" | "uber",
  id: string,
): Promise<PushSubscriptionRecord[]> {
  const client = db();
  if (!client) return [];
  try {
    await prepared();
    const column = kind === "toast" ? "toast_guid" : "delivery_id";
    const result = await client.query(`${SELECT_COLUMNS} WHERE ${column} = $1`, [id]);
    return result.rows.map(toRecord);
  } catch (error) {
    console.error("[push] could not read subscriptions:", explainDbError(error));
    return [];
  }
}
