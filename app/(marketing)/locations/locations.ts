import { OPEN_HOUR, SHOP_HOURS, hoursLine } from "../../shopFacts";

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
  // ——— The counter, when the geocoder cannot find it ———
  //
  // `position` is a hint and the geocoded address is the answer (see
  // storePlaces.ts). This is the third option, and it outranks both: a
  // coordinate somebody stood at the pickup door and read off a map.
  //
  // It exists because a rooftop geocode is the middle of a parcel, and a
  // parcel is not a doorway. On a corner unit, a shop inside a larger
  // building, or anywhere the counter faces a different street from the
  // registered address, Google's pin and the place a courier walks to are
  // tens of metres and one wrong turn apart. That error is not one bad trip:
  // the pickup is the same doorway on every delivery, so it is a constant
  // added to every quote and every ETA the shop ever gives.
  //
  // Unset for Koreatown, because nobody has stood there with a phone yet, and
  // an invented pair would be worse than the geocode it replaced. To set it:
  // drop a pin on the actual door in Google Maps, copy the coordinates, and
  // put them here. Nothing is geocoded for a shop that has one, so it is also
  // the way to pin a shop the geocoder gets wrong.
  door?: [number, number];
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
  // The hour this counter opens, when it is not the shop's usual one. They all
  // close together, so there is no closing field: see the note on OPEN_HOUR.
  //
  // Undefined is 7, so a counter keeping the usual hours says nothing. Read
  // through opensAt() below rather than directly — the point of that function
  // is that "when does this open" has one answer whether or not the record
  // bothered to say.
  opensAt?: number;
  // A counter rather than a full store: somewhere to collect from that is not
  // the kitchen and does not cater.
  //
  // Purely how the place is described. What it can actually do is the flags
  // above, and this does not set them or read them — an outlet that starts
  // delivering says so by changing `delivery`, and the word on the card is
  // still true. Kept apart on purpose: a label that silently switched
  // behaviour would be a label somebody edits for tone and changes an order
  // route by accident.
  outlet?: boolean;
  // The menu categories this counter makes, when it does not make all of
  // them. Undefined is the full menu, so a shop that serves everything says
  // nothing — which keeps the common case the quiet one and makes the
  // restriction the thing you have to write down.
  //
  // Categories rather than slugs on purpose. A counter that does bagels does
  // every bagel, and listing slugs would mean editing a location record every
  // time the menu gains an item — which is exactly the edit that gets
  // forgotten, leaving a new sandwich quietly orderable from a counter that
  // cannot make it.
  //
  // Read through servesProduct() in app/shop/storeMenu.ts rather than
  // directly. It is one question — "can this counter make this" — asked by the
  // catalog, the basket, Riley and the order endpoint, and four copies of it
  // is three chances to disagree with the kitchen.
  menu?: readonly string[];
};

// ——— The two counters ———
//
// Both given by the shop with the city, which is how an address should
// arrive. They replace 650 S Catalina St, which the shop moved off; anything
// still saying Catalina St, or 3064 W 8th St before it, is stale and should be
// corrected rather than worked around. Same neighbourhood and the same city
// sales-tax rate as both of the addresses before them, so nothing downstream
// of the address changes except the address.
//
// The coordinates on each are approximate — the block, not the doorway — and
// they are the fallback rather than the answer. app/storePlaces.ts resolves
// each address through Geocoding on the server; the map merges the result over
// what is written here (see useStoreLocations), and the delivery radius and the
// courier's pickup point are measured from it directly. These pairs only have
// to be close enough to bias that lookup onto the right block and to draw a
// reasonable map when there is no key. They are inside the half-mile drift
// guard in storePlaces.ts, so a good geocode is accepted rather than refused —
// which is the check to re-run if either address is ever corrected.
//
// Neither has a `door` yet. Both need one, and the Wilshire suite needs it
// most: see the note on the field above, and the note on that record.

// The store, and the kitchen every delivery leaves from.
export const WILSHIRE: StoreLocation = {
  id: "wilshire",
  name: "Wilshire Blvd",
  kind: "shop",
  // The suite is part of the address, not a note about it. R3452H is how the
  // building numbers the unit, and a courier reading "3450 Wilshire Blvd" with
  // no suite is a courier standing in a lobby with a phone in their hand.
  address: "3450 Wilshire Blvd, Suite R3452H",
  city: "Los Angeles, CA 90010",
  hours: SHOP_HOURS,
  // Wilshire just west of Normandie.
  position: [34.0617, -118.3006],
  catering: true,
  // ⚠️ A suite inside a larger building is exactly the case `door` exists for.
  // A rooftop geocode here is the middle of the building, and the counter is
  // one unit inside it: every delivery leaves from this doorway, so the error
  // is not one bad trip but a constant added to every quote and every ETA the
  // shop gives. Drop a pin on the actual door in Google Maps and put the pair
  // in `door` above.
  // Its own ZIP and no others. Both counters are in Koreatown and the
  // neighbourhood words below find both, which is right; a ZIP is exact and
  // listing a neighbour's would make "90020" a coin toss decided by array
  // order.
  aliases: [
    "wilshire",
    "wilshire blvd",
    "wilshire boulevard",
    "3450 wilshire",
    "mid wilshire",
    "wilshire center",
    "normandie",
    "ktown",
    "k town",
    "k-town",
    "kt",
    "koreatown",
    "korea town",
    "korean town",
    "la",
    "los angeles",
    "90010",
    "downtown la",
    "dtla",
  ],
};

