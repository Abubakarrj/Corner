import "server-only";

import { randomUUID } from "node:crypto";
import { SCHEMA, db, explainDbError, isDatabaseConfigured, ready } from "./db";

// Corner Rewards: the points a customer earns, and the code they show.
//
// ⚠️ Points are money. Not literally — they are not redeemable for cash and
// they are not a stored-value instrument — but they buy things, and every
// design decision in this file follows from treating them as a currency
// rather than as a score.
//
// ——— Append-only, and the balance is derived ———
//
// There is no balance column anywhere. There is a table of entries, each one
// a signed amount with a reason, and the balance is their sum.
//
// A balance column is a number that can be wrong. It drifts under concurrent
// writes, a failed update leaves it disagreeing with the history that
// produced it, and when a customer says "I had 400 points" there is nothing to
// check the claim against. A ledger cannot drift because there is nothing to
// drift from: the history *is* the balance, every entry says why it exists,
// and a mistake is corrected by writing the correcting entry rather than by
// editing the past.
//
// It costs a SUM on read. At this shop's volume that is a few hundred rows
// per customer against an index, and the day that stops being true the answer
// is a periodically-written checkpoint entry, not a mutable column.
//
// ——— Earning is idempotent ———
//
// The same order must never pay twice. Checkouts get retried, webhooks get
// redelivered, somebody double-taps. Every entry carries a `ref` — the order
// it came from — and (account, reason, ref) is unique, so a second attempt
// for the same order is a no-op at the database rather than a duplicate the
// application has to notice.
//
// ——— What is deliberately not here ———
//
// Spending. The counter cannot read a member code yet: what a scan has to
// contain, and what the till does with it, is decided by Toast's loyalty
// integration and that is not wired up. Writing a redeem endpoint now would
// mean inventing a protocol nobody is listening to, and shipping a Redeem
// button that fails at the counter is worse than one that isn't there.
//
// The shape is ready for it — a negative entry with reason "spend" and the
// balance check below is the whole of it — and spend() exists and is tested,
// so when the till can talk, this side is a call away rather than a rewrite.

const DDL = `
  CREATE TABLE IF NOT EXISTS ${SCHEMA}.members (
    account     TEXT PRIMARY KEY,
    -- What a scanner reads. Random rather than derived from the email or a
    -- sequence: it is shown on a phone screen at a counter and photographed
    -- by whoever is behind it, so it must name an account without revealing
    -- one and must not be guessable from a neighbouring member's.
    code        TEXT NOT NULL UNIQUE,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS ${SCHEMA}.rewards_ledger (
    id          BIGSERIAL PRIMARY KEY,
    account     TEXT NOT NULL,
    -- Signed. Positive earns, negative spends. There is no separate column
    -- saying which, because a sign already says it and two sources of truth
    -- for a direction is one too many.
    points      INTEGER NOT NULL,
    reason      TEXT NOT NULL,
    -- What this entry is about: an order id, a correction reference. Part of
    -- the uniqueness constraint, which is what makes earning idempotent.
    ref         TEXT NOT NULL,
    at          TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE UNIQUE INDEX IF NOT EXISTS rewards_once
    ON ${SCHEMA}.rewards_ledger (account, reason, ref);
  CREATE INDEX IF NOT EXISTS rewards_by_account
    ON ${SCHEMA}.rewards_ledger (account, at DESC);
`;

const prepared = () => ready("rewards", DDL);

// Points per dollar spent.
//
// Ten, so that a $12 order earns 120 and the numbers feel like something
// rather than like a rounding error — the same reason airlines and coffee
// shops pick a multiplier above one. It is the shop's number to change and it
// lives here alone; nothing else in the codebase knows the rate.
//
// Earned on the subtotal, not the total. Tax is not ours and a customer
// should not earn more for living somewhere with a higher rate; a tip is the
// courier's or the counter's, and paying points on it would be the shop
// rewarding somebody for other people's money. Delivery is Uber's fee passed
// through at cost, so there is nothing there to reward either.
export const POINTS_PER_DOLLAR = 10;

export function pointsFor(subtotalCents: number): number {
  if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) return 0;
  return Math.floor((subtotalCents / 100) * POINTS_PER_DOLLAR);
}

export function accountKey(email: string): string {
  return email.trim().toLowerCase();
}

export type Member = {
  code: string;
  joinedAt: number;
  points: number;
};

/** A member code: short, unambiguous, and awkward to guess.
 *
 *  Crockford's alphabet minus the letters that are read wrong off a screen —
 *  no I, L, O or U — because this gets typed in by hand when a scanner will
 *  not cooperate, and "CB-I0L1" is three arguments waiting to happen.
 *
 *  Sixteen characters from a 32-symbol alphabet is 80 bits. That is not a
 *  secret in the cryptographic sense and does not need to be; it needs to be
 *  unguessable from another member's, and it is. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function newCode(): string {
  const bytes = randomUUID().replace(/-/g, "");
  let out = "";
  for (let i = 0; i < 16; i += 1) {
    out += ALPHABET[parseInt(bytes.slice(i * 2, i * 2 + 2), 16) % ALPHABET.length];
  }
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}-${out.slice(12)}`;
}

/** Join, or return the existing membership.
 *
 *  Idempotent on purpose. Joining twice is something a double-tap does, and
 *  the second one must not mint a second code — a customer with two codes has
 *  one of them refused at a counter. */
