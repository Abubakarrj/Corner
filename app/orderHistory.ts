import "server-only";

import { SCHEMA, db, explainDbError, ready } from "./db";

// A signed-in customer's orders, kept where a second device can see them.
//
// ——— What this is for, and what it replaces ———
//
// app/account.ts keeps orders in localStorage, and says so plainly: "orders
// are kept on the device they were placed from, so one placed on another phone
// won't show here." True, and a real limit — order breakfast on a phone, open
// the site on a laptop, and the tracker has never heard of you.
//
// This is the other half. The device store stays exactly as it is and remains
// the thing every screen reads; this is a sync source that fills it in. That
// ordering matters: the app keeps working signed out, offline, and before this
// table exists, because nothing downstream learned a new way to get an order.
//
// ——— What is stored, and what deliberately is not ———
//
// The record the device already holds: items, totals, where it was going, the
// provider ids, and a card's brand and last four. No card number can reach
// here — see the note at the top of app/shop/checkout/card.ts, where the
// summary type is built so it cannot hold one.
//
// It is stored as JSON rather than columns. This is an archive of what was
// charged on a particular morning, not something to query into: nothing asks
// "how many everything bagels last month", and giving each field a column
// would mean a migration every time the checkout learns a new one.
//
// ——— The key ———
//
// (account, id). The id is minted on the device — CB-7K3M-001, see
// nextOrderId() — so it is not unique across the world, only within a browser.
// Scoping it to the account makes that enough: two customers cannot collide,
// and one customer re-using an id can only overwrite their own row.
//
// The account is the email from the session cookie, lowercased. Not the Auth0
// subject, because email is what the shop knows somebody by and what a
// receipt is addressed to — and if the identity provider is ever swapped, the
// email survives it where a `sub` does not.

const DDL = `
  CREATE TABLE IF NOT EXISTS ${SCHEMA}.orders (
    account    TEXT NOT NULL,
    id         TEXT NOT NULL,
    placed_at  TIMESTAMPTZ NOT NULL,
    record     JSONB NOT NULL,
    PRIMARY KEY (account, id)
  );
  CREATE INDEX IF NOT EXISTS orders_by_account
    ON ${SCHEMA}.orders (account, placed_at DESC);
`;

const prepared = () => ready("orders", DDL);

/** The most a single account can accumulate. A convenience list, not an
 *  archive somebody is entitled to have kept forever — and a bound on what one
 *  signed-in browser can write into the database. */
const KEEP = 50;

/** A stored record is whatever the checkout wrote. Typed loosely on purpose:
 *  this module's job is to hand back what it was given, and app/account.ts
 *  already validates the shape when it reads. */
export type StoredOrder = Record<string, unknown> & { id: string; placedAt: number };

export function accountKey(email: string): string {
  return email.trim().toLowerCase();
}

/** Keep one order against an account.
 *
 *  Upserted, so the same order arriving twice — a retry, a second tab, a
 *  status that arrived late — updates rather than duplicating or failing. */
export async function saveOrder(email: string, order: StoredOrder): Promise<boolean> {
  const client = db();
  if (!client) return false;
  try {
    await prepared();
    const account = accountKey(email);
    await client.query(
      `INSERT INTO ${SCHEMA}.orders (account, id, placed_at, record)
         VALUES ($1, $2, to_timestamp($3 / 1000.0), $4)
       ON CONFLICT (account, id) DO UPDATE
         SET record = EXCLUDED.record, placed_at = EXCLUDED.placed_at`,
      [account, order.id, order.placedAt, JSON.stringify(order)],
    );
    // Trim past the cap, oldest first. Done here rather than on a schedule
    // because there is no scheduler, and the only moment this can grow is the
    // moment somebody adds to it.
    await client.query(
      `DELETE FROM ${SCHEMA}.orders
        WHERE account = $1
          AND id NOT IN (
            SELECT id FROM ${SCHEMA}.orders
             WHERE account = $1
             ORDER BY placed_at DESC
             LIMIT $2
          )`,
      [account, KEEP],
    );
    return true;
  } catch (error) {
    console.error("[orders] could not save:", explainDbError(error));
    return false;
  }
}

/** Every order this account has, newest first.
 *
 *  An empty array for "none" and for "we could not ask", which is the right
 *  collapse here and the opposite of the rule the kitchen queue follows. The
 *  difference is what the caller does with it: the queue *renders* its answer,
 *  so a wrong zero becomes a claim on screen. This one is merged into a device
 *  list that already has the truth about this device, so an empty answer adds
 *  nothing and removes nothing. */
export async function ordersFor(email: string): Promise<StoredOrder[]> {
  const client = db();
  if (!client) return [];
  try {
    await prepared();
    const result = await client.query(
      `SELECT record FROM ${SCHEMA}.orders
        WHERE account = $1
        ORDER BY placed_at DESC
        LIMIT $2`,
      [accountKey(email), KEEP],
    );
    return result.rows
      .map((row) => row.record as StoredOrder)
      .filter((record) => typeof record?.id === "string");
  } catch (error) {
    console.error("[orders] could not read:", explainDbError(error));
    return [];
  }
}
