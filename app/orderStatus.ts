// Where an order actually is, as opposed to where the clock says it should be.
//
// Two feeds, because an order has two halves and nobody owns both:
//
//   Toast   the food. RECEIVED → IN_PREPARATION → READY_FOR_PICKUP → CLOSED,
//           driven by somebody pressing Order Ready in Orders Hub.
//   Uber    the courier, on a delivery. pending → pickup → dropoff →
//           delivered.
//
// A pickup order only ever has the first. A delivery has both, and they run in
// sequence: the food is ready, then a courier collects it.
//
// ——— Webhooks are a doorbell, not a delivery ———
//
// The endpoints in app/api/toast/fulfillment and app/api/uber/delivery verify
// the signature and then throw the body away. All they do is call refresh()
// below, which asks the provider's authenticated API what the status actually
// is.
//
// That is deliberate and it is worth being clear about why, because the
// obvious implementation — read the status out of the POST body — is one line
// shorter and considerably worse.
//
// Uber documents its signature exactly: HMAC-SHA256 of the raw body, hex,
// against X-Postmates-Signature. Toast's is HMAC-SHA256 too, but the string it
// signs is the body concatenated with a timestamp from the payload, and the
// exact form of that concatenation is not something I could pin down from the
// documentation available to me. A signature check written against a guess is
// a signature check that might pass anything.
//
// So the signature is verified — it costs nothing and rejects junk early — but
// it is not what the status rests on. Get the scheme subtly wrong and the
// worst an attacker achieves is making this server call Toast about an order
// id it already knew. They cannot make a customer's phone say READY. The thing
// that says READY is Toast, over an authenticated connection, every time.
//
// ——— Memory, and why that is survivable ———
//
// This is a Map, not a database. Same shape and the same caveats as the rate
// limiter in /api/drop-list: it resets on deploy and does not span instances.
//
// What makes that acceptable here rather than merely cheap is that the store
// is a cache and never the record. Every read that misses, or finds something
// old, goes and asks the provider. A restart costs one extra API call per
// order being watched, not a customer staring at a stale screen. Toast asks
// integrations to poll a fallback API in case a webhook is missed, and this is
// that fallback — the same path serves both.
//
// Swapping this for Redis later means replacing read() and write(). Nothing
// above them needs to know.

import { announce } from "./push/announce";
import { fetchToastOrder } from "./toast";
import { fetchDelivery } from "./uberDirect";
import {
  courierStageOf,
  foodStageOf,
  type LiveStatus,
} from "./orderStages";

export type { FoodStage, CourierStage, LiveStatus } from "./orderStages";
export { foodStageOf, courierStageOf } from "./orderStages";

// Long enough to cover the longest order anybody waits through, short enough
// that a forgotten entry clears itself. Nothing here is personal data — an
// opaque provider id and a word — but a Map that only grows is still a leak.
const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ENTRIES = 5000;
// How long a status is served before it is worth asking again. The tracker
// polls per customer; this is what stops ten people watching one order from
// becoming ten calls to Toast.
const FRESH_MS = 15_000;

type Key = `toast:${string}` | `uber:${string}`;
const store = new Map<Key, LiveStatus>();

function read(key: Key, now: number): LiveStatus | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (now - entry.at > TTL_MS) {
    store.delete(key);
    return undefined;
  }
  return entry;
}

function write(key: Key, status: LiveStatus): void {
  if (store.size >= MAX_ENTRIES) {
    // Oldest first. Map keeps insertion order, and an entry past its TTL is
    // the one nobody will miss.
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, status);
}


/** Ask the provider what it says now, and remember the answer.
 *
 *  Called by the webhook endpoints — which is the fast path, within a second
 *  of somebody pressing Order Ready — and by a stale read, which is the path
 *  that heals a missed message. */
export async function refresh(
  kind: "toast" | "uber",
  id: string,
  now: number = Date.now(),
): Promise<LiveStatus | undefined> {
  if (kind === "toast") {
    const state = await fetchToastOrder(id);
    const food = foodStageOf(state?.fulfillment ?? null);
    if (!state || food === undefined) return undefined;
    const was = read(`toast:${id}`, now)?.food;
    const status: LiveStatus = { food, at: now };
    write(`toast:${id}`, status);
    // Only on a change. refresh() is also the polling path, so notifying on
    // every call would buzz a phone every fifteen seconds for as long as the
    // bagels take.
    if (was !== food) await announce("toast", id, food);
    return status;
  }
  const state = await fetchDelivery(id);
  const courier = courierStageOf(state?.status ?? null);
  if (!state || courier === undefined) return undefined;
  const was = read(`uber:${id}`, now)?.courier;
  const status: LiveStatus = { courier, at: now };
  write(`uber:${id}`, status);
  if (was !== courier) await announce("uber", id, courier);
  return status;
}

/** The current status of an order's two halves, from cache when it is fresh
 *  and from the provider when it isn't.
 *
 *  Both ids are optional: a pickup order has no courier, and an order placed
 *  before any of this existed has neither. Missing everything is not an error
 *  — it is the answer "we don't know", which the tracker already handles,
 *  because not knowing is all it has ever done. */
export async function statusOf(
  ids: { toastGuid?: string; deliveryId?: string },
  now: number = Date.now(),
): Promise<LiveStatus | null> {
  const parts = await Promise.all([
    ids.toastGuid ? resolve("toast", ids.toastGuid, now) : undefined,
    ids.deliveryId ? resolve("uber", ids.deliveryId, now) : undefined,
  ]);
  const food = parts[0]?.food;
  const courier = parts[1]?.courier;
  if (food === undefined && courier === undefined) return null;
  return {
    ...(food === undefined ? {} : { food }),
    ...(courier === undefined ? {} : { courier }),
    at: Math.max(parts[0]?.at ?? 0, parts[1]?.at ?? 0),
  };
}

async function resolve(
  kind: "toast" | "uber",
  id: string,
  now: number,
): Promise<LiveStatus | undefined> {
  const cached = read(`${kind}:${id}` as Key, now);
  if (cached && now - cached.at < FRESH_MS) return cached;
  const fresh = await refresh(kind, id, now).catch(() => undefined);
  // A provider that is down or slow leaves whatever we last knew standing,
  // rather than blanking a screen somebody is watching.
  return fresh ?? cached;
}

/** Test seam. Nothing in the app calls this. */
export function __resetOrderStatus(): void {
  store.clear();
}
