// The new counter, as everything downstream of the record sees it.
import {
  LOCATIONS,
  addressParts,
  deliveringStores,
  nearestDelivering,
  nearestLocations,
  opensAt,
  pickupStores,
  searchLocations,
} from "../app/(marketing)/locations/locations";
import { notServedAt, servesCategory, storeById } from "../app/shop/storeMenu";
import { hoursLine } from "../app/shopFacts";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

const usc = LOCATIONS.find((l) => l.id === "figueroa")!;

ok("it is in the list", usc !== undefined);
ok("named as the shop named it", usc.name === "USC Neighborhood", usc.name);
ok("street", usc.address === "2528 S Figueroa St", usc.address);
ok("city and ZIP", usc.city === "Los Angeles, CA 90007", usc.city);

// ——— Full menu means saying nothing about the menu ———
ok("no menu restriction on the record", usc.menu === undefined, JSON.stringify(usc.menu));
for (const category of ["Bagels", "Spreads", "Sandwiches", "Drinks", "Gift Cards"]) {
  ok(`makes ${category}`, servesCategory("figueroa", category));
}
// The comparison that matters: the outlet does not.
ok("and the outlet still does not make sandwiches", !servesCategory("western", "Sandwiches"));
ok(
  "a sandwich basket is refused at the outlet and not here",
  notServedAt("western", ["the-veggie-stack"]).length === 1 &&
    notServedAt("figueroa", ["the-veggie-stack"]).length === 0,
);

// ——— The usual hours, because none were given ———
ok("opens at the default hour", opensAt(usc) === 7, String(opensAt(usc)));
ok("and its hours line matches", usc.hours === hoursLine(7), usc.hours);

// ——— It collects, delivers and caters ———
ok("collects", pickupStores().some((s) => s.id === "figueroa"));
ok("delivers", deliveringStores().some((s) => s.id === "figueroa"));
ok("caters", usc.catering === true);
ok("is not an outlet", usc.outlet !== true);

// ——— Address parts, which is what a courier docket is built from ———
const parts = addressParts(usc);
ok(
  "address splits for the courier",
  parts.street === "2528 S Figueroa St" && parts.city === "Los Angeles" &&
    parts.state === "CA" && parts.zip === "90007",
  JSON.stringify(parts),
);

// ——— Found by the words somebody would actually type ———
for (const query of [
  "usc", "figueroa", "fig", "90007", "university park", "expo park",
  "2528 figueroa", "trojans", "corner bagel usc",
]) {
  const hits = searchLocations(query, "shop");
  ok(`"${query}" finds it first`, hits[0]?.id === "figueroa",
     hits.map((h) => h.id).join(",") || "(none)");
}
// And does not swallow the others.
ok('"wilshire" still finds Wilshire', searchLocations("wilshire", "shop")[0]?.id === "wilshire");
ok('"western" still finds Western', searchLocations("western", "shop")[0]?.id === "western");
ok('"ktown" finds a Koreatown counter',
   ["wilshire", "western"].includes(searchLocations("ktown", "shop")[0]?.id ?? ""));
ok('"los angeles" finds all three', searchLocations("los angeles", "shop").length === 3);
ok("it is offered for catering too", searchLocations("usc", "catering")[0]?.id === "figueroa");

// ——— Nearest, from somewhere it should win ———
//
// The point is that adding a counter three miles south changes the answer for
// a good part of the city, and that everything asking uses the list rather
// than a named store.
const nearUSC: [number, number] = [34.0224, -118.2851]; // USC campus
const nearKtown: [number, number] = [34.0616, -118.3005];
ok("nearest to USC is the USC store", nearestDelivering(nearUSC)?.id === "figueroa",
   nearestDelivering(nearUSC)?.id);
ok("nearest to Koreatown is still Wilshire", nearestDelivering(nearKtown)?.id === "wilshire",
   nearestDelivering(nearKtown)?.id);
const ranked = nearestLocations(nearUSC, "shop");
ok("and it ranks first in the finder from there", ranked[0].location.id === "figueroa",
   ranked.map((r) => `${r.location.id}:${r.miles.toFixed(1)}`).join(" "));
console.log("  from USC:", ranked.map((r) => `${r.location.id} ${r.miles.toFixed(1)}mi`).join(", "));

ok("storeById resolves it", storeById("figueroa")?.id === "figueroa");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
