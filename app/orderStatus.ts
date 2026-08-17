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
import { leaveQueue } from "./kitchenQueue";
import { fetchToastOrder } from "./toast";
import { fetchDelivery } from "./uberDirect";
import {
  courierStageOf,
  foodStageOf,
  type CourierStage,
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
    // Off the counter. "ready" is somebody pressing Order Ready with the bag
    // in front of them, which is the most trustworthy signal in this system
    // and a better reason to stop counting an order than any clock. The queue
    // has a staleness cutoff too, for when this never arrives.
    if (food === "ready" || food === "done" || food === "voided") {
      await leaveQueue(id);
    }
    // Only on a change. refresh() is also the polling path, so notifying on
    // every call would buzz a phone every fifteen seconds for as long as the
    // bagels take.
    if (was !== food) await announce("toast", id, food);
    return status;
  }
  // Straight to Uber, every time the cache above is stale. The webhook is a
  // fast path onto the same store and not the source: with no webhook
  // registered at all this still tells the tracker where the courier is,
  // twenty seconds behind at worst.
  const state = await fetchDelivery(id);
  if (!state) return undefined;

  const courier = courierStageOf(state.status);

  // ——— One unrecognised word used to discard the whole answer ———
  //
  // This read `if (!state || courier === undefined) return undefined`, which
  // conflated two different failures: Uber not answering, and Uber answering
  // with a status word this app has no mapping for. The second threw away a
  // perfectly good response — the arrival time, the latest arrival, the
  // courier's name, their number, the about-to-arrive flag — because one
  // field of it was unfamiliar.
  //
  // It would have taken exactly one new status in Uber's vocabulary to blank
  // the live half of the tracker while every request succeeded, and the only
  // symptom would have been a screen that quietly went back to guessing.
  //
  // So the stage is now the optional part. Everything else Uber said is kept
  // and served; `courier` is simply absent, which the stage logic already
  // treats as "no report" and answers with the clock.
  if (courier === undefined && state.status) {
    console.warn(
      `[status] Uber reports "${state.status}" for ${id}, which maps to no stage.` +
        ` Keeping the rest of the response; the stage falls back to the estimate.` +
        ` Add it to courierStageOf in app/orderStages.ts.`,
    );
  }

  const before = read(`uber:${id}`, now);
  const was = before?.courier;
  const wasNear = before?.courierNear === true;
  // The ETA and the courier ride along with the stage rather than being
  // fetched separately: they came out of the same response, and splitting
  // them would mean two calls to say one thing.
  const status: LiveStatus = {
    ...(courier === undefined ? {} : { courier }),
    ...(state.dropoffEta === null ? {} : { etaAt: state.dropoffEta }),
    ...(state.courierName === null ? {} : { courierName: state.courierName }),
    ...(state.courierVehicle === null ? {} : { courierVehicle: state.courierVehicle }),
    ...(state.courierImminent ? { courierNear: true as const } : {}),
    ...(state.courierPhone === null ? {} : { courierPhone: state.courierPhone }),
    ...(state.dropoffDeadline === null ? {} : { deadlineAt: state.dropoffDeadline }),
    at: now,
  };
  write(`uber:${id}`, status);
  // Still only on a stage change. An ETA that slides by a minute is not
  // worth a notification, and Uber's does slide. A stage we could not read is
  // not a change to announce either.
  if (courier !== undefined && was !== courier) await announce("uber", id, courier);

  if (announcesArrival(wasNear, state.courierImminent, courier)) {
    await announce("uber", id, "arriving");
  }
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
  // ——— "Nothing to report" is about the providers, not about the words ———
  //
  // This asked whether either half produced a *stage*, which is the same
  // conflation refresh() had a few lines up: a delivery whose status word we
  // could not map has an arrival time, a latest arrival, a courier and a
  // number, and every one of them was thrown away here for want of a fifth
  // thing. The tracker was told "unknown" about an order Uber had just
  // described in detail.
  //
  // Null means neither provider answered. That is the case the tracker's
  // estimate exists for, and it is the only one.
  if (parts[0] === undefined && parts[1] === undefined) return null;
  // The courier half also carries the ETA and who is driving. Named one at a
  // time rather than spread, because this crosses into the browser: every
  // field listed here is a field a customer can read, and that list should be
  // something somebody chose rather than whatever the Uber client happened to
  // pick up.
  // Named one at a time, still. `courierPhone` is on this list deliberately
  // and not by accident of spreading: it is a phone number crossing into a
  // browser, it is Uber's to publish rather than ours to invent, and it is
  // there so somebody standing at a door with no bag can ring the person
  // holding it.
  const { etaAt, courierName, courierVehicle, courierNear, courierPhone, deadlineAt } =
    parts[1] ?? {};
  return {
    ...(etaAt === undefined ? {} : { etaAt }),
    ...(courierName === undefined ? {} : { courierName }),
    ...(courierVehicle === undefined ? {} : { courierVehicle }),
    ...(courierNear === undefined ? {} : { courierNear }),
    ...(courierPhone === undefined ? {} : { courierPhone }),
    ...(deadlineAt === undefined ? {} : { deadlineAt }),
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


/** Whether this refresh is the moment to say "he's about to arrive".
 *
 *  ——— The one alert that is not a stage ———
 *
 *  A phone in a pocket learns nothing from the tracker, because the tracker
 *  polls only while somebody is looking at it. refresh() is also what the Uber
 *  webhook calls, on every event Uber sends including a courier update, so
 *  routing this through here is what makes it reach a closed app.
 *
 *  ——— On the transition, and only there ———
 *
 *  courier_imminent stays true for the rest of the trip. Announcing whenever
 *  it is set would buzz a phone every fifteen seconds until the door opened,
 *  which is the fastest way to have somebody turn notifications off for good.
 *
 *  ——— And not on top of the end of the order ———
 *
 *  A response that reached "delivered" or "canceled" has already said the more
 *  important thing in the same breath. Two notifications about one bag a
 *  second apart is worse than either on its own.
 *
 *  Its own function because it is a rule rather than a line: it has three
 *  inputs, two of them are easy to get the wrong way round, and none of the
 *  ways it can be wrong is visible from a screen. */
export function announcesArrival(
  wasNear: boolean,
  isNear: boolean,
  courier: CourierStage | undefined,
): boolean {
  if (!isNear || wasNear) return false;
  return courier !== "delivered" && courier !== "canceled";
}

/** Test seam. Nothing in the app calls this. */
export function __resetOrderStatus(): void {
  store.clear();
}
