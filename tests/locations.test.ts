// The counters, as everything downstream of the records sees them.
//
// ——— What this suite is for ———
//
// Opening or closing a shop is supposed to be one edit: a record added to or
// deleted from LOCATIONS, and every other screen follows because nothing else
// in the app names a location. This checks that claim from the outside — menu,
// hours, pickup, delivery, catering, courier docket, search and nearest — for
// the two counters that just opened, and checks the other half for the one that
// closed: that it is gone from all of them rather than lingering in one.

import {
  LOCATIONS,
  WESTERN,
  addressParts,
  deliveringStores,
  nearestDelivering,
  nearestLocations,
  opensAt,
  pickupStores,
  searchLocations,
  type StoreLocation,
} from "../app/(marketing)/locations/locations";
import { notServedAt, servesCategory, storeById } from "../app/shop/storeMenu";
import { hoursLine } from "../app/shopFacts";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

// ——— ⚠️ The USC store is closed ———
//
// Checked first, and checked through every list rather than only through
// LOCATIONS. A record deleted from the array but still reachable through one
// helper is the failure worth catching: it would be a counter that cannot be
// found on the map and can still be ordered from.
console.log("\n— 2528 S Figueroa St, closed —");
ok("not in the list", LOCATIONS.every((l) => l.id !== "figueroa"));
ok("not collectable from", !pickupStores().some((s) => s.id === "figueroa"));
ok("no delivery leaves from it", !deliveringStores().some((s) => s.id === "figueroa"));
ok("storeById does not resolve it", storeById("figueroa") === undefined || storeById("figueroa") === null);
for (const query of ["usc", "figueroa", "trojans", "90007"]) {
  const hits = searchLocations(query, "shop");
  ok(`"${query}" no longer finds it`, hits.every((h) => h.id !== "figueroa"),
     hits.map((h) => h.id).join(",") || "(none)");
}
// ⚠️ And searching near where it stood returns the surviving counters rather
// than nothing. An empty answer there would be the finder saying "no shops in
// Los Angeles" to somebody a few miles from three of them.
//
// ⚠️ Counted off the list rather than typed. It was `=== 6`, which is a fact
// about how many shops the business had on the afternoon it was written, and
// it failed the next time one opened — for the one reason it was never meant
// to catch. What is being asserted is that the finder returns the survivors
// and not an empty answer, so it reads the survivors.
const nearUSC: [number, number] = [34.0224, -118.2851];
const openShops = LOCATIONS.filter((l) => l.kind === "shop").length;
ok("somewhere near USC still finds every counter",
   nearestLocations(nearUSC, "shop").length === openShops,
   `${nearestLocations(nearUSC, "shop").length} of ${openShops}`);

// ——— The ones that opened ———
//
// Every counter added since launch gets the same battery, rather than only the
// newest. A record is one edit and the whole point is that the edit is enough,
// so each one is checked through the same nine questions the last was.
const glendon = LOCATIONS.find((l) => l.id === "glendon")!;
const ventura = LOCATIONS.find((l) => l.id === "ventura")!;
const larchmont = LOCATIONS.find((l) => l.id === "larchmont")!;

const opened: { store: StoreLocation; street: string; city: string; zip: string; town: string }[] = [
  { store: glendon, street: "1129 Glendon Ave", city: "Los Angeles, CA 90024", zip: "90024", town: "Los Angeles" },
  { store: larchmont, street: "142 N Larchmont Blvd", city: "Los Angeles, CA 90004", zip: "90004", town: "Los Angeles" },
  // ⚠️ Pasadena, and the town on the docket is Pasadena — not a formatting
  // choice like Studio City's, but a different city entirely. See its taxRate.
  { store: LOCATIONS.find((l) => l.id === "pasadena")!, street: "14 S Fair Oaks Ave",
    city: "Pasadena, CA 91105", zip: "91105", town: "Pasadena" },
  // ⚠️ Orange County, not Los Angeles County — the first counter outside it.
  { store: LOCATIONS.find((l) => l.id === "fullerton")!, street: "112 N Euclid St",
    city: "Fullerton, CA 92832", zip: "92832", town: "Fullerton" },
  // ⚠️ Studio City, not Los Angeles. Inside LA city limits and on the same tax
  // rate, but it is what a courier's address form expects — and addressParts
  // puts this string on the docket.
  { store: ventura, street: "11128 Ventura Blvd", city: "Studio City, CA 91604", zip: "91604", town: "Studio City" },
];

