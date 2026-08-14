import "server-only";

import { SCHEMA, db, explainDbError, isDatabaseConfigured, ready } from "./db";
import { applySoldOut, getProduct } from "./shop/products";

// What is off the board, from somewhere a person can change without a deploy.
//
// ——— The bug this exists for ———
//
// app/shop/products.ts had `const SOLD_OUT: string[] = []` with a comment
// saying the POS would fill it in one day. Four things read it: the catalog
// tile, the cart row, /api/shop-order's refusal, and Riley. All four were
// therefore answering "we have plenty of everything", always, and the only way
// to change that answer was to edit TypeScript and ship.
//
// A bagel shop bakes in the morning and runs out in the afternoon. "Sold out"
// is not an edge case here, it is Tuesday.
//
// ——— Three sources, in order ———
//
//   1. The table below, when a database is attached. Durable, shared across
//      instances, and writable by anything that can reach Postgres: the POS
//      integration when it lands, /api/sold-out from a kitchen tablet today,
//      or a person with psql at 2pm.
//
//   2. SOLD_OUT_SLUGS, a comma-separated list in the environment. The answer
//      for a deployment with no database, which is the state this shop is in
//      right now. Changing it is a settings edit and a restart, which is worse
//      than a tap and enormously better than a pull request.
//
//   3. Nothing off the board. The honest default: an empty list means the
//      board is full, and that is the same claim the old constant made. The
//      difference is that it is now the fallback rather than the only answer.
//
// Not merged. One source per read, the best one available — the same rule
// /api/kitchen-load applies to Toast and our own table, and for the same
// reason: two lists of what is sold out, unioned, is a way to leave an item
// off the board because it was off last week.

const DDL = `
  CREATE TABLE IF NOT EXISTS ${SCHEMA}.sold_out (
    slug   TEXT PRIMARY KEY,
    -- When somebody took it off the board. For the log, and for a human
    -- wondering whether this row is from this morning or from March.
    since  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- When it comes back on its own. NULL means "until somebody says
    -- otherwise", which is what the kitchen means most of the time. A row that
    -- has expired is ignored rather than deleted, so there is a history.
    until  TIMESTAMPTZ
  );
`;

// ——— How stale this is allowed to be ———
//
// Thirty seconds. The cost of being wrong in each direction sets it: an item
// that sold out half a minute ago can still be added to a basket, and
// /api/shop-order re-reads on the way through and refuses it there, so the
// worst case is a message at checkout rather than a wasted trip. Being wrong
// the other way — still showing sold out after it came back — costs a sale for
// half a minute.
//
// Against that, a query per render of the catalog is a query per tile per
// visitor. Thirty seconds is roughly one read per instance per rush minute.
const TTL_MS = 30_000;

let cached: { at: number; slugs: string[] } | null = null;
let inFlight: Promise<string[]> | null = null;

// Bumped by every write, and the reason is a race worth spelling out.
//
// A read that is already in the air when a write lands was started against the
// old board. Without this it would come back, find `cached` cleared, and
// install its own stale answer with a brand new timestamp — hiding the write
// for a full TTL. Worse, the very request that made the write calls
// soldOutNow() to build its response, so the endpoint would tell the kitchen
// tablet that the donuts are still on the board a moment after taking them
// off.
//
// So a read publishes only if the board has not moved underneath it, and a
// write drops the in-flight read so the next caller starts a fresh one.
let generation = 0;

function invalidate() {
  generation += 1;
  cached = null;
  inFlight = null;
}

function fromEnv(): string[] | null {
  const raw = process.env.SOLD_OUT_SLUGS?.trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);
}

async function fromDatabase(): Promise<string[] | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    await ready("sold_out", DDL);
    const client = db();
    if (!client) return null;
    const result = await client.query<{ slug: string }>(
      `SELECT slug FROM ${SCHEMA}.sold_out WHERE until IS NULL OR until > now()`,
    );
    return result.rows.map((row) => row.slug);
  } catch (error) {
    // Null, not an empty list. A database that is briefly unreachable must not
    // read as "everything is back in stock" — that is the confident answer
    // assembled out of an error that this codebase keeps having to refuse. The
    // caller falls through to the environment, and failing that to whatever it
    // last knew.
    console.error(`[sold-out] read failed: ${explainDbError(error)}`);
    return null;
  }
}

/** What is off the board, checked no more often than the TTL allows.
 *
 *  Unknown slugs are dropped: a row for an item that has since been renamed or
 *  removed from the catalog is not a reason for the whole list to be wrong,
 *  and it is not a reason to keep answering questions about an item that does
 *  not exist. */
export async function soldOutNow(): Promise<string[]> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.slugs;
  // One read per process per expiry, however many requests land in the gap.
  if (inFlight) return inFlight;

  const startedAt = generation;
  const previous = cached?.slugs;
  inFlight = (async () => {
    const found = (await fromDatabase()) ?? fromEnv() ?? previous ?? [];
    const slugs = found.filter((slug) => getProduct(slug) !== undefined);
    // Only if nothing was written while this was in the air. See `generation`.
    if (generation === startedAt) cached = { at: Date.now(), slugs };
    return slugs;
  })().finally(() => {
    if (generation === startedAt) inFlight = null;
  });

  return inFlight;
}

/** Reads the live list and installs it, so the synchronous soldOut() that the
 *  rest of the app calls is answering about today.
 *
 *  Awaited at the top of the request paths where being wrong matters: the
 *  order endpoint, and Riley's tools. Everything downstream keeps calling
 *  soldOut(slug) and does not need to know any of this happened. */
export async function refreshSoldOut(): Promise<void> {
  applySoldOut(await soldOutNow());
}

/** Takes an item off the board. `until` is when it comes back on its own;
 *  omit it for "until somebody says otherwise". */
export async function markSoldOut(slug: string, until?: Date): Promise<void> {
  await ready("sold_out", DDL);
  const client = db();
  if (!client) throw new Error("no database URL configured");
  await client.query(
    `INSERT INTO ${SCHEMA}.sold_out (slug, since, until) VALUES ($1, now(), $2)
     ON CONFLICT (slug) DO UPDATE SET since = now(), until = EXCLUDED.until`,
    [slug, until ?? null],
  );
  invalidate();
}

/** Puts it back on the board. */
export async function markAvailable(slug: string): Promise<void> {
  await ready("sold_out", DDL);
  const client = db();
  if (!client) throw new Error("no database URL configured");
  await client.query(`DELETE FROM ${SCHEMA}.sold_out WHERE slug = $1`, [slug]);
  invalidate();
}
