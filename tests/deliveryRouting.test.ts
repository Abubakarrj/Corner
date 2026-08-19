// Which kitchen a delivery near USC leaves from, now that there is one there.
import { kitchensFor, earliestDeliveryHour } from "../app/storePlaces";
import { nearestDelivering } from "../app/(marketing)/locations/locations";

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

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
