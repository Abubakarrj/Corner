import "server-only";
import { driveMatrixMin, geocode, type Drive } from "./googleMaps";
import { notServedAt } from "./shop/storeMenu";
import { isOpenNow, minutesUntilClose, PREP_MINUTES } from "./shopFacts";
import {
  DELIVERY_RADIUS_MILES,
  LOCATIONS,
  deliveringStores,
  milesBetween,
  nearestDelivering,
  opensAt,
  type StoreLocation,
} from "./(marketing)/locations/locations";

// Where a shop actually is, as opposed to where somebody typed it was.
//
// ——— The problem this exists for ———
//
// Every location in locations.ts carries a hand-written `position`, and the
// file's own comment admits what that is: "approximate — the block, not the
// doorway". That was fine while it only framed a map. It isn't any more,
// because the same pair is now:
//
//   the pin on /locations
//   the origin the delivery radius is measured from   (api/geo, Riley's tools)
//   the pickup point handed to the courier            (api/shop-order)
//
// A courier collecting from the middle of the block instead of the counter is
// a real minute of somebody walking up and down Wilshire with a bag,
// and a radius measured from the wrong end of a block quietly moves the
// boundary for everyone near it. "Roughly right" stops being good enough the
// moment a number leaves the building.
//
// So the address is the source of truth and the coordinates are derived from
// it, the way round they should have been: one Geocoding call per process,
// against the address already written down, with the typed pair kept as the
// answer when Google can't be reached.
//
// ——— Why not just paste better numbers in ———
//
// Because they go stale silently. A pasted pair is correct until somebody
// edits the address above it and doesn't think to re-run a lookup nobody
// documented, and there is nothing in the file that would notice. Deriving it
// means the address is the only thing to keep true.

export type StorePlace = {
  position: [number, number];
  // Google's canonical formatting of the address, when we got one. Not shown
  // anywhere yet — the cards show the address as written, which is how the
  // shop refers to itself — but it is what tells you the lookup found the
  // place you meant rather than something else on the street.
  address: string;
  // False when this is still the hand-typed pair, either because there is no
  // key or because the lookup was refused. Callers don't branch on it; it is
  // for the log line and for anybody reading a response and wondering.
  exact: boolean;
};

// How far a lookup may move a shop before we assume it found the wrong thing.
//
// The typed coordinates are wrong by a block, so a correction should be tens
// of metres. Half a mile is far more slack than a correction needs and far
// less than a mistake takes: geocoding the shop's street address against a bad
// component filter has already been observed in this codebase returning the
// centroid of the United States, and the guard in googleMaps.ts that catches
// that one works on result *types*. This catches the same class of failure by
// distance, which needs no taxonomy to be right about.
//
// Refusing means keeping the typed pair, which is the answer we already ship.
// There is no version of this where a surprising lookup silently relocates the
// shop.
const MAX_DRIFT_MILES = 0.5;

const resolved = new Map<string, StorePlace>();

// The full address as Google should be asked for it.
//
// The two fields are split in locations.ts because the cards show them on two
// lines. A geocoder wants one string.
function fullAddress(location: StoreLocation): string {
  return `${location.address}, ${location.city}`;
}

function typed(location: StoreLocation): StorePlace {
  return { position: location.position, address: fullAddress(location), exact: false };
}

// One shop's real coordinates.
//
// Memoised per process rather than per request. A street address does not move
// between two requests, and the alternative is a Geocoding call on the path of
// every delivery quote. Only successes are remembered, so a lookup that failed
// because the key wasn't set yet is retried rather than cached as "no".
export async function storePlace(location: StoreLocation): Promise<StorePlace> {
  const hit = resolved.get(location.id);
  if (hit) return hit;

  // A surveyed door beats a geocode, and there is nothing to look up.
  //
  // The geocoder's best answer is a rooftop, which is the middle of a parcel;
  // `door` is somebody having stood at the counter. Nothing Google could say
  // would improve on that, so this returns before the call rather than after
  // it, and it is `exact` in the strongest sense the field has.
  if (location.door) {
    const surveyed: StorePlace = {
      position: location.door,
      address: fullAddress(location),
      exact: true,
    };
    resolved.set(location.id, surveyed);
    return surveyed;
  }

  // Biased to the pair we already have. It is right to within a block, which
  // makes it the best possible hint for the one lookup that has to land on
  // that same block.
  const place = await geocode(fullAddress(location), location.position).catch(() => null);
  if (!place) return typed(location);

  const found: [number, number] = [place.lat, place.lng];
  const drift = milesBetween(location.position, found);
  if (drift > MAX_DRIFT_MILES) {
    console.warn(
      `[places] refusing geocode for ${location.id}: ` +
        `${JSON.stringify(place.address)} is ${drift.toFixed(2)} miles from the ` +
        `address on file, so the typed position stands. Check ` +
        `${JSON.stringify(fullAddress(location))}.`,
    );
    return typed(location);
  }

  const answer: StorePlace = { position: found, address: place.address, exact: true };
  resolved.set(location.id, answer);
  return answer;
}

