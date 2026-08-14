import "server-only";
import { geocode } from "./googleMaps";
import {
  LOCATIONS,
  deliveringStores,
  milesBetween,
  nearestDelivering,
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
// a real minute of somebody walking up and down W 8th Street with a bag, and
// a radius measured from the wrong end of a block quietly moves the boundary
// for everyone near it. "Roughly right" stops being good enough the moment a
// number leaves the building.
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
// less than a mistake takes: geocoding "3064 W 8th St" against a bad component
// filter has already been observed in this codebase returning the centroid of
// the United States, and the guard in googleMaps.ts that catches that one
// works on result *types*. This catches the same class of failure by distance,
// which needs no taxonomy to be right about.
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

/** The kitchen itself, not just its coordinates — for a courier pickup that
 *  needs the address and the name as well as the point. */
export async function deliveryStoreFor(
  to?: [number, number],
): Promise<{ store: StoreLocation; place: StorePlace }> {
  const store = (to ? nearestDelivering(to) : null) ?? deliveringStores()[0] ?? LOCATIONS[0];
  return { store, place: await storePlace(store) };
}
