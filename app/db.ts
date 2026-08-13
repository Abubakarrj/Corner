import "server-only";

import { Pool } from "pg";

// The one connection pool, and the one place that knows how to reach Postgres.
//
// ——— Why this is shared rather than per-feature ———
//
// It started inside app/push/store.ts, because push subscriptions were the
// only thing in this app that needed a database. The kitchen queue is the
// second, and a second `new Pool()` would have been the obvious move and the
// wrong one: a pool is a set of real connections against a plan with a hard
// cap, and two modules each holding four means eight per web instance for no
// reason. Postgres does not run out gracefully — it refuses new connections,
// and the site goes down rather than the feature.
//
// So: one pool, and each feature owns its own table and its own schema.

/** A database on this machine, which will not be speaking TLS. */
function isLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "";
  } catch {
    return false;
  }
}

let pool: Pool | null = null;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** The pool, or null when no database is attached.
 *
 *  Null is a normal answer, not a failure. Every caller degrades: push
 *  notifications go unsent, the kitchen queue says it does not know. A shop
 *  without a database still takes orders. */
export function db(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      // Render's managed Postgres presents a certificate signed by their own
      // authority. The internal connection string never leaves their network,
      // and node-postgres refuses it outright without this.
      //
      // Off for a local server, which usually has no TLS at all — and matched
      // on the actual host rather than on the substring "localhost", which is
      // how a perfectly ordinary 127.0.0.1 development URL got "the server
      // does not support SSL connections" and a feature that looked broken.
      ssl: isLocal(url) ? undefined : { rejectUnauthorized: false },
      // A web dyno does not need many. Each one is a real connection against a
      // plan with a hard cap, and exhausting that takes down the site rather
      // than the notification.
      max: 4,
      idleTimeoutMillis: 30_000,
    });
    // A pool that throws on an idle client's error takes the process with it.
    pool.on("error", (error) => console.error("[db] idle client error:", error.message));
  }
  return pool;
}

const prepared = new Map<string, Promise<void>>();

/** Runs a feature's schema once per process, keyed by name.
 *
 *  Created on first use rather than in a migration step: a deploy that has
 *  never run before should not need a second command. A failure clears the
 *  entry so the next request tries again, rather than leaving the feature dead
 *  until a redeploy — a database that was briefly unreachable at boot is a
 *  normal thing to recover from. */
export function ready(name: string, schema: string): Promise<void> {
  const client = db();
  if (!client) return Promise.reject(new Error("no DATABASE_URL"));

  const existing = prepared.get(name);
  if (existing) return existing;

  const run = client.query(schema).then(
    () => undefined,
    (error: unknown) => {
      prepared.delete(name);
      throw error;
    },
  );
  prepared.set(name, run);
  return run;
}