// Every location, resolved. What /api/locations serves to the map.
export async function storePlaces(): Promise<Record<string, StorePlace>> {
  const entries = await Promise.all(
    LOCATIONS.map(async (location) => [location.id, await storePlace(location)] as const),
  );
  return Object.fromEntries(entries);
}

// The point a courier is told to collect from, and the centre a delivery
// radius is measured out of.
//
// A function rather than the constant it replaced, because the answer involves
// a lookup. Callers await it once at the top of a request; it is a map read
// after the first one.
//
// ——— `to` is what makes a second shop a data entry ———
//
// With one kitchen the origin is a constant and this argument changes nothing.
// With two it is the whole question: a delivery to Studio City should leave
// from the Studio City kitchen, and measuring its range from Koreatown would
// refuse an address that is four minutes from a counter.
//
// Optional, because two callers genuinely have no destination in hand — the
// finder biasing an address search, and Riley answering "how far do you
// deliver". Both want "the shop, roughly", and the first delivering shop is
// the honest answer to that as long as there is one. It stops being honest the
// day there are three, and the type is what will make that obvious: the day
// somebody has to pick, they have to pass a point.
export async function deliveryOrigin(to?: [number, number]): Promise<[number, number]> {
  const store = (to ? nearestDelivering(to) : null) ?? deliveringStores()[0] ?? LOCATIONS[0];
  const { position } = await storePlace(store);
  return position;
}

/** Every counter a delivery can leave from, at its resolved position.
 *
 *  The list the radius is measured against. Resolved rather than read off the
 *  record, because the point a courier is sent to is the geocoded address —
 *  see storePlace above. */
export async function deliveryOrigins(): Promise<[number, number][]> {
  return Promise.all(
    deliveringStores().map(async (store) => (await storePlace(store)).position),
  );
}

/** How far this point is from the nearest counter, by road, in miles.
 *
 *  ——— The rule, in one function ———
 *
 *  The shop delivers within DELIVERY_RADIUS_MILES of a counter, and there is
 *  more than one counter, so the distance that decides it is the smallest of
 *  several. Three callers ask this question — the pin picker, the address
 *  search, and the public "do you deliver to me" check — and each of them used
 *  to pick one counter and measure to that. Picking is the bug: an address two
 *  miles from one shop was being told how far it is from another.
 *
 *  Null means no road answer, which is not the same as out of range and must
 *  not be rounded to it. Every caller defers to the checkout, which asks Uber.
 *
 *  One Route Matrix call however many counters there are. */
export async function deliveryReach(to: [number, number]): Promise<Drive | null> {
  const measured = await driveMatrixMin(await deliveryOrigins(), [to]);
  return measured?.[0] ?? null;
}

// ——— Which kitchens could make this order ———
//
// Every kitchen that delivers, narrowed to the ones that make everything in
// the basket. Both counters deliver and the outlet makes a shorter menu, so
// "nearest" and "able" stopped being the same question the day the outlet
// started delivering: a sandwich to an address two streets from Western has
// to leave from Wilshire, and picking the nearer kitchen would send a courier
// to collect something nobody there can make.
//
// An empty basket narrows nothing, which is right for the callers that have
// no order in hand — pricing an address, or answering "do you deliver to me".
// Those questions are about the area, not about food.
/** How much further than the nearest able kitchen an outlet may be and still
 *  be preferred over it.
 *
 *  A mile and a half. It was chosen against the Koreatown pair and a store by
 *  USC three and a half miles from the outlet; the USC store has closed and the
 *  number holds for a better reason than it was picked for.
 *
 *  The near end is unchanged: the two Koreatown counters are seven tenths of a
 *  mile apart, so every delivery around them still behaves the way the outlet
 *  preference was written for, and a bagel order on Wilshire's own block still
 *  leaves from Western to keep the sandwich line free.
 *
 *  ⚠️ The far end stopped being a judgement call. With counters in Westwood and
 *  Studio City, the only outlet is eight miles from one and seven from the
 *  other, so a bagel delivery in either neighbourhood is nowhere near this
 *  threshold and the preference simply does not apply. Any number under about
 *  six would read the new geography the same way — which means this constant is
 *  now doing its work entirely inside Koreatown, and the day a second outlet
 *  opens next to a full store somewhere else is the day it matters again. */
