// Which kitchen a delivery near USC leaves from, now that there is one there.
import { kitchensFor, earliestDeliveryHour } from "../app/storePlaces";
import {
  DELIVERY_RADIUS_MILES,
  LOCATIONS,
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
const nearUSC: [number, number] = [34.0224, -118.2851];

// ——— At 9am the outlet is dark ———
const nine = la(9);
const bagelKitchens = kitchensFor(["single-bagel"], nine).map((s) => s.id);
ok("at 9am only the two full stores are lit", bagelKitchens.join(",") === "wilshire,figueroa",
   bagelKitchens.join(","));
ok("and a USC address collects from the USC store",
   nearestDelivering(nearUSC, kitchensFor(["single-bagel"], nine))?.id === "figueroa");

// ——— At noon all three are open, and the basket decides ———
const noon = la(12);
const withSandwich = kitchensFor(["the-veggie-stack"], noon).map((s) => s.id);
ok("a sandwich narrows to the full stores", withSandwich.join(",") === "wilshire,figueroa",
   withSandwich.join(","));
ok("and a USC sandwich leaves from the USC store",
   nearestDelivering(nearUSC, kitchensFor(["the-veggie-stack"], noon))?.id === "figueroa");

// ——— The outlet preference, and the bound on it ———
//
// A basket every counter can make prefers the outlets, so the full stores keep
// their line free for the orders only they can take. With no destination in
// hand that is still the whole rule.
const bagelsOnly = kitchensFor(["single-bagel"], noon).map((s) => s.id);
ok("with no destination, bagels prefer the outlet",
   bagelsOnly.join(",") === "western", bagelsOnly.join(","));

// On the store's own block the outlet is seven tenths of a mile further, which
// is the detour the rule was written to buy. It still buys it.
const onWilshire: [number, number] = [34.0616, -118.3005];
ok("a bagel to Wilshire's own block still leaves from the outlet",
   kitchensFor(["single-bagel"], noon, onWilshire).map((s) => s.id).join(",") === "western",
   kitchensFor(["single-bagel"], noon, onWilshire).map((s) => s.id).join(","));

// By USC the outlet is 3.5 miles away and a full store is 0.8. That is not a
// detour, it is a different delivery, so distance wins.
// The pool widens rather than narrowing to the outlet — every able kitchen is
// a candidate again, and the distance decides between them. Asserted on the
// choice rather than on the pool: the outlet is still a kitchen that could
// make this, and there is nothing wrong with it being in the list.
const uscPool = kitchensFor(["single-bagel"], noon, nearUSC).map((s) => s.id);
ok("a bagel to USC is not narrowed to the outlet alone",
   uscPool.length > 1 && uscPool.includes("figueroa"), uscPool.join(","));
ok("and leaves from the USC store",
   nearestDelivering(nearUSC, kitchensFor(["single-bagel"], noon, nearUSC))?.id === "figueroa",
   nearestDelivering(nearUSC, kitchensFor(["single-bagel"], noon, nearUSC))?.id);

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
const santaMonica: [number, number] = [34.0195, -118.4912];
const island: StoreLocation = {
  id: "test-island-outlet", name: "Island", kind: "shop", outlet: true,
  address: "x", city: "Los Angeles, CA", hours: "x",
  position: santaMonica, aliases: [], menu: ["Bagels", "Spreads", "Drinks"],
};
LOCATIONS.push(island);
try {
  const bagels = kitchensFor(["single-bagel"], noon, santaMonica);
  ok("a distant outlet does take the bagels near it",
     bagels.map((s) => s.id).join(",") === "test-island-outlet",
     bagels.map((s) => s.id).join(","));

  // Asserted as a positive, and that matters. "The outlet is not in the pool"
  // is satisfied by an empty pool, so the first version of this passed against
  // both the fix and the bug — the two changes it covers are entangled, and
  // only naming who *should* be there separates them. An empty pool is safe
  // and still wrong: it refuses with a shrug where the real answer is a road
  // distance and a number the customer can act on.
  const sandwiches = kitchensFor(["the-veggie-stack"], noon, santaMonica);
  ok("but never the sandwiches it cannot make",
     !sandwiches.some((s) => s.id === "test-island-outlet"),
     sandwiches.map((s) => s.id).join(","));
  ok("those stay with the counters that can, both of them",
     sandwiches.map((s) => s.id).sort().join(",") === "figueroa,wilshire",
     sandwiches.map((s) => s.id).join(",") || "(empty)");
  // And the honest consequence: too far to deliver, refused rather than
  // dispatched to a counter that would have to say no in person.
  const nearestAble = Math.min(
    ...sandwiches.map((s) => milesBetween(santaMonica, s.position)),
  ) * 1.3;
  ok("so a sandwich there is out of range, which the quote will say",
     nearestAble > DELIVERY_RADIUS_MILES, nearestAble.toFixed(1));

  // Nothing open at all is an empty pool.
  const shut = new Date(Date.UTC(2026, 7, 19, 11, 0)); // 4am in Los Angeles
  ok("and when nothing is open, the pool is empty",
     kitchensFor(["the-veggie-stack"], shut, santaMonica).length === 0);
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
     pool.length === 0, pool.map((s) => s.id).join(","));
  const bagelPool = kitchensFor(["single-bagel"], noon, [34.0685, -118.3092]);
  ok("while a bagel still has one", bagelPool.length > 0, bagelPool.map((s) => s.id).join(","));
} finally {
  LOCATIONS.splice(0, LOCATIONS.length, ...saved);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