// The outlet: a counter, not a full store.
//
// It is `outlet` rather than a second `kind` because it is not a different
// sort of place from a shop, it is a smaller one — the same counter doing less
// of the job. Kind answers "what happens here", and the honest answers for
// this address are the two flags below: it can be collected from, and it does
// not cater and is not a kitchen a delivery leaves from. Anyone reading the
// finder gets told which it is rather than working it out from a shorter list
// of buttons.
export const WESTERN: StoreLocation = {
  id: "western",
  name: "Western Ave",
  kind: "shop",
  outlet: true,
  address: "355 S Western Ave #101",
  city: "Los Angeles, CA 90020",
  // Opens at 11, four hours after the store. The line below is built from
  // that number rather than typed beside it, so the hours somebody reads and
  // the clock that decides whether the counter will take their order cannot
  // disagree.
  opensAt: 11,
  hours: hoursLine(11),
  // Western between 3rd and 4th.
  position: [34.0685, -118.3092],
  // An outlet is smaller, not narrower in what it will do for you: it
  // collects, it caters and a delivery can leave from it, same as the store.
  // Both are the defaults, so neither is written here — what makes this an
  // outlet is the shorter menu below, and nothing else.
  //
  // Bagels, spreads and drinks. No sandwiches: this counter has no line to
  // build one on, and a sandwich orderable here is a customer standing at a
  // counter being told no by a person rather than by the app.
  //
  // ⚠️ The menu applies to every mode, not only to walking up. A tray from
  // here is a tray of these three, and a delivery that leaves from here can
  // only carry them — which is why deliveryStoreFor takes the basket. Sending
  // a sandwich order to the nearest kitchen without asking whether it makes
  // sandwiches is the bug this record would otherwise introduce.
  catering: true,
  menu: ["Bagels", "Spreads", "Drinks"],
  aliases: [
    "western",
    "western ave",
    "western avenue",
    "s western",
    "355 western",
    "outlet",
    "ktown",
    "k town",
    "k-town",
    "kt",
    "koreatown",
    "korea town",
    "korean town",
    "la",
    "los angeles",
    "90020",
    "wilshire center",
    "mid wilshire",
  ],
};

// Two counters, and everything around them is written for several.
//
// That generality was here before the second address arrived, on the shop's
// stated plan to hold a ten-mile radius until it opened more counters, and it
// is what made this a small change: adding a shop is adding a record to this
// array. Nothing names one location as "the shop" — see nearestDelivering
// above and deliveryOrigin in storePlaces.ts, both of which take the list as
// it is.
//
// Order matters slightly and only as a fallback: deliveringStores()[0] is
// where a delivery leaves from when nothing better is known, so the store
// comes first and the outlet second.
export const LOCATIONS: StoreLocation[] = [WILSHIRE, WESTERN];

/** When a counter opens, as an hour of the day.
 *
 *  One question, one answer, whether or not the record says. Every caller
 *  that has a counter in hand should go through this rather than reading the
 *  field, because a caller reading the field has to remember the default and
 *  a caller that forgets gets 7 for a counter that opens at 11 — which is an
 *  app telling somebody a shut door is open. */
export function opensAt(store: StoreLocation | null | undefined): number {
  return store?.opensAt ?? OPEN_HOUR;
}

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
 *  rather than a case to paper over.
 *
 *  The pool is an argument because "which kitchens are eligible" is not
 *  always "which kitchens deliver". Now that both counters deliver and one of
 *  them makes a shorter menu, a delivery carrying a sandwich has fewer
 *  kitchens to choose between than a delivery carrying bagels — and the
 *  narrowing is the caller's, since this module deliberately knows nothing
 *  about products. See deliveryStoreFor in storePlaces.ts. */
export function nearestDelivering(
  to: [number, number],
  pool: StoreLocation[] = deliveringStores(),
): StoreLocation | null {
  const open = pool;
  if (open.length === 0) return null;
  return open.reduce((best, store) =>
    milesBetween(to, store.position) < milesBetween(to, best.position) ? store : best,
  );
}

// What every shop answers to, regardless of which one it is. Kept apart from
// each location's own aliases so a second shop inherits them instead of
// copying them — "corner bagel wilshire" should find the Wilshire store,
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
  // Catering matches on capability rather than kind: the Wilshire store
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
// city. "Beverly Hills" is in neither counter's aliases and never will
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
export const DELIVERY_ORIGIN = WILSHIRE;

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
