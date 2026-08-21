// What each counter is called, and the chip beside it.
//
// ——— Why the names deserve a suite ———
//
// They are the only field on a location that is pure presentation, which makes
// them the easy thing to edit and the easy thing to break something with. Two
// facts hang off them and neither is obvious from the record:
//
//   the search index scores the name first, so renaming a counter changes what
//   finds it — "wilshire" has to keep reaching the Koreatown store now that the
//   word is only in its aliases;
//
//   the "Outlet" chip and the name can say the same word, which is a row
//   telling you twice.
//
// ⚠️ And the ids deliberately did not move. `wilshire`, `western`, `glendon`
// and `ventura` are written into past orders, the kitchen queue and the
// SQUARE_LOCATION_* variable names. Renaming a label must not touch them, and
// the first assertions here are the ones that would catch somebody tidying the
// ids up to match.

import {
  LOCATIONS,
  outletChipFor,
  searchLocations,
} from "../app/(marketing)/locations/locations";
// Named exports, not defaults — see app/i18n/en.ts.
import { en } from "../app/i18n/en";
import { es } from "../app/i18n/es";
import { ja } from "../app/i18n/ja";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};
const byId = (id: string) => LOCATIONS.find((l) => l.id === id)!;

/** The chip's label in one locale.
 *
 *  ⚠️ Non-English tables are Partial, so a missing key is `undefined` rather
 *  than a compile error at the call site. Throwing here rather than coalescing
 *  to "" is deliberate: an empty label would make outletChipFor's substring
 *  test match everything, and this suite would pass while reporting that a
 *  translation nobody wrote agrees with the English. */
const chipLabel = (table: Partial<Record<string, string>>, tag: string): string => {
  const label = table["finder.outlet"];
  if (label === undefined) throw new Error(`${tag} has no finder.outlet`);
  return label;
};

// ——— The names on the cards ———
console.log("\n— names —");
for (const [id, name] of [
  ["wilshire", "Koreatown"],
  ["western", "Koreatown Outlet"],
  ["larchmont", "Larchmont"],
  ["glendon", "Westwood"],
  ["ventura", "Studio City"],
] as const) {
  ok(`${id} is called ${name}`, byId(id).name === name, byId(id).name);
}

// ⚠️ The ids are the handles, not the labels. If these ever follow the names,
// every past order and every Square variable stops resolving.
console.log("\n— and the ids that did not move —");
ok("the ids are still the street handles",
   LOCATIONS.map((l) => l.id).join(",") === "wilshire,larchmont,glendon,ventura,western",
   LOCATIONS.map((l) => l.id).join(","));

// ——— The street names still find their shops ———
//
// This is what renaming costs if the aliases are not carrying it. Each of these
// used to be a name match worth 100 and is now an alias match worth 45, which
// is still enough to win — but only because nothing else scores higher.
console.log("\n— the streets still reach them —");
for (const [query, id] of [
  ["wilshire", "wilshire"],
  ["3450 wilshire", "wilshire"],
  ["western", "western"],
  ["355 western", "western"],
  ["glendon", "glendon"],
  ["1129 glendon", "glendon"],
  ["ventura", "ventura"],
  ["11128 ventura", "ventura"],
  // ⚠️ Larchmont is the one counter whose name and street are the same word, so
  // it keeps its 100-point name match. Here to prove the pair still resolves to
  // one shop rather than splitting across name and alias.
  ["larchmont", "larchmont"],
  ["142 larchmont", "larchmont"],
] as const) {
  const hits = searchLocations(query, "shop");
  ok(`"${query}" still finds ${id} first`, hits[0]?.id === id,
     hits.map((h) => h.id).join(",") || "(none)");
}

// ——— And the neighbourhoods now match the name, not just an alias ———
console.log("\n— the neighbourhoods —");
for (const [query, id] of [
  ["koreatown", "wilshire"],
  ["westwood", "glendon"],
  ["studio city", "ventura"],
  ["larchmont village", "larchmont"],
  ["hancock park", "larchmont"],
  ["windsor square", "larchmont"],
] as const) {
  const hits = searchLocations(query, "shop");
  ok(`"${query}" finds ${id} first`, hits[0]?.id === id,
     hits.map((h) => h.id).join(",") || "(none)");
}
// ⚠️ Both Koreatown counters answer to it, and the full store comes first.
// They tie on score — each name starts with the word — so this is really an
// assertion about LOCATIONS order, which is why it says so out loud.
const ktown = searchLocations("koreatown", "shop").map((h) => h.id);
ok("both Koreatown counters answer to it",
   ktown.includes("wilshire") && ktown.includes("western"), ktown.join(","));
ok("and the full store is offered before the outlet",
   ktown.indexOf("wilshire") < ktown.indexOf("western"), ktown.join(","));

// ——— The chip ———
console.log("\n— the outlet chip —");
const western = byId("western");
const wilshire = byId("wilshire");

ok("suppressed in English, because the name already says it",
   outletChipFor(western, chipLabel(en, "en")) === false, chipLabel(en, "en"));
// ⚠️ Kept everywhere the words differ. A place name does not translate, so the
// Spanish finder shows "Koreatown Outlet" beside "Punto de venta" — two
// different words doing two different jobs, and hiding one would be fixing a
// repetition that does not happen in that language.
ok("kept in Spanish, where the chip is a different word",
   outletChipFor(western, chipLabel(es, "es")) === true, chipLabel(es, "es"));
ok("kept in Japanese too",
   outletChipFor(western, chipLabel(ja, "ja")) === true, chipLabel(ja, "ja"));

// A shop that is not an outlet never gets one, whatever the label says.
ok("never on a full store", outletChipFor(wilshire, chipLabel(en, "en")) === false);
ok("and not even on one whose name contains the word",
   outletChipFor({ ...wilshire, name: "Outlet Town" }, chipLabel(en, "en")) === false);

// Case and padding do not decide it.
ok("case does not matter", outletChipFor(western, "OUTLET") === false);
ok("nor does surrounding space", outletChipFor(western, "  outlet  ") === false);

// And an outlet named for its street alone still gets the chip, which is the
// case that existed before this rename and has to keep working.
ok("an outlet with no such word in its name keeps its chip",
   outletChipFor({ ...western, name: "Western Ave" }, chipLabel(en, "en")) === true);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
