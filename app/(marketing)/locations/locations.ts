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
  // ——— ⚠️ The combined sales tax rate here, when it is not the shop's usual ———
  //
  // Undefined is TAX_RATE in app/shop/money.ts, which is Los Angeles County's
  // 9.75%. Every counter shared that until one opened outside the county's
  // cities: Pasadena levies its own transactions tax on top, so an order
  // collected there is owed a different rate than one collected in Koreatown.
  //
  // A rate rather than a city name, because the thing that varies is a number
  // and the thing that decides it is a jurisdiction boundary no address field
  // in this record describes. Writing "Pasadena" here would mean something
  // downstream had to keep a table of California district rates; writing the
  // rate means the record says what it knows.
  //
  // ⚠️ This is a remittance figure, not a display one. A counter charging 9.75%
  // in a 10.5% district is not showing a wrong number on a screen — it is
  // collecting less than the state is owed, and the difference comes out of the
  // shop's margin at remittance time. That is the same failure the note on
  // TAX_RATE describes for the Measure A change, and it is why this is a field
  // rather than a rounding somebody can defer.
  taxRate?: number;
};

// ——— The counters ———
//
// Each given by the shop with the city, which is how an address should
// arrive. The two Koreatown ones replace 650 S Catalina St, which the shop
// moved off; anything still saying Catalina St, or 3064 W 8th St before it, is
// stale and should be corrected rather than worked around.
//
// ⚠️ They are no longer all in one city, and the sentence that used to sit here
// said they were: "all inside Los Angeles city limits and on the same
// sales-tax rate, so nothing downstream of an address changes except the
// address." Westwood, Studio City and Larchmont are LA neighbourhoods and that
// held for them. Pasadena is its own city with its own transactions tax, so an
// address now changes one thing besides itself — see `taxRate` on the type.
//
// ——— ⚠️ The shop closed 2528 S Figueroa St, by USC ———
//
// Its record is gone from this file, which is the whole of removing a counter:
// nothing else in the app names a location, so pickup, delivery routing, the
// kitchen queue, the map and the catering finder all stop offering it by not
// finding it in this array.
//
// Two things do NOT follow automatically and are somebody's job outside the
// code. SQUARE_LOCATION_FIGUEROA is now read by nothing, so it should come off
// the deploy rather than sit there looking meaningful; and Square's own
// location for that store should be deactivated in the dashboard, since a
// location that still exists there will keep appearing in Square's reporting
// as a counter with no sales.
//
// ⚠️ Orders placed at the USC store before it closed still carry
// `orderAt: "figueroa"`. Nothing here resolves that any more, so those rows
// render without a counter name. That is the right failure — a closed shop
// should not be shown as somewhere to collect from — but it is worth knowing
// before somebody reads an old order and thinks the data is corrupt.
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
// None has a `door` yet. They all need one, and the Wilshire suite needs it
// most: see the note on the field above, and the note on that record.
//
// ⚠️ For the addresses added since launch the typed pair is doing more work
// than usual and
// deserves checking before launch, because the drift guard runs the wrong way
// round for a brand new record. It compares Google's answer against what is
// typed here and keeps what is typed when they disagree by more than half a
// mile — which is right when the typed pair is known-good and the geocode is
// suspect, and exactly backwards when the typed pair is somebody's estimate off
// a street grid. An estimate that is a mile out does not get corrected; it wins
// silently, and every quote and courier pickup for that shop is a mile wrong.
//
// So: run `npm run check:maps` with a real key, confirm each resolves onto the
// right block, and set `door` from a pin dropped on the actual counter. Until
// that happens the two new pairs below are the shop's position for every
// purpose the app has.

