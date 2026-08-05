import { SHOP_HOURS } from "../../shopFacts";

// The two kinds of place an order can come out of, which is what the Pickup /
// Catering split in the finder is: a shop is a counter you walk up to, a
// catering kitchen is one set up to build a tray for an office or an event.
// Delivery isn't a kind of place — it's a mode that asks for the visitor's
// address instead — so it has no entries here.
//
// Nothing is a "catering" *kind* — catering comes out of the shop, flagged
// per location below. The kind stays in the model for the day there's a
// kitchen that only caters.
export type LocationKind = "shop" | "catering";

// Imported rather than repeated: the hours were "Hours to come" here while
// three other screens said nothing at all, which is how a shop ends up
// telling people two different things.
export { SHOP_HOURS } from "../../shopFacts";

export type StoreLocation = {
  id: string;
  name: string;
  kind: LocationKind;
  address: string;
  city: string;
  hours: string;
  // [latitude, longitude]
  position: [number, number];
  // The other things people call this place. A shop's official name is
  // rarely what someone types: "Koreatown" gets typed "ktown", "k town" and
  // "kt", and plenty of people search the neighbourhood by the ZIP or by
  // "LA" and expect the shop there to come up. None of that is derivable
  // from the name and address, so it's listed.
  aliases: string[];
  // Whether this place can put together a catering order. Separate from
  // `kind` because catering isn't a different address — it's the same counter
  // doing a different job, and modelling it as a second location would put a
  // duplicate pin on the map at the same coordinates.
  catering?: boolean;
};

// The shop, and the kitchen every delivery leaves from.
//
// The city is inferred, not given: the address was supplied as "3064 W 8th
// Street" with no city, and W 8th Street runs through Los Angeles's
// Koreatown — which matches both the location's name and the +1 213 number
// the drop-list welcome email links to. An earlier pass had this pin in
// Manhattan on the same reasoning about "Korean Town", which was wrong.
// Worth confirming.
//
// The coordinates are approximate — the block, not the doorway. They are
// only used to frame the map and to measure the delivery radius, and both
// tolerate a hundred metres; resolving the address through Places once and
// pasting the exact pair back here would settle it.
export const KOREATOWN: StoreLocation = {
  id: "koreatown",
  name: "Koreatown",
  kind: "shop",
  address: "3064 W 8th St",
  city: "Los Angeles, CA 90005",
  hours: SHOP_HOURS,
  position: [34.0578, -118.296],
  catering: true,
  aliases: [
    "ktown",
    "k town",
    "k-town",
    "kt",
    "korea town",
    "korean town",
    "la",
    "los angeles",
    "90005",
    "90006",
    "90020",
    "wilshire center",
    "mid wilshire",
    "8th street",
    "8th st",
    "w 8th",
    "downtown la",
    "dtla",
  ],
};

export const LOCATIONS: StoreLocation[] = [KOREATOWN];

// What every shop answers to, regardless of which one it is. Kept apart from
// each location's own aliases so a second shop inherits them instead of
// copying them — "corner bagel koreatown" should find the Koreatown shop,
// and so should "corner bagel" plus whatever comes next.
const BRAND_ALIASES = ["corner", "corner bagel", "bagel", "bagels", "cornerbagel"];

// Matching a typed query against our own locations, the same way the pantry's
// product search works (searchProducts in app/shop/products.ts): split the
// query into words, require every word to match something, and score by how
// good each match was so the best row sorts first.
//
// Requiring every word is what keeps "koreatown chicago" from returning the
// LA shop just because one word landed. Scoring is what puts a name match
// above a ZIP match when both hit.
export function searchLocations(
  query: string,
  kind: LocationKind,
  pool: StoreLocation[] = LOCATIONS,
): StoreLocation[] {
  // Catering matches on capability rather than kind: the Koreatown shop
  // caters, and searching for it under Catering has to find it.
  const wanted = (location: StoreLocation) =>
    kind === "catering" ? location.catering === true : location.kind === kind;
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const scored: { location: StoreLocation; score: number; order: number }[] = [];

  pool.forEach((location, order) => {
    if (!wanted(location)) return;

    const name = location.name.toLowerCase();
    const nameWords = name.split(/\s+/);
    const address = location.address.toLowerCase();
    const city = location.city.toLowerCase();
    const aliases = [...location.aliases, ...BRAND_ALIASES].map((a) => a.toLowerCase());

    let score = 0;
    for (const word of words) {
      if (name.startsWith(word)) score += 100;
      else if (nameWords.some((w) => w.startsWith(word))) score += 60;
      else if (name.includes(word)) score += 30;
      // An alias that starts with the word beats one that merely contains it,
      // so "kt" reaches "ktown" rather than only ever matching by luck.
      else if (aliases.some((alias) => alias.startsWith(word))) score += 45;
      else if (aliases.some((alias) => alias.includes(word))) score += 20;
      else if (address.includes(word)) score += 15;
      else if (city.includes(word)) score += 10;
      else return; // this word matched nothing — the location is out
    }

    scored.push({ location, score, order });
  });

  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((hit) => hit.location);
}

// What the map is currently showing, in plain numbers.
//
// This used to be Leaflet's LatLngBounds passed straight out of the map
// component. It isn't any more — the map is MapLibre now — and it shouldn't
// have been either way: "which shops are on screen" is a question about
// latitude and longitude, and typing it as one library's class made every
// caller import that library to ask it.
export type MapBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export function withinBounds(
  bounds: MapBounds,
  [lat, lng]: [number, number],
): boolean {
  return (
    lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east
  );
}

// Deliveries leave from the shop, so the radius is measured from its door.
// If a second kitchen ever delivers, this becomes a per-location decision
// rather than one origin.
export const DELIVERY_ORIGIN = KOREATOWN;

// How far we'll deliver, in driving miles from the shop. Named here rather
// than buried in the check, and it's the one number to change when the shop
// decides differently. Uber Direct quotes the actual job on top of this — a
// courier refusing a run is the harder limit, and it's the one that costs
// money to hit, so this stays the cheap first filter.
export const DELIVERY_RADIUS_MILES = 8;

// Great-circle distance in miles.
//
// No longer the radius check — that's Radar's driving distance now, measured
// server-side in app/api/geo/route.ts, because five miles of Los Angeles
// street grid is nothing like five miles of straight line. This stays as the
// fallback for when routing is unreachable, and for anywhere a rough distance
// is all that's wanted.
export function milesBetween(
  [lat1, lon1]: [number, number],
  [lat2, lon2]: [number, number],
): number {
  const R = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// The whole-country view the finder opens on, matching the reference: no
// location assumed, nothing preselected, the map showing the lower 48 until
// the visitor searches or shares their position.
//
// Expressed as bounds rather than a centre and zoom so the framing survives
// a change of map height. A fixed zoom fits the country at one viewport and
// crops it at the next.
export const INITIAL_BOUNDS: [[number, number], [number, number]] = [
  [24.5, -124.8],
  [49.4, -66.9],
];
