// Which kitchen a delivery leaves from, now that the counters are spread across
// the city rather than clustered in one neighbourhood.
//
// ——— ⚠️ What changed under this suite ———
//
// It used to be written against three counters inside a four-mile box, two of
// them in Koreatown and one by USC. USC has closed and Westwood and Studio City
// have opened, so several assertions here do not just move — they invert. The
// clearest is Santa Monica: it used to be the example of an address the shop
// had to refuse, and with a counter in Westwood it is now four miles from a
// kitchen. That flip is the point of the change and it is asserted as one.
import { kitchensFor, earliestDeliveryHour } from "../app/storePlaces";
import {
  DELIVERY_RADIUS_MILES,
  LOCATIONS,
  WESTERN,
  milesBetween,
  nearestDelivering,
  type StoreLocation,
} from "../app/(marketing)/locations/locations";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

// Los Angeles is UTC-7 in August. 2026-08-19 is a Wednesday.
const la = (hour: number, minute = 0) => new Date(Date.UTC(2026, 7, 19, hour + 7, minute));
const ids = (pool: StoreLocation[]) => pool.map((s) => s.id).join(",");

const nearWestwood: [number, number] = [34.0635, -118.4455]; // UCLA campus edge
const nearStudioCity: [number, number] = [34.1478, -118.3965]; // Ventura & Laurel Canyon
const onWilshire: [number, number] = [34.0616, -118.3005];

// ——— At 9am the outlet is dark ———
const nine = la(9);
const bagelKitchens = kitchensFor(["single-bagel"], nine);
ok("at 9am only the full stores are lit",
   ids(bagelKitchens) === "wilshire,larchmont,glendon,ventura", ids(bagelKitchens));
ok("and a Westwood address collects from Glendon",
   nearestDelivering(nearWestwood, kitchensFor(["single-bagel"], nine))?.id === "glendon",
   nearestDelivering(nearWestwood, kitchensFor(["single-bagel"], nine))?.id);
ok("and a Studio City address collects from Ventura",
   nearestDelivering(nearStudioCity, kitchensFor(["single-bagel"], nine))?.id === "ventura",
   nearestDelivering(nearStudioCity, kitchensFor(["single-bagel"], nine))?.id);

// ——— At noon all four are open, and the basket decides ———
const noon = la(12);
const withSandwich = kitchensFor(["the-veggie-stack"], noon);
ok("a sandwich narrows to the full stores",
   ids(withSandwich) === "wilshire,larchmont,glendon,ventura", ids(withSandwich));
ok("and a Westwood sandwich leaves from Glendon",
   nearestDelivering(nearWestwood, kitchensFor(["the-veggie-stack"], noon))?.id === "glendon");

// ——— The outlet preference, and the bound on it ———
//
// ⚠️ Run against the real Koreatown Outlet record, pushed back into LOCATIONS
// for the length of this block. The shop paused that counter, so there is no
// outlet in the live list — and the preference, OUTLET_DETOUR_MILES and
// outletChipFor are all still live code one array entry away from running.
//
// Deleting these assertions with the record would have left that code with no
// coverage at all, and pushing a made-up outlet would test a shape rather than
// the shop. Pushing WESTERN itself means that when it comes back, nothing here
// needs rewriting: it is already the case being tested.
LOCATIONS.push(WESTERN);
try {
  // A basket every counter can make prefers the outlets, so the full stores
  // keep their line free for the orders only they can take. With no destination
  // in hand that is still the whole rule.
  ok("with no destination, bagels prefer the outlet",
     ids(kitchensFor(["single-bagel"], noon)) === "western",
     ids(kitchensFor(["single-bagel"], noon)));

  // On the store's own block the outlet is seven tenths of a mile further,
  // which is the detour the rule was written to buy. It still buys it.
  ok("a bagel to Wilshire's own block still leaves from the outlet",
     ids(kitchensFor(["single-bagel"], noon, onWilshire)) === "western",
     ids(kitchensFor(["single-bagel"], noon, onWilshire)));

  // ⚠️ And the bound. The outlet is in Koreatown, eight miles from Westwood and
  // seven from Studio City. A bagel to either is nowhere near
  // OUTLET_DETOUR_MILES, so the preference does not apply and the near kitchen
  // takes it. Under an unbounded preference every bagel in Westwood would cross
  // the city to Koreatown.
  for (const [where, point, expected] of [
    ["Westwood", nearWestwood, "glendon"],
    ["Studio City", nearStudioCity, "ventura"],
  ] as const) {
    const pool = kitchensFor(["single-bagel"], noon, point);
    ok(`a bagel to ${where} is not narrowed to the outlet`,
       !(pool.length === 1 && pool[0].id === "western"), ids(pool));
    ok(`and leaves from ${expected}`,
       nearestDelivering(point, pool)?.id === expected,
       nearestDelivering(point, pool)?.id);
  }
} finally {
  LOCATIONS.pop();
}

// ——— ⚠️ And with the outlet paused, nothing prefers anything ———
//
// The state the shop is actually in. No record carries `outlet`, so the
// preference branch never fires and the nearest able kitchen simply wins.
ok("with the outlet out, a bagel goes to the nearest kitchen",
   nearestDelivering(onWilshire, kitchensFor(["single-bagel"], noon, onWilshire))?.id === "wilshire",
   ids(kitchensFor(["single-bagel"], noon, onWilshire)));