// The store, and the kitchen every delivery leaves from.
export const WILSHIRE: StoreLocation = {
  id: "wilshire",
  // ——— ⚠️ The neighbourhood, not the street ———
  //
  // All four counters are named for where they are rather than what they are
  // on, because that is how somebody says where they are going. The id stays
  // `wilshire`: it is written into every past order, every Square variable name
  // and the kitchen queue, and renaming it would orphan all of them to change a
  // label. The id is the shop's internal handle and the name is what a person
  // reads, and this is the edit that separates them.
  name: "Koreatown",
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

// ——— ⚠️ PAUSED. Not in LOCATIONS, and not deleted either ———
//
// The shop took the Koreatown Outlet off the list "for now", which is a
// different instruction from the one that closed the USC store. That record was
// deleted; this one is kept whole and left out of the array below, so putting
// it back is adding one word to LOCATIONS rather than reconstructing an
// address, a ZIP, an opening hour, a shortened menu and eighteen aliases from
// memory.
//
// ⚠️ It is the only outlet, so while it is out, three things in this app are
// live code with no live data behind them: the outlet preference in
// kitchensFor, OUTLET_DETOUR_MILES, and outletChipFor. None of them is dead —
// they are one array entry from running again — so none of them was removed,
// and the suites that cover them now build a synthetic outlet rather than
// leaning on this record. See tests/deliveryRouting.test.ts.
//
// ⚠️ It is also the only record with a `menu` restriction, so with it out
// every counter makes everything and notServedAt() returns empty for every
// basket. A sandwich cannot currently be refused at a counter. That is correct
// for the shops that are open and it means the shortened-menu path is untested
// against real data until this comes back.
//
// ⚠️ Orders already placed here carry `orderAt: "western"`, which nothing
// resolves while it is out of the array — those rows render without a counter
// name, the same as the USC ones. Putting the record back fixes them.
//
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
  // Two counters in the same neighbourhood, so this one says which it is. See
  // the note on the Koreatown record above for why the id did not move.
  //
  // ⚠️ The word "Outlet" is in the name now, so the chip that also said it is
  // suppressed here — see outletChipFor() below. Without that the row reads
  // "Koreatown Outlet · Outlet".
  name: "Koreatown Outlet",
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

// Larchmont Village. A full store.
//
// ——— ⚠️ The closest two counters have ever been to each other, bar one ———
//
// Just under a mile from the Koreatown Outlet, and about a mile and a half from
// the Koreatown store. That is inside OUTLET_DETOUR_MILES, so a bagel delivery
// around here will leave from the outlet rather than from this counter — which
// is the outlet preference working as written, not a bug: the point of it is to
// keep a full store's line free for the orders only a full store can take, and
// a mile of Beverly Blvd is exactly the detour that rule was priced for.
//
// Anything this counter alone can make — a sandwich — still leaves from here.
// See kitchensFor in storePlaces.ts.
export const LARCHMONT: StoreLocation = {
  id: "larchmont",
  name: "Larchmont",
  kind: "shop",
  // Blvd. This record said Ave until the shop confirmed it, which was the one
  // thing flagged on it when it went in: `addressParts` puts this string
  // straight onto a courier's docket, and a courier reading the wrong street
  // type is a courier on a different street.
  address: "142 N Larchmont Blvd",
  city: "Los Angeles, CA 90004",
  hours: SHOP_HOURS,
  // ⚠️ Assumed, not given: the usual hours, opening at 7. `opensAt` is unset,
  // which is how a counter says "the usual".
  //
  // ⚠️ Estimated, not surveyed. The 100 block of N Larchmont is the first one
  // north of 1st St, a couple of blocks south of Beverly Blvd. Read the
  // drift-guard warning above these records before trusting it.
  position: [34.0728, -118.3244],
  catering: true,
  aliases: [
    "larchmont",
    "larchmont village",
    "larchmont blvd",
    "larchmont boulevard",
    // ⚠️ Kept although the street is a Blvd. This is what the record said for
    // a while, so it is what somebody may have written down or shared a link
    // with — an alias costs nothing and a search that finds nothing costs a
    // customer. Same reason "112 euclid" is on Fullerton without a street type
    // at all: aliases are for how people type, not for what is on the sign.
    "larchmont ave",
    "larchmont avenue",
    "142 larchmont",
    "hancock park",
    "windsor square",
    "la",
    "los angeles",
    "90004",
  ],
};

// Old Pasadena. A full store.
//
// ——— ⚠️ The first counter outside the City of Los Angeles ———
//
// Every other one is an LA neighbourhood — Koreatown, Larchmont, Westwood,
// Studio City are all inside the city, on one sales-tax rate, so the sentence
// at the top of this file could say that an address changes nothing but the
// address. Pasadena is its own city with its own transactions tax, and that
// sentence is no longer true.
//
// What it changes is `taxRate` below and nothing else. The courier's docket
// already carries whatever `city` says, delivery routing already asks which
// counter per order, and the ten-mile reach around this one is measured the
// same way as the rest — it simply reaches east into the San Gabriel Valley,
// which nothing here had covered before.
export const PASADENA: StoreLocation = {
  id: "pasadena",
  name: "Pasadena",
  kind: "shop",
  address: "14 S Fair Oaks Ave",
  // ⚠️ Pasadena, not Los Angeles, and this one is not a formatting preference
  // the way Studio City's is. Studio City is inside LA; this is a different
  // city, and the string is what addressParts puts on a courier's docket.
  city: "Pasadena, CA 91105",
  hours: SHOP_HOURS,
  // ⚠️ 10.5%: Los Angeles County's 9.75% plus Pasadena's own 0.75%
  // transactions tax.
  //
  // ⚠️ VERIFY THIS AGAINST CDTFA BEFORE THE STORE TAKES AN ORDER. It is the
  // one number in this record that costs money to get wrong, it is derived
  // rather than quoted, and district rates change on their own schedule. The
  // mechanism is what this commit is for; the figure is one edit.
  taxRate: 0.105,
  // ⚠️ Assumed, not given: the usual hours, opening at 7.
  //
  // ⚠️ Estimated, not surveyed. Fair Oaks Ave at Colorado Blvd is the origin
  // for the N/S numbering, so 14 S Fair Oaks is the first address south of it.
  // Read the drift-guard warning above these records.
  position: [34.145, -118.1503],
  catering: true,
  aliases: [
    "pasadena",
    "old pasadena",
    "old town",
    "old town pasadena",
    "fair oaks",
    "s fair oaks",
    "south fair oaks",
    "fair oaks ave",
    "14 fair oaks",
    "colorado blvd",
    "sgv",
    "san gabriel valley",
    "91105",
  ],
};

// Downtown Fullerton. A full store.
//
// ——— ⚠️ The first counter outside Los Angeles County ———
//
// Pasadena was the first outside the City of LA; this is the first outside the
// county, and the two are different kinds of first. Pasadena added a city tax
// on top of the county rate. Orange County has a lower base rate than LA's
// altogether — 7.75% against 9.75% — so this is the first counter that charges
// *less* than the shop's usual, and the first proof that `taxRate` had to be a
// number rather than a flag for "somewhere that costs extra".
//
// ⚠️ It is also about twenty-three miles from the nearest other counter, which
// is more than twice the delivery radius. Its ten-mile reach touches nothing
// else's, so the area the shop serves is now two separate patches with a gap
// between them. See the note on LOCATIONS below — the published map has an
// assumption that this is the first record to break.
export const FULLERTON: StoreLocation = {
  id: "fullerton",
  name: "Fullerton",
  kind: "shop",
  address: "112 N Euclid St",
  // ⚠️ 92832 is a completion, not a quote. The address came through as "CA
  // 9283", which is four digits — no such ZIP. 112 N Euclid is downtown
  // Fullerton, west of Harbor, which is 92832; the neighbours are 92831 east,
  // 92833 west and 92835 north, and picking wrong puts the wrong ZIP on every
  // courier docket. Confirm against the lease.
  city: "Fullerton, CA 92832",
  hours: SHOP_HOURS,
  // ⚠️ Orange County's 7.75%: the state's 7.25% plus the county's 0.5%
  // transportation tax, with no city district tax in Fullerton. Lower than
  // every other counter.
  //
  // ⚠️ VERIFY AGAINST CDTFA BEFORE THIS STORE TAKES AN ORDER, for the reason
  // the Pasadena record gives — but note this one errs the other way. Charging
  // 9.75% here would be over-collecting from customers rather than
  // under-remitting to the state, which is the worse of the two mistakes to
  // make and the harder one to put right afterwards.
  taxRate: 0.0775,
  // ⚠️ Assumed, not given: the usual hours, opening at 7.
  //
  // ⚠️ Estimated, not surveyed. Euclid St is about six tenths of a mile west of
  // Harbor Blvd, and the 100 block north starts at Chapman Ave. Read the
  // drift-guard warning above these records.
  position: [33.8712, -117.9345],
  catering: true,
  aliases: [
    "fullerton",
    "downtown fullerton",
    "euclid",
    "euclid st",
    "n euclid",
    "north euclid",
    "112 euclid",
    "chapman",
    "orange county",
    "oc",
    "north oc",
    "92832",
  ],
};

// Long Beach, on the Belmont Shore strip.
//
// ——— ⚠️ It joins Fullerton rather than Los Angeles ———
//
// Every counter before Fullerton was one blob on the delivery map. Fullerton
// was the first that stood on its own, twenty-two miles from the nearest of
// the others and so more than two radii away — a second patch, with real
// ground between them that nobody serves.
//
// This one lands between the two, and closer to Fullerton: about fourteen
// miles from it and twenty-three from Koreatown. Fourteen is inside two radii,
// so the reaches overlap and the two become one patch covering Long Beach
// through to Fullerton; twenty-three is outside, so the gap to Los Angeles
// stays. The map draws two lobes, and the southern one is now much the bigger
// of them. See patches() in app/deliveryArea.ts for why that grouping is a
// measurement rather than a drawing choice.
export const LONGBEACH: StoreLocation = {
  id: "longbeach",
  name: "Long Beach",
  kind: "shop",
  address: "4923 E 2nd St",
  city: "Long Beach, CA 90803",
  hours: SHOP_HOURS,
  // ⚠️ 10.5%. Long Beach levies its own district tax on top of the county's,
  // the way Pasadena does, and lands on the same figure by a different route.
  //
  // ⚠️ VERIFY AGAINST CDTFA BEFORE THIS STORE TAKES AN ORDER, like the other
  // two. This one is quoted rather than derived — several rate services agree
  // on 10.5% for the city — but a published aggregate is not the state's own
  // table, district rates change quarterly, and Long Beach is one of the
  // cities where a couple of addresses sit inside an extra district. Check the
  // rate for *this address*, not for the city.
  taxRate: 0.105,
  // ⚠️ Assumed, not given: the usual hours, opening at 7.
  //
  // ⚠️ Estimated, not surveyed, and interpolated rather than looked up. Second
  // Street's shops run from Livingston Drive at the west end to Bay Shore Ave
  // at the east, a strip a little over a mile long; the USGS point for Belmont
  // Shore sits at the Livingston end, and 4923 is a bit past halfway along.
  // Two ways of reading the block numbering put it a quarter of a mile apart,
  // and this is between them.
  //
  // That is well inside the half-mile drift guard, which is what this pair is
  // for: storePlaces.ts geocodes the address and uses the real rooftop, with
  // this only as the bias and the sanity check. Read the drift-guard warning
  // above these records.
  position: [33.759, -118.1293],
  catering: true,
  aliases: [
    "long beach",
    "longbeach",
    "lbc",
    "belmont shore",
    "belmont",
    "2nd st",
    "2nd street",
    "second street",
    "e 2nd st",
    "east 2nd street",
    "4923 2nd",
    "naples",
    "alamitos bay",
    "south bay",
    "90803",
  ],
};

// Torrance, in the retail strip on 190th at the Harbor Gateway line.
export const TORRANCE: StoreLocation = {
  id: "torrance",
  name: "Torrance",
  kind: "shop",
  address: "980 W 190th St",
  city: "Torrance, CA 90502",
  hours: SHOP_HOURS,
  // ⚠️ 10.25%: Torrance levies half a point of its own on top of the county's.
  //
  // ⚠️ VERIFY AGAINST CDTFA BEFORE THIS STORE TAKES AN ORDER, and verify this
  // one harder than the others. A 90502 mailing address does not settle which
  // city you are standing in: this stretch of 190th is on the Harbor Gateway
  // line, and Harbor Gateway is a strip of the City of Los Angeles that reaches
  // down between Torrance and Carson with Torrance ZIPs on both sides of it.
  // Los Angeles and Torrance are different rates. Rate services answer by city
  // name and by ZIP, and both of those are the wrong question here — ask CDTFA
  // for *this address*, which is the only lookup that knows where the line
  // runs.
  taxRate: 0.1025,
  // ⚠️ Assumed, not given: the usual hours, opening at 7.
  //
  // The one position in this file that is not an estimate: 33.857306,
  // -118.293999 is what a mapping service returns for a unit at this street
  // number, so it is a rooftop rather than a reading of the block numbering.
  // storePlaces.ts still geocodes the address and still checks the drift; this
  // simply starts it much closer than the others do.
  position: [33.8573, -118.294],
  catering: true,
  aliases: [
    "torrance",
    "190th",
    "190th st",
    "w 190th",
    "west 190th",
    "980 190th",
    "harbor gateway",
    "carson",
    "gardena",
    "south bay",
    "the enclave",
    "90502",
  ],
};

// San Clemente, off the Camino de Estrella interchange.
//
// ——— ⚠️ The third patch ———
//
// Fullerton and Long Beach make one lobe in the south; the five Los Angeles
// counters make another. This one is thirty-odd miles further down the coast
// from either, which is more than two radii from everything, so it is a lobe of
// its own with nobody near it. That is the shape the coverage map will draw and
// it is the honest one: the ground between Irvine and here is not served.
export const SANCLEMENTE: StoreLocation = {
  id: "sanclemente",
  name: "San Clemente",
  kind: "shop",
  address: "641 Camino de los Mares",
  city: "San Clemente, CA 92673",
  hours: SHOP_HOURS,
  // ⚠️ 7.75%: Orange County's rate, the same as Fullerton's. San Clemente adds
  // no city district tax of its own.
  //
  // ⚠️ VERIFY AGAINST CDTFA BEFORE THIS STORE TAKES AN ORDER. It errs the same
  // way Fullerton's does — too high here is over-collecting from customers,
  // which is the worse of the two mistakes and the harder to put right.
  taxRate: 0.0775,
  // ⚠️ Assumed, not given: the usual hours, opening at 7.
  //
  // ⚠️ Estimated, not surveyed. Read off a neighbouring address on the same
  // street a couple of hundred numbers along; the plaza itself sits at Camino
  // de los Mares and Calle Agua, an eighth of a mile from the Camino de
  // Estrella exit off the 5. Inside the drift guard by a wide margin, and
  // storePlaces.ts replaces it with the rooftop. Read the drift-guard warning
  // above these records.
  position: [33.4626, -117.6414],
  catering: true,
  aliases: [
    "san clemente",
    "sanclemente",
    "camino de los mares",
    "los mares",
    "641 camino de los mares",
    "camino de estrella",
    "talega",
    "capistrano beach",
    "dana point",
    "south orange county",
    "south oc",
    "92673",
  ],
};

// Westwood. A full store: it makes the whole menu, so it says nothing about
// `menu` at all. That silence is the point of the field — the common case stays
// quiet and a restriction is the thing somebody has to write down, which is
// what makes a shortened counter impossible to add by accident.
//
// ⚠️ Eight miles west of Koreatown, which is further than any two counters have
// ever been apart in this app. Nothing downstream has to be told: every routing
// decision already asks "which counter" per order rather than assuming. What
// does change is how much it matters when something guesses — see the note on
// OUTLET_DETOUR_MILES in storePlaces.ts, and the note on deliveryArea's centre.
export const GLENDON: StoreLocation = {
  id: "glendon",
  // The neighbourhood, like the rest. The street is in the aliases below, so
  // "glendon" still finds it — and if a second Westwood counter ever opens,
  // this is the record that has to say which one it is, the way the two
  // Koreatown counters already do.
  name: "Westwood",
  kind: "shop",
  address: "1129 Glendon Ave",
  city: "Los Angeles, CA 90024",
  hours: SHOP_HOURS,
  // ⚠️ Assumed, not given: the usual hours, opening at 7 with Wilshire.
  // `opensAt` is unset, which is how a counter says "the usual". If this one
  // keeps different hours that is one number here and the line people read
  // follows it — see the Western record.
  //
  // ⚠️ Estimated, not surveyed. Glendon Ave just north of Wilshire, in Westwood
  // Village: the 1100 block is the first one up from Wilshire, and Glendon runs
  // between Westwood Blvd and Tiverton Ave. Read the drift-guard warning above
  // this block before trusting it.
  position: [34.06, -118.4432],
  catering: true,
  aliases: [
    "glendon",
    "glendon ave",
    "glendon avenue",
    "1129 glendon",
    "westwood",
    "westwood village",
    "ucla",
    "u.c.l.a.",
    "bruins",
    "west la",
    "west los angeles",
    "westside",
    "la",
    "los angeles",
    "90024",
  ],
};

// Studio City, over the hill. The first counter outside the LA basin, and the
// one that makes the delivery area a shape rather than a blob: the Santa Monica
// Mountains sit between it and the other three, so the ten-mile road reach
// around it overlaps theirs hardly at all.
//
// A full store, same as Glendon and Wilshire.
export const VENTURA: StoreLocation = {
  id: "ventura",
  name: "Studio City",
  kind: "shop",
  address: "11128 Ventura Blvd",
  // ⚠️ "Studio City" and not "Los Angeles". It is inside Los Angeles city
  // limits and the tax rate is the same, but it is what the post office wants,
  // what a courier's address form expects, and what somebody standing there
  // would write. addressParts() splits this for Uber, so the city on the
  // courier's docket is this string.
  city: "Studio City, CA 91604",
  hours: SHOP_HOURS,
  // ⚠️ Estimated, not surveyed. Ventura Blvd numbers climb westward — Vineland
  // Ave is around 11200 and Laurel Canyon around 12000 — so 11128 sits just
  // east of Vineland. Read the drift-guard warning above this block.
  position: [34.1414, -118.3686],
  catering: true,
  aliases: [
    "ventura",
    "ventura blvd",
    "ventura boulevard",
    "11128 ventura",
    "studio city",
    "vineland",
    "valley",
    "the valley",
    "san fernando valley",
    "sfv",
    "noho",
    "north hollywood",
    "universal city",
    "la",
    "los angeles",
    "91604",
  ],
};

// Four counters open, and everything around them is written for several.
//
// That generality was here before the second address arrived, on the shop's
// stated plan to hold a ten-mile radius until it opened more counters, and it
// is what keeps this a small change: adding a shop is adding a record to this
// array and closing one is deleting it. Nothing names one location as "the
// shop" — see nearestDelivering above and deliveryOrigin in storePlaces.ts,
// both of which take the list as it is.
//
// Order matters slightly and only as a fallback: deliveringStores()[0] is
// where a delivery leaves from when nothing better is known. The full stores
// come first and an outlet goes last, which is where WESTERN belongs when it
// comes back.
//
// ——— ⚠️ What spreading out actually did to the coverage ———
//
// Three counters used to sit inside a four-mile box, so their ten-mile reaches
// were nearly the same circle and the union was barely bigger than any one of
// them. These span roughly Studio City to Westwood to Koreatown, and the union
// of four ten-mile road reaches around points that far apart is a much
// larger and much less circular area — the Valley comes in over the hill from
// Ventura Blvd, the Westside from Glendon, and the reach east of downtown still
// comes from Koreatown.
//
// The rule did not change and no number here moved: DELIVERY_RADIUS_MILES is
// still ten, and it was always ten from *a* counter rather than from one of
// them. What changed is how many counters there are to be ten miles from. The
// published map redraws itself from this array on its next rebuild, so nothing
// has to be edited to make the new area appear — see app/deliveryArea.ts, which
// measures out from the centroid of whatever is in this list.
//
// ——— ⚠️ The coverage is no longer one shape, and Fullerton is why ———
//
// This note used to argue that the union stayed connected: every counter was
// within about five miles of the centroid and each reached ten, so a ray out
// from the middle crossed the boundary once. It said that was an argument
// rather than a measurement. It was, and it stopped being true.
//
// Fullerton is twenty-three miles from the nearest other counter — more than
// twice the radius — so its reach touches nothing else's and what the shop
// serves is two separate patches. Drawn as one ring that over-claimed by up to
// a mile and a half through the gap around Pico Rivera, which is a published
// map promising addresses the checkout refuses.
//
// deliveryArea.ts groups the counters into patches now and draws one ring each,
// and tests/deliveryArea.test.ts sweeps a grid over the result asserting that
// nothing drawn is out of range. That sweep is what to look at when a counter
// opens somewhere new — it is the only assertion here that can see a hole,
// because every other one checks the boundary and a gap lives between two
// perfectly correct vertices.
// ⚠️ WESTERN is deliberately absent — paused, not closed. See the note above
// its record. Adding it back to the end of this array is the whole of
// reopening it.
export const LOCATIONS: StoreLocation[] = [
  WILSHIRE,
  LARCHMONT,
  GLENDON,
  VENTURA,
  PASADENA,
  FULLERTON,
  LONGBEACH,
  TORRANCE,
  SANCLEMENTE,
];

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

/** Whether to draw the "Outlet" chip beside this shop's name.
 *
 *  ——— ⚠️ Why this is a function and not `store.outlet` ———
 *
 *  The chip and the name started saying the same word. Counters are named for
 *  their neighbourhood now, and the Koreatown pair needs the second one
 *  distinguished, so its name is "Koreatown Outlet" — beside a chip reading
 *  "Outlet" that is the row telling you twice, which is the same thing a
 *  redundant arrow beside a link that says where it goes does.
 *
 *  ⚠️ Compared against the chip's *translated* text rather than the English
 *  word, and that is the whole reason this takes an argument. A name is a place
 *  and does not translate: the Spanish finder shows "Koreatown Outlet" with a
 *  chip reading "Punto de venta", and those are two different words doing two
 *  different jobs, so the chip stays. Matching on "outlet" would have hidden it
 *  in all ten languages to fix a repetition that only happens in one.
 *
 *  Takes the label rather than a locale so it cannot go stale against the
 *  string table: the caller passes exactly what it is about to render. */
export function outletChipFor(store: StoreLocation, label: string): boolean {
  if (store.outlet !== true) return false;
  return !store.name.toLowerCase().includes(label.trim().toLowerCase());
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

// Somewhere in the city to start from, when nothing better is known.
//
// ——— ⚠️ This used to be `DELIVERY_ORIGIN = WILSHIRE`, and the name was a lie ———
//
// It was named for a job it stopped doing a long time ago. Deliveries have not
// left from one door since the second kitchen opened; the radius is measured
// per counter in storePlaces.ts, and every caller of this const was using it
// for something else entirely: the fallback centre for an address autocomplete
// when the browser has not offered a position, and the point a delivery pin
// map opens on before there is an address. Neither is a delivery origin. A
// constant whose name describes a decision it no longer takes part in is a
// constant somebody will one day route an order with.
//
// ——— Why the middle rather than a shop ———
//
// Three counters inside a four-mile box made "the first one" a fine stand-in
// for "around here". Four counters spanning Studio City to Westwood to
// Koreatown do not: biasing an address search to Koreatown ranks Koreatown
// streets first for somebody standing on Ventura Blvd, and opens their pin map
// over the hill from where they live.
//
// The mean of the typed positions, which is not a place and is not meant to
// be. It is only ever a fallback — the browser's own position wins whenever
// there is one (see searchBias in app/geolocate.ts) — and it moves by itself
// when a counter is added or closed, which is the property the old constant
// lacked.
//
// Typed positions rather than geocoded ones, deliberately: this is imported by
// client components, and storePlaces.ts is server-only. Block-level accuracy is
// far more than a search bias needs.
export const SHOPS_CENTRE: [number, number] = [
  LOCATIONS.reduce((sum, store) => sum + store.position[0], 0) / LOCATIONS.length,
  LOCATIONS.reduce((sum, store) => sum + store.position[1], 0) / LOCATIONS.length,
];

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