export async function joinRewards(email: string): Promise<Member | null> {
  const client = db();
  if (!client) return null;
  const account = accountKey(email);
  try {
    await prepared();
    // ON CONFLICT DO NOTHING then read, rather than upserting the code: an
    // upsert that writes `code` would replace a working code with a fresh one
    // on every join attempt.
    await client.query(
      `INSERT INTO ${SCHEMA}.members (account, code) VALUES ($1, $2)
         ON CONFLICT (account) DO NOTHING`,
      [account, newCode()],
    );
    return await memberOf(email);
  } catch (error) {
    console.error("[rewards] could not join:", explainDbError(error));
    return null;
  }
}

/** The membership and its balance, or null for somebody who has not joined.
 *
 *  Null is also what a missing database says, and the caller treats both the
 *  same way: no member card, and the join screen instead. A rewards balance
 *  that cannot be read must never render as zero — "you have 0 points" to
 *  somebody holding 400 is the one output here that loses trust outright. */
export async function memberOf(email: string): Promise<Member | null> {
  const client = db();
  if (!client) return null;
  const account = accountKey(email);
  try {
    await prepared();
    const result = await client.query(
      `SELECT m.code,
              m.joined_at,
              COALESCE((SELECT SUM(points) FROM ${SCHEMA}.rewards_ledger l
                         WHERE l.account = m.account), 0)::int AS points
         FROM ${SCHEMA}.members m
        WHERE m.account = $1`,
      [account],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      code: String(row.code),
      joinedAt: new Date(row.joined_at).getTime(),
      points: typeof row.points === "number" ? row.points : 0,
    };
  } catch (error) {
    console.error("[rewards] could not read a member:", explainDbError(error));
    return null;
  }
}

/** Credit points for an order. Safe to call twice for the same order.
 *
 *  Never throws and never fails an order. Points are the least important
 *  thing happening at the moment somebody buys breakfast: the kitchen has the
 *  ticket, the customer has paid attention, and a ledger write that cannot
 *  happen must not turn into a checkout that did not.
 *
 *  Silently does nothing for somebody who has not joined. Earning points into
 *  an account that never opted in would be creating a membership on their
 *  behalf, which is a thing to be asked rather than assumed. */
export async function earn(
  email: string,
  orderRef: string,
  subtotalCents: number,
): Promise<number> {
  const points = pointsFor(subtotalCents);
  if (points <= 0) return 0;
  const client = db();
  if (!client) return 0;
  const account = accountKey(email);
  try {
    await prepared();
    const result = await client.query(
      `INSERT INTO ${SCHEMA}.rewards_ledger (account, points, reason, ref)
       SELECT $1, $2, 'earn', $3
        WHERE EXISTS (SELECT 1 FROM ${SCHEMA}.members WHERE account = $1)
         ON CONFLICT (account, reason, ref) DO NOTHING
       RETURNING points`,
      [account, points, orderRef],
    );
    return result.rows[0]?.points ?? 0;
  } catch (error) {
    console.error("[rewards] could not credit points:", explainDbError(error));
    return 0;
  }
}

/** Spend points. Returns the number actually taken, or 0.
 *
 *  ⚠️ Nothing calls this yet — see the note at the top of the file. It exists
 *  and is tested because the balance check is the part that has to be right
 *  before anything is allowed to spend, and writing it under pressure later,
 *  next to a till integration, is how a loyalty scheme goes negative.
 *
 *  The check and the write are one statement. Reading the balance and then
 *  inserting is a race: two requests both read 400, both decide 300 is
 *  affordable, and the account ends at -200. Here the SELECT that produces
 *  the row is the same statement that inserts it, so the condition is
 *  evaluated against the same snapshot the write lands in. */
export async function spend(
  email: string,
  points: number,
  ref: string,
): Promise<number> {
  if (!Number.isInteger(points) || points <= 0) return 0;
  const client = db();
  if (!client) return 0;
  const account = accountKey(email);
  try {
    await prepared();
    const result = await client.query(
      `INSERT INTO ${SCHEMA}.rewards_ledger (account, points, reason, ref)
       SELECT $1, $2, 'spend', $3
        WHERE COALESCE(
                (SELECT SUM(points) FROM ${SCHEMA}.rewards_ledger WHERE account = $1),
                0
              ) >= $4
         ON CONFLICT (account, reason, ref) DO NOTHING
       RETURNING points`,
      [account, -points, ref, points],
    );
    return result.rows[0] ? points : 0;
  } catch (error) {
    console.error("[rewards] could not spend points:", explainDbError(error));
    return 0;
  }
}

export function isRewardsConfigured(): boolean {
  return isDatabaseConfigured();
}