export const OUTLET_DETOUR_MILES = 1.5;

export function kitchensFor(
  slugs: readonly string[],
  now: Date = new Date(),
  /** Where the order is going, when it is known. Only used to bound the
   *  outlet preference below — the open and able filters do not depend on it,
   *  so a caller with no destination still gets a correct pool. */
  to?: [number, number],
): StoreLocation[] {
  // ——— Open, first ———
  //
  // Before anything about food. The counters no longer open together, so
  // between 7 and 11 the outlet is a kitchen that delivers, can make a bagel,
  // is nearest, and is dark. Routing a courier to it books a pickup at a shut
  // door, and it is the first filter rather than the last because a shut
  // kitchen is not a candidate at all.
  //
  // The prep-time headroom is the same rule the counter's own orders get: a
  // kitchen with four minutes left is open and cannot make this.
  const lit = deliveringStores().filter(
    (store) =>
      isOpenNow(now, opensAt(store)) &&
      minutesUntilClose(now, opensAt(store)) >= PREP_MINUTES,
  );
  // Nothing open. Returned empty rather than falling back, so the caller can
  // refuse the order — see deliveryKitchen() below. Every other narrowing
  // here has a sensible fallback because the alternative is a worse choice;
  // this one's alternative is a courier sent to a locked door.
  if (lit.length === 0) return [];

  // ——— Then out of reach ———
  //
  // A counter further than the radius in a *straight line* is further than the
  // radius by road — a road is never shorter than the line it follows — so it
  // is provably out of range and can never be the right choice. Dropping it
  // here rather than discovering it at the quote is what stops the outlet
  // preference below from picking a counter the rule would then refuse, and it
  // costs nothing: it is arithmetic on two coordinates.
  //
  // Only when something survives it. If every counter is beyond the radius the
  // order is out of range whichever one is picked, and the quote is where that
  // gets said with a real road distance rather than guessed at from a line.
  //
  // ⚠️ Applied *after* the menu, and the order is the whole point.
  //
  // It ran before, and that was a bug with a shop-shaped trigger: narrowing to
  // nearby counters first can leave a neighbourhood whose only nearby counter
  // is an outlet, at which point nothing in the pool makes sandwiches, the
  // fallback below fires, and a sandwich delivery is dispatched to a counter
  // with no sandwich line. It showed up the moment an outlet was placed on the
  // far side of the city as a what-if, which is exactly the move somebody
  // would make when opening one.
  //
  // Can this counter make the order is not negotiable. How far away it is
  // decides between the ones that can, and when none of them is close enough
  // the honest answer is that the address is out of range — which the quote
  // says, from a real road distance, rather than this guessing at it from a
  // straight line.
  const near = (pool: StoreLocation[]) => {
    if (!to) return pool;
    const within = pool.filter(
      (store) => milesBetween(to, store.position) <= DELIVERY_RADIUS_MILES,
    );
    return within.length > 0 ? within : pool;
  };

  if (slugs.length === 0) return near(lit);
  const canMake = lit.filter((store) => notServedAt(store.id, slugs).length === 0);
  const able = near(canMake);

  // ——— And of those, the outlets first, within reason ———
  //
  // Not "whichever is nearest". An order an outlet can make should leave from
  // an outlet, so that the store's line stays free for the orders only it can
  // make. Nearest is the tie-break between outlets, not the rule.
  //
  // The consequence is deliberate and worth knowing: a bag of bagels going to
  // an address on the store's own block will travel from the outlet a mile
  // away. That is a slightly longer drive bought on purpose, because the
  // alternative is a sandwich order queued behind a bagel order at the only
  // counter that can make sandwiches.
  //
  // ——— Why "within reason" had to be added ———
  //
  // The trade above was priced for counters a few streets apart, and it stops
  // being a good trade at distance. With a store by USC three and a half miles
  // from the outlet, an unbounded preference sends every bagel delivery in
  // that neighbourhood past a counter eight tenths of a mile away to collect
  // from one across town. That is not a slightly longer drive: it is a longer
  // ETA and a bigger courier fee, and under the free-delivery threshold the
  // customer pays the difference to keep a sandwich line free at a shop they
  // are not ordering from.
  //
  // So the preference survives as a preference and stops being an override.
  // An outlet wins when it is not meaningfully further than the nearest
  // kitchen that could do the job; otherwise the distance does. In Koreatown,
  // where the counters are seven tenths of a mile apart, this changes nothing
  // and the paragraph above still describes what happens.
  //
  // Without a destination — pricing an area, answering "do you deliver here" —
  // there is nothing to measure, and the preference applies as it always did.
  //
  // Reads `outlet` — the label — which is the one place in the app that does.
  // Everywhere else the label describes and the flags decide, and this is the
  // exception because the rule the shop stated is about outlets as such: any
  // outlet added later inherits it by being one.
  const outlets = able.filter((store) => store.outlet);
  if (outlets.length > 0 && (to === undefined || able.length === 0)) return outlets;
  if (outlets.length > 0 && to !== undefined) {
    const nearestAble = able.reduce((best, store) =>
      milesBetween(to, store.position) < milesBetween(to, best.position) ? store : best,
    );
    const nearestOutlet = outlets.reduce((best, store) =>
      milesBetween(to, store.position) < milesBetween(to, best.position) ? store : best,
    );
    const detour =
      milesBetween(to, nearestOutlet.position) - milesBetween(to, nearestAble.position);
    if (detour <= OUTLET_DETOUR_MILES) return outlets;
  }

  if (able.length > 0) return able;
  // Open, and none of them makes all of it — a real state when every counter
  // that could is shut, and one to say out loud rather than paper over.
  //
  // ⚠️ Returns nothing, and that is the change. It used to fall back to the
  // open counters, which sounds forgiving and means "hand this order to a
  // kitchen that cannot make it" — a courier sent to collect a sandwich from a
  // counter with no sandwich line. deliveryKitchen turns an empty pool into a
  // refusal the customer can read, which is the honest end of this path.
  console.warn(
    `[places] no open delivering kitchen makes all of ${JSON.stringify(slugs)}.`,
  );
  return [];
}

