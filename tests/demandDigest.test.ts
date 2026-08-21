// The daily digest, as the shop will read it.
//
// The report is the product here — the table is just where it comes from — so
// what these assert is the sentences: that a quiet day says so rather than
// printing nothing, that catering is labelled as enquiries rather than orders
// every single time, and that a refusal at the checkout is distinguishable
// from somebody idly asking on the marketing page.

import { buildDigest, digestDay } from "../app/demandDigest";
import type { DayRow } from "../app/demand";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

const WILSHIRE: [number, number] = [34.06, -118.30];
// ⚠️ Was USC and Santa Monica. The USC counter closed and Westwood opened, so
// the point that used to sit on top of a counter now sits three miles from
// none, and Santa Monica went from "far enough to be refused" to four miles
// inside the rule. Both fixtures moved with the shops.
const WESTWOOD: [number, number] = [34.06, -118.4432];
const LONG_BEACH: [number, number] = [33.77, -118.19];

const row = (over: Partial<DayRow>): DayRow => ({
  mode: "pickup", outcome: "placed", channel: "order", counter: "wilshire",
  at: WILSHIRE, n: 1, averageMiles: 0, ...over,
});

const flat = (sections: { title: string; lines: string[]; note?: string }[]) =>
  sections.map((s) => `${s.title}\n${s.lines.join("\n")}\n${s.note ?? ""}`).join("\n");

// ——— Which day ———
//
// Yesterday in the shop's zone, not the server's. A digest fired at 15:00 UTC
// is 8am in Los Angeles, and asking for "today" there would report the four
// hours since midnight — a page of zeroes, every morning.
const at8amLA = new Date("2026-08-20T15:00:00Z");
ok("the digest covers yesterday, in shop time", digestDay(at8amLA) === "2026-08-19",
   digestDay(at8amLA));
// And just after midnight UTC, which is still the previous afternoon in LA, it
// must not skip a day.
const justAfterUtcMidnight = new Date("2026-08-20T00:30:00Z"); // 5:30pm Aug 19 in LA
ok("and does not skip a day across the UTC boundary",
   digestDay(justAfterUtcMidnight) === "2026-08-18", digestDay(justAfterUtcMidnight));

// ——— A day with everything in it ———
const busy: DayRow[] = [
  row({ mode: "pickup", counter: "wilshire", n: 14 }),
  row({ mode: "pickup", counter: "glendon", at: WESTWOOD, n: 9 }),
  row({ mode: "pickup", counter: "western", n: 3 }),
  row({ mode: "delivery", counter: "wilshire", at: [34.07, -118.34], n: 6 }),
  row({ mode: "delivery", counter: "glendon", at: WESTWOOD, n: 2 }),
  row({ mode: "catering", outcome: "interest", channel: "catering", counter: "glendon",
        at: WESTWOOD, n: 4 }),
  row({ mode: "delivery", outcome: "refused", channel: "checkout", counter: "",
        at: LONG_BEACH, n: 5, averageMiles: 14.2 }),
  row({ mode: "delivery", outcome: "refused", channel: "area", counter: "",
        at: [34.15, -118.45], n: 2, averageMiles: 12.7 }),
];
const busyOut = buildDigest("2026-08-19", busy);
const busyText = flat(busyOut.sections);

ok("the subject names the day and both headline numbers",
   busyOut.subject === "Corner Bagel — 2026-08-19 — 34 orders, 7 turned away",
   busyOut.subject);
ok("pickup is broken out by counter",
   /14× Wilshire Blvd/.test(busyText) && /9× Glendon Ave/.test(busyText),
   busyText);
// Named by counter and distance rather than by a coordinate — the report is
// read over coffee, not plotted. The first version of this assertion named
// Wilshire because that felt like the nearest counter to the test's point; it
// is Western, and the probe was wrong rather than the code.
const deliveryLines = busyOut.sections[1].lines;
ok("delivery is described by the nearest counter and a distance",
   deliveryLines.every((line) => /^\d+× near .+ \(\d+\.\d mi\)/.test(line)),
   deliveryLines.join(" | "));
ok("and never by a raw coordinate",
   !/-?\d{2}\.\d{2,}/.test(deliveryLines.join(" ").replace(/\(\d+\.\d mi\)/g, "")),
   deliveryLines.join(" | "));
ok("a delivery that stayed near its own counter does not say so twice",
   deliveryLines.some((line) => /near Glendon Ave/.test(line) && !/from /.test(line)),
   deliveryLines.join(" | "));
ok("while one that crossed the city names both ends",
   deliveryLines.some((line) => /near Western Ave/.test(line) && /from Wilshire Blvd/.test(line)),
   deliveryLines.join(" | "));
ok("a refusal says how far out it was", /14\.2 mi out/.test(busyText), busyText);
ok("and which screen it happened on",
   /at the checkout/.test(busyText) && /on the delivery page/.test(busyText), busyText);
ok("the sections are in the order the questions get asked",
   busyOut.sections.map((s) => s.title.split(" —")[0]).join(",") ===
     "Pickup,Delivery,Catering,Turned away",
   busyOut.sections.map((s) => s.title.split(" —")[0]).join(","));

// ——— Catering is never presented as orders ———
//
// The most important line in the file. Catering leaves through a mailto and
// never comes back, so this number is people who pressed the button. A reader
// who forgets that reads a quiet week as a dead market, and the caveat is what
// stops that — so it is asserted on every day, not just the busy one.
const cateringSection = busyOut.sections.find((s) => s.title.startsWith("Catering"));
ok("catering is headed as enquiries, not orders",
   /enquiries started/.test(cateringSection?.title ?? ""), cateringSection?.title);
ok("and carries the caveat about the mailto",
   /not orders/.test(cateringSection?.note ?? "") && /mailto/.test(cateringSection?.note ?? ""),
   cateringSection?.note);

// ——— A day with nothing in it ———
//
// Every section still appears and says what happened, because a digest with
// missing sections reads as a broken digest rather than a quiet Tuesday.
const quiet = buildDigest("2026-08-19", []);
ok("a quiet day still has all four sections", quiet.sections.length === 4,
   String(quiet.sections.length));
ok("and says so rather than printing nothing",
   quiet.sections.every((s) => s.lines.length > 0 || (s.note ?? "").length > 0),
   JSON.stringify(quiet.sections));
ok("with no refusals stated plainly",
   /Nobody was turned away/.test(quiet.sections[3].note ?? ""), quiet.sections[3].note);
ok("the catering caveat is there on a quiet day too",
   /not orders/.test(quiet.sections[2].note ?? ""), quiet.sections[2].note);
ok("and the subject is still readable",
   quiet.subject === "Corner Bagel — 2026-08-19 — 0 orders, 0 turned away", quiet.subject);

// ——— The totals are of the day, not of the top ten ———
//
// The lists are capped at ten rows. The headline must count everything, or a
// busy day reads as a slow one.
const many: DayRow[] = Array.from({ length: 25 }, (_, i) =>
  row({ mode: "delivery", at: [34.0 + i * 0.01, -118.3], n: 2 }),
);
const capped = buildDigest("2026-08-19", many);
ok("the headline counts every row", /50 orders/.test(capped.subject), capped.subject);
ok("while the list stays readable",
   (capped.sections[1].lines.length) === 10, String(capped.sections[1].lines.length));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