// ——— ⚠️ The coverage the spread bought ———
//
// Santa Monica was the worked example of an address out of range: with every
// counter in or near Koreatown the nearest kitchen was eleven straight-line
// miles off, and this suite asserted the refusal. Glendon Ave is four miles
// from it, so the same address now has a kitchen — and it is the only one of
// the four within the radius, which is why the pool is exactly one.
const santaMonica: [number, number] = [34.0195, -118.4912];
const smSandwich = kitchensFor(["the-veggie-stack"], noon, santaMonica);
ok("a sandwich to Santa Monica now has a kitchen", smSandwich.length > 0, "(empty)");
ok("and it is Glendon alone, the only counter within the radius",
   ids(smSandwich) === "glendon", ids(smSandwich));
ok("which is inside the rule by a real margin",
   milesBetween(santaMonica, smSandwich[0].position) < DELIVERY_RADIUS_MILES,
   milesBetween(santaMonica, smSandwich[0].position).toFixed(1));

// ——— The earliest a delivery can go ———
ok("a sandwich delivery cannot go before 7", earliestDeliveryHour(["the-veggie-stack"]) === 7,
   String(earliestDeliveryHour(["the-veggie-stack"])));

// ——— Before anyone opens ———
ok("at 4am nothing is lit", kitchensFor(["single-bagel"], la(4)).length === 0);

// ——— An outlet far from any full store ———
//
// Found by asking where to open next, which is the useful kind of question to
// ask a routing rule. Narrowing the pool by distance *before* asking what each
// counter can make leaves a neighbourhood whose only nearby counter is an
// outlet with nothing in the pool that makes sandwiches — and the old fallback
// then handed the order to it anyway. A courier would have been sent to
// collect a sandwich from a counter with no sandwich line.
//
// The menu filter runs first now, and an order nobody open can make comes back
// empty so the endpoint refuses it.
//
// ⚠️ Long Beach rather than Santa Monica. This scenario needs a point that no
// real counter can reach, and Santa Monica stopped being one the day Westwood
// opened — which is exactly the sort of quiet invalidation that leaves a test
// passing for the wrong reason. Long Beach is twenty miles from the nearest.
const longBeach: [number, number] = [33.7701, -118.1937];
const island: StoreLocation = {
  id: "test-island-outlet", name: "Island", kind: "shop", outlet: true,
  address: "x", city: "Los Angeles, CA", hours: "x",
  position: longBeach, aliases: [], menu: ["Bagels", "Spreads", "Drinks"],
};
LOCATIONS.push(island);
try {
  const bagels = kitchensFor(["single-bagel"], noon, longBeach);
  ok("a distant outlet does take the bagels near it",
     ids(bagels) === "test-island-outlet", ids(bagels));

  // Asserted as a positive, and that matters. "The outlet is not in the pool"
  // is satisfied by an empty pool, so the first version of this passed against
  // both the fix and the bug — the two changes it covers are entangled, and
  // only naming who *should* be there separates them. An empty pool is safe
  // and still wrong: it refuses with a shrug where the real answer is a road
  // distance and a number the customer can act on.
  const sandwiches = kitchensFor(["the-veggie-stack"], noon, longBeach);
  ok("but never the sandwiches it cannot make",
     !sandwiches.some((s) => s.id === "test-island-outlet"), ids(sandwiches));
  ok("those stay with the counters that can, every full store",
     sandwiches.map((s) => s.id).sort().join(",") === "glendon,larchmont,ventura,wilshire",
     ids(sandwiches) || "(empty)");
  // And the honest consequence: too far to deliver, refused rather than
  // dispatched to a counter that would have to say no in person.
  const nearestAble = Math.min(
    ...sandwiches.map((s) => milesBetween(longBeach, s.position)),
  ) * 1.3;
  ok("so a sandwich there is out of range, which the quote will say",
     nearestAble > DELIVERY_RADIUS_MILES, nearestAble.toFixed(1));

  // Nothing open at all is an empty pool.
  const shut = new Date(Date.UTC(2026, 7, 19, 11, 0)); // 4am in Los Angeles
  ok("and when nothing is open, the pool is empty",
     kitchensFor(["the-veggie-stack"], shut, longBeach).length === 0);
} finally {
  LOCATIONS.pop();
}

// ——— Open, and none of them can make it ———
//
// The defensive branch, which the shop's current line-up cannot reach: while a
// full-menu store keeps the longest hours there is always somebody able. It is
// worth a test anyway, because the day it *is* reachable is a day somebody
// changed the hours or the menus and will not be reading this file.
//
// Built by taking the full stores out of the delivering set, so the only lit
// counters are outlets and nothing open makes a sandwich. Empty is the answer.
// Handing the order to an outlet instead — which is what "fall back to whatever
// is open" means — is a courier sent to collect something nobody there can
// make, and the customer finds out from a person rather than from a screen.
const outletsOnly = LOCATIONS.map((l) => ({ ...l }));
const saved = LOCATIONS.splice(0, LOCATIONS.length, ...outletsOnly);
try {
  for (const l of LOCATIONS) if (l.menu === undefined) l.delivery = false;
  const pool = kitchensFor(["the-veggie-stack"], noon, [34.0685, -118.3092]);
  ok("with only outlets delivering, a sandwich has no kitchen at all",
     pool.length === 0, ids(pool));
  // ⚠️ The bagel half of this needs an outlet to exist, since the block above
  // switched every full store's delivery off. With the Koreatown Outlet paused
  // there is nothing left delivering at all, so the real record goes in for the
  // length of the check.
  LOCATIONS.push({ ...WESTERN });
  try {
    const bagelPool = kitchensFor(["single-bagel"], noon, [34.0685, -118.3092]);
    ok("while a bagel still has one", bagelPool.length > 0, ids(bagelPool));
  } finally {
    LOCATIONS.pop();
  }
} finally {
  LOCATIONS.splice(0, LOCATIONS.length, ...saved);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