/** The earliest hour any kitchen that could make this basket opens.
 *
 *  What a delivery is gated on, because a delivery is not placed at a
 *  counter: it leaves from whichever kitchen can make it, and it can be taken
 *  as soon as the first such kitchen is open. A sandwich basket has only ever
 *  had one kitchen, so this is that one's hour; a bagel basket has two, so it
 *  is the earlier of them and the routing sends it to whichever is actually
 *  lit at the time. */
export function earliestDeliveryHour(slugs: readonly string[]): number {
  const all = deliveringStores();
  const able = all.filter((store) => notServedAt(store.id, slugs).length === 0);
  const pool = able.length > 0 ? able : all;
  return pool.reduce((earliest, store) => Math.min(earliest, opensAt(store)), 24);
}

/** The kitchen a delivery of this basket would leave from right now, or null
 *  when there is no counter both open and able.
 *
 *  Null is an answer, not a failure: it is what the order endpoint checks
 *  before taking a delivery, because "we are open" is not a fact about the
 *  shop any more. At 8am with a bagel in the basket the outlet is shut and
 *  Wilshire is open, so there is a kitchen; at 6am there is none. */
export function deliveryKitchen(
  slugs: readonly string[],
  to?: [number, number],
  now: Date = new Date(),
): StoreLocation | null {
  // The destination goes in as well as being used to pick out of the pool:
  // it is what bounds the outlet preference, and a pool narrowed to one
  // outlet before the distance is looked at leaves nothing for
  // nearestDelivering to choose between.
  const pool = kitchensFor(slugs, now, to);
  if (pool.length === 0) return null;
  return (to ? nearestDelivering(to, pool) : null) ?? pool[0] ?? null;
}

/** The kitchen itself, not just its coordinates — for a courier pickup that
 *  needs the address and the name as well as the point.
 *
 *  `carrying` is the basket, as slugs. Pass it wherever there is one: it is
 *  what stops a sandwich being collected from a counter that does not make
 *  sandwiches. */
export async function deliveryStoreFor(
  to?: [number, number],
  carrying: readonly string[] = [],
): Promise<{ store: StoreLocation; place: StorePlace }> {
  // LOCATIONS[0] only when nothing is open, which the order endpoint has
  // already refused before reaching here. It is a type-level fallback rather
  // than a routing decision — this function has to return a store.
  const store = deliveryKitchen(carrying, to) ?? LOCATIONS[0];
  return { store, place: await storePlace(store) };
}
