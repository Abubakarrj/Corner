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
//
// ——— Which variable holds the connection string ———
//
// CORNER_DATABASE_URL when it is set, DATABASE_URL otherwise.
//
// DATABASE_URL is the name every platform reaches for, which is exactly the
// problem: on a Render account running more than one thing, it is already
// spoken for. It was here, holding an internal Render hostname —
// `dpg-xxxx-a`, no domain — which resolves only from a service in the same
// region and account as the database. Correct for whatever set it, and
// unreachable from this one, so every write failed with ENOTFOUND.
//
// Editing it in place was the wrong fix. That variable belongs to something
// else; overwriting it to suit this app would trade one broken feature for
// another, somewhere nobody is looking.
//
// So this app gets a name of its own, and DATABASE_URL keeps working as the
// default for a deployment where nothing else has claimed it.
function connectionString(): string | undefined {
  return (
    process.env.CORNER_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    undefined
  );
}

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
  return connectionString() !== undefined;
}

/** The pool, or null when no database is attached.
 *
 *  Null is a normal answer, not a failure. Every caller degrades: push
 *  notifications go unsent, the kitchen queue says it does not know. A shop
 *  without a database still takes orders. */
export function db(): Pool | null {
  const url = connectionString();
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

// Everything this app creates lives in its own schema, and every statement
// names it.
//
// ——— Why not just use `public` ———
//
// Because the database underneath may not be ours alone. Pointing DATABASE_URL
// at a Postgres another project is already using is a reasonable thing to want
// — a small shop does not need a second database for two tables — and in
// `public` it is a quiet hazard. `CREATE TABLE IF NOT EXISTS push_subscriptions`
// against a database that already has a table by that name does nothing at
// all, reports success, and leaves every query afterwards running against
// somebody else's columns. The failure is not a crash; it is an INSERT into
// the wrong table.
//
// A schema removes the whole class of it. Names cannot collide, `\dt` stays
// legible for whoever owns the other project, and taking this app back off a
// shared database is one statement:
//
//   DROP SCHEMA corner_bagel CASCADE;
//
// Qualified explicitly rather than by search_path, which depends on a
// connection parameter that some poolers refuse to pass through. A table name
// written out in full works everywhere.
export const SCHEMA = "corner_bagel";

/** What a connection failure actually means, where the message is a give-away.
 *
 *  ——— The one that cost an evening ———
 *
 *    getaddrinfo ENOTFOUND dpg-d9u06m1t0dsc73c8fsd0-a
 *
 *  Render gives a managed Postgres two connection strings. The internal one is
 *  a bare host with no domain on it — `dpg-xxxx-a` — and it resolves only from
 *  services in the same region and the same account. The external one carries
 *  a real domain: `dpg-xxxx-a.oregon-postgres.render.com`.
 *
 *  Paste the internal string into a service that is not next to the database
 *  and DNS simply has nothing to look up. The error says ENOTFOUND, which
 *  reads like a typo in the hostname, and the hostname is correct. Naming it
 *  here is worth more than the six words node gives you. */
export function explainDbError(error: unknown): string {
  const message = (error as Error)?.message ?? String(error);
  if (/ENOTFOUND\s+dpg-[a-z0-9]+-a$/i.test(message.trim())) {
    return (
      `${message} — that is Render's *internal* database hostname, and it` +
      " resolves only from a service in the same region and account as the" +
      " database. Use the External Database URL instead: same credentials," +
      " hostname ending .render.com."
    );
  }
  if (message.includes("ECONNREFUSED")) {
    return `${message} — the host resolved but nothing is listening. Check the port and that the database is awake.`;
  }
  if (message.includes("password authentication failed")) {
    return `${message} — the host is right and the credentials are not.`;
  }
  if (message.includes("does not support SSL")) {
    return `${message} — a local database with no TLS. See isLocal() below.`;
  }
  return message;
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
  if (!client) return Promise.reject(new Error("no database URL configured"));

  const existing = prepared.get(name);
  if (existing) return existing;

  const run = client.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}; ${schema}`).then(
    () => undefined,
    (error: unknown) => {
      prepared.delete(name);
      throw error;
    },
  );
  prepared.set(name, run);
  return run;
}