for (const { store, street, city, zip, town } of opened) {
  console.log(`\n— ${store.name} —`);
  ok("it is in the list", store !== undefined);
  ok("street", store.address === street, store.address);
  ok("city and ZIP", store.city === city, store.city);

  // Full menu means saying nothing about the menu.
  ok("no menu restriction on the record", store.menu === undefined, JSON.stringify(store.menu));
  for (const category of ["Bagels", "Spreads", "Sandwiches", "Drinks", "Gift Cards"]) {
    ok(`makes ${category}`, servesCategory(store.id, category));
  }
  ok("a sandwich basket is accepted here",
     notServedAt(store.id, ["the-veggie-stack"]).length === 0);

  // The usual hours, because none were given.
  ok("opens at the default hour", opensAt(store) === 7, String(opensAt(store)));
  ok("and its hours line matches", store.hours === hoursLine(7), store.hours);

  // It collects, delivers and caters.
  ok("collects", pickupStores().some((s) => s.id === store.id));
  ok("delivers", deliveringStores().some((s) => s.id === store.id));
  ok("caters", store.catering === true);
  ok("is not an outlet", store.outlet !== true);

  // What a courier docket is built from.
  const parts = addressParts(store);
  ok("address splits for the courier",
     parts.street === street && parts.city === town && parts.state === "CA" && parts.zip === zip,
     JSON.stringify(parts));
}

// ——— ⚠️ The Koreatown Outlet is paused, not closed ———
//
// A different state from the USC store above, and the assertions have to be
// able to tell them apart. USC is gone: no record, nothing to check but its
// absence. This one is absent from every list a customer can reach *and* still
// present as a record, because the shop asked for it back "for now" and putting
// it back is meant to be one word in an array.
console.log("\n— 355 S Western Ave, paused —");
ok("not in the open list", LOCATIONS.every((l) => l.id !== "western"));
ok("not collectable from", !pickupStores().some((s) => s.id === "western"));
ok("no delivery leaves from it", !deliveringStores().some((s) => s.id === "western"));
for (const query of ["western", "355 western", "outlet"]) {
  const hits = searchLocations(query, "shop");
  ok(`"${query}" does not find it`, hits.every((h) => h.id !== "western"),
     hits.map((h) => h.id).join(",") || "(none)");
}

// ⚠️ And the record survived the pause whole. Every one of these is something
// somebody would otherwise have to reconstruct from memory to reopen it.
ok("the record is still exported", WESTERN.id === "western");
ok("with its address", WESTERN.address === "355 S Western Ave #101", WESTERN.address);
ok("its ZIP", WESTERN.city === "Los Angeles, CA 90020", WESTERN.city);
ok("its 11am opening", opensAt(WESTERN) === 11, String(opensAt(WESTERN)));
ok("and its shortened menu",
   JSON.stringify(WESTERN.menu) === JSON.stringify(["Bagels", "Spreads", "Drinks"]),
   JSON.stringify(WESTERN.menu));

// ⚠️ While it is out, no counter refuses anything. The outlet was the only
// record with a `menu`, so notServedAt is empty for every basket at every shop.
// Correct for the counters that are open, and it means the shortened-menu path
// has no live data behind it until this comes back.
ok("every open counter makes sandwiches",
   LOCATIONS.every((l) => servesCategory(l.id, "Sandwiches")),
   LOCATIONS.filter((l) => !servesCategory(l.id, "Sandwiches")).map((l) => l.id).join(","));
