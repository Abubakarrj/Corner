// What a scheduled order actually looks like on the wire to Toast.
//
// ——— Why this is worth a test rather than a shrug ———
//
// The scheduled-pickup work sends Toast two things it did not send before: a
// promisedDate, which is the field its own scheduling reads, and a FOR <time>
// on the ticket, which is what the person at the counter reads. Neither can be
// checked against a real Toast from here, and "I could not verify it" is not
// the same as "it is probably fine" — the failure mode is a bag made at 7am
// for somebody arriving at 11, which is exactly the experience this whole
// feature exists to avoid.
//
// So the transport is stubbed and the payload is inspected. That does not prove
// Toast accepts the field. It proves the app sends what it claims to send, in
// the shape and the timezone it claims, which is the half that is ours.

import { createToastOrder } from "../app/toast";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

process.env.TOAST_API_HOST = "https://toast.test";
process.env.TOAST_CLIENT_ID = "id";
process.env.TOAST_CLIENT_SECRET = "secret";
process.env.TOAST_RESTAURANT_GUID = "guid";

let sent: Record<string, unknown> | null = null;
// Read through a function rather than off the variable. `sent` is only ever
// written from inside the stubbed fetch, which the compiler cannot see running,
// so after `sent = null` it narrows to null and every field read below becomes
// an error on `never`.
const wire = () => (sent ?? {}) as Record<string, unknown>;
const tabName = () =>
  ((wire().checks as { tabName?: string }[] | undefined)?.[0]?.tabName) ?? "";
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes("/authentication/")) {
    return new Response(JSON.stringify({ token: { accessToken: "t", expiresIn: 3600 } }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
  if (url.includes("/orders/v2/orders")) {
    sent = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ guid: "order-guid" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
  return realFetch(input as never, init as never);
}) as typeof fetch;

const draft = {
  customer: { firstName: "A", lastName: "B", email: "", phone: "2135550147" },
  diningOption: "pickup" as const,
  items: [{ slug: "single-bagel", name: "Bagel", quantity: 1, unitCents: 300, modifiers: ["Plain"] }],
  subtotalCents: 300,
  tipCents: 0,
  utensils: false,
};

async function main() {
  // 7:15 AM in Los Angeles on Thursday 2026-08-20. In August that is UTC-7, so
  // the instant is 14:15Z — and the two numbers being different is the point:
  // a label built in the runtime's zone would read 2:15 PM on this server.
  const slot = new Date(Date.UTC(2026, 7, 20, 14, 15));

  const scheduled = await createToastOrder({ ...draft, promisedAt: slot });
  ok("the order went", scheduled.ok === true, JSON.stringify(scheduled));
  ok("promisedDate is sent", typeof wire().promisedDate === "string",
     JSON.stringify(wire().promisedDate));
  ok("as the exact instant, in ISO",
     wire().promisedDate === "2026-08-20T14:15:00.000Z", String(wire().promisedDate));

  const tab = tabName();
  ok("the ticket says it is for later", tab.startsWith("FOR "), JSON.stringify(tab));
  // Shop time, not the server's. TZ=UTC on this run, so an implementation that
  // used the runtime clock would print 2:15 PM here and be seven hours wrong on
  // every ticket the shop ever sees.
  ok("in the shop's own zone", /7:15/.test(tab), JSON.stringify(tab));
  ok("with the day on it, since it is not today", /Thu/.test(tab), JSON.stringify(tab));

  // ——— And an ordinary order is unchanged ———
  //
  // The other half of the risk: a field added for scheduling must not appear on
  // every order, or Toast schedules the whole shop for the moment it was
  // opened.
  sent = null;
  const now = await createToastOrder(draft);
  ok("an ordinary order still goes", now.ok === true);
  ok("and carries no promisedDate", !("promisedDate" in wire()),
     JSON.stringify(wire().promisedDate));
  ok("and no FOR on its ticket", !tabName().startsWith("FOR "), JSON.stringify(tabName()));

  // ——— The note keeps its other duties ———
  sent = null;
  await createToastOrder({
    ...draft, diningOption: "curbside", utensils: true, note: "no onions", promisedAt: slot,
  });
  const full = tabName();
  ok("the scheduled time comes first on a crowded ticket",
     full.startsWith("FOR "), JSON.stringify(full));
  ok("and curbside, utensils and the note all survive beside it",
     /CURBSIDE/.test(full) && /Utensils/.test(full) && /no onions/.test(full),
     JSON.stringify(full));

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
