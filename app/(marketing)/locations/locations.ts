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
  // ——— What this shop will and will not do ———
  //
  // Both default to true, so adding a shop is adding an address and nothing
  // else. They exist because a second shop is not automatically a second
  // everything: a kitchen with no counter takes deliveries and no collections,
  // a small counter in a food hall is the reverse, and a shop being *listed*
  // is a separate fact from a shop being able to take an order today.
  //
  // Read through pickupStores() and deliveringStores() rather than directly —
  // a shop that opts out of pickup must not appear in a pickup list, and a
  // caller that filters by hand is a caller that will forget to.
  pickup?: boolean;
  delivery?: boolean;
};

// The shop, and the kitchen every delivery leaves from.
//
// The city is inferred, not given: the address was supplied as "3064 W 8th
// Street" with no city, and W 8th Street runs through Los Angeles's
// Koreatown — which matches both the location's name and the +1 213 number
// the drop-list welcome email links to. An earlier pass had this pin in
// Manhattan on the same reasoning about "Korean Town", which was wrong.
//
// The street number was confirmed by the shop as 3064 rather than 3076.
//
// The coordinates are approximate — the block, not the doorway — and they are
// now the fallback rather than the answer. app/storePlaces.ts resolves this
// address through Geocoding on the server; the map merges the result over
// what's written here (see useStoreLocations), and the delivery radius and the
// courier's pickup point are measured from it directly.
//
// Which makes the address above the thing to keep true. These two numbers only
// have to be close enough to bias the lookup toward the right block and to
// draw a reasonable map when there is no key, and they are both.
export const KOREATOWN: StoreLocation = {
  id: "koreatown",
  // The shop's own spelling, set by the owner. The neighbourhood is
  // conventionally "Koreatown"; this is what the counter calls itself, and a
  // shop gets to name itself. "koreatown" is in the aliases below so a search
  // for the usual spelling still finds it.
  //
  // The id stays `koreatown` on purpose. It is written into stored
  // fulfillments, order records and the OPENINGS rows, so changing it would
  // orphan every one of them; only the display name moves.
  name: "Koreantown",
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
    // The neighbourhood's usual spelling, which is not the shop's. Anybody
    // typing it means this counter.
    "koreatown",
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

// ⚠️ One shop today, and everything below is written for several.
//
// That is deliberate rather than speculative. The shop's stated plan is to
// hold a ten-mile radius until it opens more counters, and the work that has
// to happen when it does is the work that is easy to get wrong under time
// pressure: which kitchen a delivery leaves from, which counters can be
// collected from, and what "how far away are you" means when the answer
// depends on which shop you meant.
//
// So adding a second shop is adding a record to this array. Nothing else in
// the codebase names KOREATOWN as "the shop" any more — see nearestDelivering
// below, and deliveryOrigin in storePlaces.ts, both of which already do the
// right thing for a list of one.
//
// What is *not* built is a store picker on screen. A list of nearby shops with
// one row in it reads as a list that lost its other rows, and the choice it
// offers does not exist yet.
export const LOCATIONS: StoreLocation[] = [KOREATOWN];

/** A shop's address split the way a courier API wants it.
 *
 *  Derived from the record rather than written a second time in shopFacts.
 *  With one shop the two agreed; with two, a constant pickup address beside a
 *  chosen pickup *coordinate* is a courier sent to the right point with the
 *  wrong street on the docket — and the docket is what they read.
 *
 *  `city` on a StoreLocation is "Los Angeles, CA 90005", which is how a card
 *  shows it and not how an API wants it, so it is split here. A record whose
 *  city does not parse falls back to putting the whole string in the city
 *  field, which is wrong but visible, rather than silently dropping a ZIP. */
export function addressParts(store: StoreLocation): {
  street: string;
  city: string;
  state: string;
  zip: string;
} {
  const match = /^(.*),\s*([A-Z]{2})\s*(\d{5})(?:-\d{4})?$/.exec(store.city.trim());
  if (!match) {
    return { street: store.address, city: store.city, state: "", zip: "" };
  }
  return { street: store.address, city: match[1].trim(), state: match[2], zip: match[3] };
}

/** Shops somebody can collect from. */
export function pickupStores(): StoreLocation[] {
  return LOCATIONS.filter((store) => store.kind === "shop" && store.pickup !== false);
}

/** Kitchens a delivery can leave from. */
export function deliveringStores(): StoreLocation[] {
  return LOCATIONS.filter((store) => store.delivery !== false);
}

/** The kitchen a delivery to this point leaves from.
 *
 *  Straight-line, and that is the right ruler for this one job: it picks
 *  *which* shop, and the drive from the winner is measured properly by Routes
 *  afterwards. Road-routing every shop against every address to choose between
 *  them would be a Route Matrix call per address search to break a tie that a
 *  straight line gets right almost every time — and when it doesn't, the two
 *  shops are close enough together that either could serve.
 *
 *  Null when no shop delivers at all, which is a configuration to notice
 *  rather than a case to paper over. */
export function nearestDelivering(to: [number, number]): StoreLocation | null {
  const open = deliveringStores();
  if (open.length === 0) return null;
  return open.reduce((best, store) =>
    milesBetween(to, store.position) < milesBetween(to, best.position) ? store : best,
  );
}

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

// How near a shop has to be to a searched place to count as being *in* it.
//
// A judgement, not a fact. Somebody searching "Santa Monica" is asking where
// they can pick up around there, and a counter twelve miles inland is not an
// answer to that question, however much we'd like it to be. Fifteen miles is
// wide enough to cover a city and its neighbouring ones, tight enough that
// "no shops in Pasadena" still gets said when it's true.
export const SEARCH_RADIUS_MILES = 15;

export type NearbyLocation = { location: StoreLocation; miles: number };

// Our own shops, ranked by how far they are from a point.
//
// This is the other half of searching, and the half that was missing. The text
// search below can only find a shop by something written on it: its name, its
// address, or an alias somebody thought to list. That works for "ktown" and
// for "90005", and it fails for every other way of naming the same patch of
// city. "Beverly Hills" is not in the Koreatown shop's aliases and never will
// be, because the list of places near a shop is not a list anybody can finish.
//
// Distance doesn't need the list. Once a searched place has coordinates, which
// picking a suggestion already gives us, "which of ours is near here" is
// arithmetic. So the two work together: words find a shop by its name, and
// this finds it by where it is.
//
// Straight-line miles, deliberately. This ranks and it labels; it does not
// decide anything. Driving distance is a billed call per shop per search, and
// the difference between 5.8 and 7.1 miles changes nothing about which card
// sits on top.
export function nearestLocations(
  point: [number, number],
  kind: LocationKind,
  pool: StoreLocation[] = LOCATIONS,
): NearbyLocation[] {
  return pool
    .filter((location) =>
      kind === "catering"
        ? location.catering === true
        : // A shop that has opted out of pickup is still a shop and still on
          // the map — it just cannot be collected from, so it must not appear
          // in the list somebody is choosing a counter out of.
          location.kind === kind && (kind !== "shop" || location.pickup !== false),
    )
    .map((location) => ({ location, miles: milesBetween(point, location.position) }))
    .sort((a, b) => a.miles - b.miles);
}

// What the map is currently showing, in plain numbers.
//
// This used to be Leaflet's LatLngBounds passed straight out of the map
// component. It isn't any more, and it shouldn't have been either way:
// "which shops are on screen" is a question about
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
// Ten, not eight. Eight contradicted the rate card the customer is shown:
// DELIVERY_BANDS has a 7–10 mile row at $10.99, so an address nine miles out
// was quoted a price by the fee sheet and then refused by this check. One of
// the two numbers had to move, and the shop's rule is ten until there is a
// second kitchen to be nearer to.
//
// This is also the number the delivery-area map draws — see app/deliveryArea.ts.
// A published map is a promise, so changing this changes what the shop has
// told people, not just what it accepts.
export const DELIVERY_RADIUS_MILES = 10;

// Great-circle distance in miles.
//
// No longer the radius check. That's the Routes API's driving distance, measured
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