ok("so a sandwich is refused nowhere",
   LOCATIONS.every((l) => notServedAt(l.id, ["the-veggie-stack"]).length === 0));

// ——— Found by the words somebody would actually type ———
console.log("\n— search —");
for (const [query, id] of [
  ["glendon", "glendon"], ["westwood", "glendon"], ["ucla", "glendon"],
  ["1129 glendon", "glendon"], ["90024", "glendon"], ["bruins", "glendon"],
  ["ventura", "ventura"], ["studio city", "ventura"], ["91604", "ventura"],
  ["11128 ventura", "ventura"], ["the valley", "ventura"], ["noho", "ventura"],
] as const) {
  const hits = searchLocations(query, "shop");
  ok(`"${query}" finds ${id} first`, hits[0]?.id === id,
     hits.map((h) => h.id).join(",") || "(none)");
}
// And they do not swallow the others.
ok('"wilshire" still finds Wilshire', searchLocations("wilshire", "shop")[0]?.id === "wilshire");
ok('"ktown" finds the Koreatown counter',
   searchLocations("ktown", "shop")[0]?.id === "wilshire");
ok('"los angeles" finds the LA counters', searchLocations("los angeles", "shop").length === 4,
   String(searchLocations("los angeles", "shop").length));
ok("Westwood is offered for catering too",
   searchLocations("westwood", "catering")[0]?.id === "glendon");
ok("so is Studio City", searchLocations("studio city", "catering")[0]?.id === "ventura");
ok("and Larchmont", searchLocations("larchmont", "catering")[0]?.id === "larchmont");

// ⚠️ Larchmont is under a mile from the Koreatown Outlet, closer than any two
// counters except the Koreatown pair itself. Nearest has to be the new one from
// its own block, or a pickup there sends somebody to the wrong door.
const onLarchmont: [number, number] = [34.0728, -118.3244];
ok("nearest to Larchmont is Larchmont",
   nearestDelivering(onLarchmont)?.id === "larchmont",
   nearestDelivering(onLarchmont)?.id);

// ——— Nearest, from places each should win ———
//
// ⚠️ The point of these three: the counters are now spread far enough that
// "which is nearest" has a different answer in three parts of the city, and
// everything asking uses the list rather than a named store.
console.log("\n— nearest —");
const nearWestwood: [number, number] = [34.0635, -118.4455]; // UCLA campus edge
const nearStudioCity: [number, number] = [34.1478, -118.3965]; // Ventura & Laurel Canyon
const nearKtown: [number, number] = [34.0616, -118.3005];

ok("nearest to Westwood is Glendon", nearestDelivering(nearWestwood)?.id === "glendon",
   nearestDelivering(nearWestwood)?.id);
ok("nearest to Studio City is Ventura", nearestDelivering(nearStudioCity)?.id === "ventura",
   nearestDelivering(nearStudioCity)?.id);
ok("nearest to Koreatown is still Wilshire", nearestDelivering(nearKtown)?.id === "wilshire",
   nearestDelivering(nearKtown)?.id);

for (const [where, point, first] of [
  ["Westwood", nearWestwood, "glendon"],
  ["Studio City", nearStudioCity, "ventura"],
] as const) {
  const ranked = nearestLocations(point, "shop");
  ok(`and ${first} ranks first in the finder from ${where}`, ranked[0].location.id === first,
     ranked.map((r) => `${r.location.id}:${r.miles.toFixed(1)}`).join(" "));
  console.log(`  from ${where}:`, ranked.map((r) => `${r.location.id} ${r.miles.toFixed(1)}mi`).join(", "));
}

ok("storeById resolves Glendon", storeById("glendon")?.id === "glendon");
ok("storeById resolves Ventura", storeById("ventura")?.id === "ventura");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
