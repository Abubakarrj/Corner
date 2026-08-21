// What an order actually looks like on the wire to Square.
//
// ——— Why this exists ———
//
// There is no Square sandbox wired into this checkout yet, so nothing here has
// ever been sent to a real till. That is exactly the condition under which an
// integration is most likely to be confidently wrong, and Square has three
// traps that a reading of the code does not catch:
//
//   1. `quantity` is a *string*. A number is a 400 whose message complains
//      about something else entirely.
//   2. An order with no `fulfillments` is accepted, appears in reporting, and
//      never appears on anybody's screen as something to make. This was a real
//      bug in this file — the fulfillment was built and never attached — and
//      ESLint caught it, which is luck rather than a process.
//   3. The wire is snake_case while every type Square publishes is camelCase.
//      A `locationId` on the body is a silently ignored field.
//
// So the transport is stubbed and the payload is inspected. That does not prove
// Square accepts it. It proves the app sends what it claims to send, which is
// the half that is ours.

import {
  attachSquareCourier,
  createSquareOrder,
  fetchSquareOrder,
  countOpenSquareOrders,
  squareLocationFor,
} from "../app/square";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

process.env.SQUARE_ACCESS_TOKEN = "token";
process.env.SQUARE_LOCATION_ID = "L-default";
process.env.SQUARE_LOCATION_GLENDON = "L-glendon";
// Left unset on purpose: SQUARE_LOCATION_WILSHIRE. The fallback is the case
// that goes wrong quietly on a real account, so it is the one under test.
delete process.env.SQUARE_LOCATION_WILSHIRE;
delete process.env.SQUARE_ENV;

type Wire = Record<string, unknown>;

let sent: Wire | null = null;
let sentUrl = "";
let sentMethod = "";
let sentHeaders: Record<string, string> = {};
let reply: { status: number; body: unknown } = {
  status: 200,
  body: { order: { id: "sq-order-1" } },
};

// Read through functions rather than off the variables: `sent` is only written
// from inside the stubbed fetch, which the compiler cannot see running, so
// after `sent = null` it narrows to null and every field read becomes an error
// on `never`.
const wire = () => (sent ?? {}) as Wire;
const order = () => (wire().order ?? {}) as Wire;
const fulfillments = () => (order().fulfillments ?? []) as Wire[];
const first = () => fulfillments()[0] ?? {};
const pickup = () => (first().pickup_details ?? {}) as Wire;
const delivery = () => (first().delivery_details ?? {}) as Wire;
const lines = () => (order().line_items ?? []) as Wire[];

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  sentUrl = String(input);
  // Recorded because the URL alone does not distinguish creating an order from
  // updating one: /v2/orders/{id} with POST is a different request entirely,
  // and asserting only the path let that mutation through once.
  sentMethod = init?.method ?? "GET";
  sentHeaders = (init?.headers ?? {}) as Record<string, string>;
  if (init?.body) sent = JSON.parse(String(init.body));
  return new Response(JSON.stringify(reply.body), {
    status: reply.status,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;

const draft = {
  customer: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "2135550147" },
  diningOption: "pickup" as const,
  items: [
    { slug: "single-bagel", name: "Bagel", quantity: 2, unitCents: 300, modifiers: ["Plain", "Toasted"] },
  ],
  subtotalCents: 600,
  tipCents: 0,
  utensils: false,
};

function reset(body: unknown = { order: { id: "sq-order-1" } }, status = 200) {
  sent = null;
  sentUrl = "";
  sentMethod = "";
  sentHeaders = {};
  reply = { status, body };
}

async function main() {
  // ——— An ordinary order ———
  reset();
  const now = await createSquareOrder(draft);
  ok("the order went", now.ok === true, JSON.stringify(now));
  ok("by POST", sentMethod === "POST", sentMethod);
  ok("to the sandbox, because SQUARE_ENV is unset",
     sentUrl === "https://connect.squareupsandbox.com/v2/orders", sentUrl);
  ok("with the API version pinned",
     sentHeaders["Square-Version"] === "2026-08-19", JSON.stringify(sentHeaders["Square-Version"]));
  ok("and the token as a bearer",
     sentHeaders.Authorization === "Bearer token", JSON.stringify(sentHeaders.Authorization));

  // The one that was actually broken. Without this an order reaches Square as a
  // bare sale and nobody in the kitchen ever sees it.
  ok("a fulfillment is attached", fulfillments().length === 1,
     JSON.stringify(order().fulfillments));
  ok("it is a pickup", first().type === "PICKUP", String(first().type));
  ok("proposed, not already reserved", first().state === "PROPOSED", String(first().state));
  ok("asked for as soon as possible", pickup().schedule_type === "ASAP",
     String(pickup().schedule_type));
  ok("with no pickup_at pinned on it", !("pickup_at" in pickup()),
     JSON.stringify(pickup().pickup_at));
  ok("and a prep time in ISO 8601 duration form",
     pickup().prep_time_duration === "P0DT0H12M0S", String(pickup().prep_time_duration));
  ok("not curbside", pickup().is_curbside_pickup === false,
     String(pickup().is_curbside_pickup));

  const recipient = (pickup().recipient ?? {}) as Wire;
  ok("the customer's name is on it", recipient.display_name === "Ada Lovelace",
     String(recipient.display_name));
  ok("with their phone, so the counter can call", recipient.phone_number === "2135550147",
     String(recipient.phone_number));
  ok("and their email", recipient.email_address === "ada@example.com",
     String(recipient.email_address));

  // ——— snake_case, which is the whole difference between the SDK and the wire ———
  ok("nothing camelCase leaked into the body",
     !("locationId" in order()) && !("lineItems" in order()) && !("pickupAt" in pickup()),
     JSON.stringify(Object.keys(order())));
  ok("the location is location_id", order().location_id === "L-default",
     String(order().location_id));

  // ——— The line items ———
  ok("one line", lines().length === 1, JSON.stringify(lines()));
  // A number here is a 400 that reads like a complaint about something else.
  ok("quantity is a string, not a number", lines()[0].quantity === "2",
     `${typeof lines()[0].quantity} ${JSON.stringify(lines()[0].quantity)}`);
  ok("the name is ours", lines()[0].name === "Bagel", String(lines()[0].name));
  ok("priced in cents", JSON.stringify(lines()[0].base_price_money) ===
     JSON.stringify({ amount: 300, currency: "USD" }),
     JSON.stringify(lines()[0].base_price_money));
  // The choices are what a bagel arrives without when they are dropped.
  ok("the choices ride along on the line", lines()[0].note === "Plain, Toasted",
     String(lines()[0].note));

  // ——— Tax and the courier's fee ———
  //
  // The first real order to land in Square read $3.75 on a basket the customer
  // is charged $4.11 for: total_tax_money 0, because nothing in this body ever
  // mentioned tax. The ticket understated it and so did every report built on
  // it.
  const taxes = () => (order().taxes ?? []) as Wire[];
  const charges = () => (order().service_charges ?? []) as Wire[];

  ok("tax rides with the order", taxes().length === 1, JSON.stringify(order().taxes));
  // A rate rather than an amount, so Square reaches the figure itself and the
  // two cannot drift by a rounding cent.
  ok("as our own rate", taxes()[0]?.percentage === "9.75", String(taxes()[0]?.percentage));
  ok("added on top rather than assumed to be inside the prices",
     taxes()[0]?.type === "ADDITIVE", String(taxes()[0]?.type));
  ok("across the whole order, the way a receipt shows it",
     taxes()[0]?.scope === "ORDER", String(taxes()[0]?.scope));

  // A pickup has no courier and must not grow a delivery charge.
  ok("a pickup carries no service charge", !("service_charges" in order()),
     JSON.stringify(order().service_charges));

  reset();
  await createSquareOrder({ ...draft, diningOption: "delivery", deliveryCents: 499 });
  ok("a delivery fee goes up as a service charge", charges().length === 1,
     JSON.stringify(order().service_charges));
  ok("for what the customer was charged",
     JSON.stringify((charges()[0]?.amount_money ?? {}) as Wire) ===
       JSON.stringify({ amount: 499, currency: "USD" }),
     JSON.stringify(charges()[0]?.amount_money));
  // ⚠️ Our tax is computed on food. Letting Square tax the courier as well
  // would charge more than the customer was shown.
  ok("and is not taxed a second time", charges()[0]?.taxable === false,
     String(charges()[0]?.taxable));

  // A waived fee is not a zero-value charge on the ticket.
  reset();
  await createSquareOrder({ ...draft, diningOption: "delivery", deliveryCents: 0 });
  ok("a waived delivery fee adds nothing", !("service_charges" in order()),
     JSON.stringify(order().service_charges));

  // ——— A catalog id, when there is one ———
  reset();
  await createSquareOrder({
    ...draft,
    items: [{ ...draft.items[0], posItemId: "CAT-123" }],
  });
  ok("a mapped item goes up by catalog id", lines()[0].catalog_object_id === "CAT-123",
     String(lines()[0].catalog_object_id));
  ok("and then carries no ad-hoc name or price",
     !("name" in lines()[0]) && !("base_price_money" in lines()[0]),
     JSON.stringify(lines()[0]));

  // ——— A scheduled order ———
  //
  // 7:15 AM in Los Angeles on Thursday 2026-08-20. In August that is UTC-7, so
  // the instant is 14:15Z — and the two numbers being different is the point: a
  // label built in the runtime's zone reads 2:15 PM on this server, and every
  // ticket in the shop would be seven hours wrong.
  const slot = new Date(Date.UTC(2026, 7, 20, 14, 15));
  reset();
  const later = await createSquareOrder({ ...draft, promisedAt: slot, reference: "sched-abc" });
  ok("the scheduled order went", later.ok === true, JSON.stringify(later));
  ok("it is SCHEDULED", pickup().schedule_type === "SCHEDULED",
     String(pickup().schedule_type));
  ok("with the exact instant, in ISO",
     pickup().pickup_at === "2026-08-20T14:15:00.000Z", String(pickup().pickup_at));

  const note = String(pickup().note ?? "");
  ok("the ticket note says it is for later", note.startsWith("FOR "), JSON.stringify(note));
  ok("in the shop's own zone, not the server's", /7:15/.test(note), JSON.stringify(note));
  ok("with the day on it, since it is not today", /Thu/.test(note), JSON.stringify(note));

  const ticket = String(order().ticket_name ?? "");
  ok("and the open ticket leads with the time", ticket.startsWith("FOR "), JSON.stringify(ticket));
  ok("then says who it is for", /Ada/.test(ticket), JSON.stringify(ticket));
  ok("within Square's 30 characters", ticket.length <= 30, `${ticket.length}: ${ticket}`);

  ok("our handle is on Square's copy", order().reference_id === "sched-abc",
     String(order().reference_id));
  ok("and is the idempotency key, so a retry cannot become two orders",
     wire().idempotency_key === "sched-abc", String(wire().idempotency_key));

  // ——— And an ordinary order is unchanged ———
  //
  // The other half of the risk: a field added for scheduling must not appear on
  // every order, or Square schedules the whole shop for the moment it was
  // opened.
  reset();
  await createSquareOrder(draft);
  ok("an ordinary order is still ASAP", pickup().schedule_type === "ASAP",
     String(pickup().schedule_type));
  ok("and its ticket carries no FOR", !String(order().ticket_name).startsWith("FOR "),
     String(order().ticket_name));
  ok("and no note at all when there is nothing to say", !("note" in pickup()),
     JSON.stringify(pickup().note));

  // ——— Curbside, utensils and the customer's note ———
  reset();
  await createSquareOrder({
    ...draft, diningOption: "curbside", utensils: true, note: "no onions", promisedAt: slot,
  });
  const full = String(pickup().note ?? "");
  ok("curbside is set on the fulfillment", pickup().is_curbside_pickup === true,
     String(pickup().is_curbside_pickup));
  ok("the scheduled time still comes first on a crowded ticket",
     full.startsWith("FOR "), JSON.stringify(full));
  ok("and curbside, utensils and the note all survive beside it",
     /CURBSIDE/.test(full) && /Utensils/.test(full) && /no onions/.test(full),
     JSON.stringify(full));

  // ——— Delivery ———
  reset();
  await createSquareOrder({
    ...draft,
    diningOption: "delivery",
    deliveryAddress: "123 S Main St, Los Angeles, CA 90013",
  });
  ok("a delivery is a DELIVERY fulfillment", first().type === "DELIVERY", String(first().type));
  ok("and carries no pickup_details", !("pickup_details" in first()),
     JSON.stringify(Object.keys(first())));
  // ⚠️ managed_delivery reads backwards from the obvious guess, and this file
  // asserted the guess. It declares that a third party is carrying the bag; it
  // does not ask Square to find one. With no courier named there is nothing to
  // declare, so false is right here and wrong the moment one is.
  ok("with no courier named, the delivery is not declared as somebody else's",
     delivery().managed_delivery === false, String(delivery().managed_delivery));
  ok("and no provider is claimed", !("courier_provider_name" in delivery()),
     JSON.stringify(delivery().courier_provider_name));
  const to = ((delivery().recipient ?? {}) as Wire).address as Wire | undefined;
  ok("the address is on it", to?.address_line_1 === "123 S Main St, Los Angeles, CA 90013",
     JSON.stringify(to));

  // ——— And with a courier named ———
  //
  // The bug this replaced: every delivery went up as one the shop was driving
  // itself, so the counter's screen had no provider and no number to call on an
  // order a stranger was carrying.
  reset();
  await createSquareOrder({
    ...draft,
    diningOption: "delivery",
    deliveryAddress: "123 S Main St, Los Angeles, CA 90013",
    courier: { provider: "Uber Direct", supportPhone: "8005550199" },
  });
  ok("a named courier is declared as a third party's delivery",
     delivery().managed_delivery === true, String(delivery().managed_delivery));
  ok("by name", delivery().courier_provider_name === "Uber Direct",
     String(delivery().courier_provider_name));
  // Naming a provider and leaving staff no number to call is the half-done
  // version of this, and Square asks for both together.
  ok("with a number the counter can ring",
     delivery().courier_support_phone_number === "8005550199",
     String(delivery().courier_support_phone_number));

  // A pickup never carries any of it, whatever is configured.
  reset();
  await createSquareOrder({
    ...draft,
    courier: { provider: "Uber Direct", supportPhone: "8005550199" },
  });
  ok("a pickup names no courier, even when one is configured",
     !("courier_provider_name" in pickup()) && !("managed_delivery" in pickup()),
     JSON.stringify(pickup()));

  // ——— Which counter is which Square location ———
  reset();
  await createSquareOrder({ ...draft, counter: "glendon" });
  ok("a mapped counter goes to its own Square location",
     order().location_id === "L-glendon", String(order().location_id));

  reset();
  await createSquareOrder({ ...draft, counter: "wilshire" });
  ok("an unmapped counter falls back to the default location",
     order().location_id === "L-default", String(order().location_id));
  ok("squareLocationFor agrees", squareLocationFor("glendon") === "L-glendon",
     String(squareLocationFor("glendon")));

  // ——— Production is opt-in ———
  process.env.SQUARE_ENV = "production";
  reset();
  await createSquareOrder(draft);
  ok("SQUARE_ENV=production reaches the real host",
     sentUrl === "https://connect.squareup.com/v2/orders", sentUrl);
  process.env.SQUARE_ENV = "sandbox";
  reset();
  await createSquareOrder(draft);
  ok("anything else stays in the sandbox",
     sentUrl === "https://connect.squareupsandbox.com/v2/orders", sentUrl);
  delete process.env.SQUARE_ENV;

  // ——— When Square says no ———
  reset({ errors: [{ code: "INVALID_REQUEST_ERROR", detail: "quantity is required", field: "line_items[0].quantity" }] }, 400);
  const refused = await createSquareOrder(draft);
  ok("a refusal is not ok", refused.ok === false, JSON.stringify(refused));
  ok("and the reason carries Square's own code and detail",
     refused.ok === false &&
       /INVALID_REQUEST_ERROR/.test(refused.reason) &&
       /quantity is required/.test(refused.reason) &&
       /line_items\[0\]\.quantity/.test(refused.reason),
     refused.ok === false ? refused.reason : "");

  // A 200 with no order id is a success that is not one. Claiming an order was
  // placed on the strength of it is the worst outcome in this file.
  reset({ order: {} });
  const empty = await createSquareOrder(draft);
  ok("a 200 with no order id is a failure", empty.ok === false, JSON.stringify(empty));

  // ——— The till's own estimate ———
  reset({
    order: { id: "sq-2", fulfillments: [{ pickup_details: { pickup_at: "2026-08-20T14:27:00Z" } }] },
  });
  const timed = await createSquareOrder(draft);
  ok("Square's own ready time comes back as epoch ms",
     timed.ok === true && timed.readyAt === Date.parse("2026-08-20T14:27:00Z"),
     JSON.stringify(timed));

  reset({ order: { id: "sq-3", fulfillments: [{ pickup_details: { pickup_at: "not a date" } }] } });
  const unreadable = await createSquareOrder(draft);
  ok("an unreadable one is simply absent, and the order still stands",
     unreadable.ok === true && unreadable.readyAt === undefined, JSON.stringify(unreadable));

  // ——— The two handles an update needs ———
  //
  // Square versions an order and gives each fulfillment its own uid. Neither is
  // derivable from the order id, and this response is the only place they come
  // for free, so anything that changes the order later depends on catching them
  // here.
  reset({
    order: { id: "sq-6", version: 1, fulfillments: [{ uid: "uYJmomsp8OjA2iY8PZR2IC" }] },
  });
  const handles = await createSquareOrder(draft);
  ok("the order's version is kept", handles.ok === true && handles.version === 1,
     JSON.stringify(handles));
  ok("and the fulfillment's uid",
     handles.ok === true && handles.fulfillmentUid === "uYJmomsp8OjA2iY8PZR2IC",
     JSON.stringify(handles));

  // A till with no such notion says nothing rather than inventing a zero, which
  // an update would send as a stale version and have refused.
  reset({ order: { id: "sq-7" } });
  const bare = await createSquareOrder(draft);
  ok("and neither is invented when the response has none",
     bare.ok === true && bare.version === undefined && bare.fulfillmentUid === undefined,
     JSON.stringify(bare));

  // ——— Reading an order back ———
  reset({ order: { id: "sq-4", state: "OPEN", fulfillments: [{ state: "PREPARED" }] } });
  const state = await fetchSquareOrder("sq-4");
  ok("the state comes back as the till's own words",
     state?.status === "OPEN" && state?.fulfillment === "PREPARED", JSON.stringify(state));
  ok("read by GET, with the id escaped into the path",
     sentUrl === "https://connect.squareupsandbox.com/v2/orders/sq-4" && sentMethod === "GET",
     `${sentMethod} ${sentUrl}`);

  reset({ order: { id: "sq-5", state: "OPEN" } });
  const noFulfillment = await fetchSquareOrder("sq-5");
  ok("an order with no fulfillment reports null rather than guessing",
     noFulfillment?.fulfillment === null, JSON.stringify(noFulfillment));

  // ——— Counting what is on the counter ———
  //
  // ⚠️ Per counter, not one number for the company. Every entry Square returns
  // carries the location it belongs to, and this used to throw that away — one
  // count for three counters is how a queue at Wilshire showed up on the
  // Western outlet's sheet.
  reset({
    order_entries: [
      { location_id: "L-glendon" },
      { location_id: "L-glendon" },
      { location_id: "L-default" },
    ],
  });
  const shared = await countOpenSquareOrders();
  ok("the open orders are counted", shared?.total === 3, JSON.stringify(shared));
  // ⚠️ The bug this whole change existed to fix, one layer down.
  //
  // Wilshire and Western both fall back to SQUARE_LOCATION_ID here — which is
  // what a deployment looks like before somebody fills in the per-counter
  // names — so Square stamps their tickets with the same id and cannot say
  // which kitchen has which. The first version handed both that location's
  // count and called it an answer, and every sheet showed the same number
  // again.
  //
  // Null, so /api/kitchen-load falls through to this app's own table, which
  // records the counter off the order and does know.
  ok("⚠️ a mapping that cannot tell two counters apart answers null",
     shared?.byCounter === null, JSON.stringify(shared?.byCounter));

  // ——— And when every counter has its own location ———
  //
  // ⚠️ Every one of them, which is what "splittable" means. A fifth counter
  // opened with no variable set, so it shared L-default with the fourth and the
  // whole answer went back to null — the mapping could no longer tell two
  // counters apart, exactly as the assertion above describes. Opening a shop
  // adds a variable to this list as well as to the deploy.
  process.env.SQUARE_LOCATION_WILSHIRE = "L-wilshire";
  process.env.SQUARE_LOCATION_LARCHMONT = "L-larchmont";
  process.env.SQUARE_LOCATION_VENTURA = "L-ventura";
  process.env.SQUARE_LOCATION_PASADENA = "L-pasadena";
  process.env.SQUARE_LOCATION_FULLERTON = "L-fullerton";
  reset({
    order_entries: [
      { location_id: "L-glendon" },
      { location_id: "L-glendon" },
      { location_id: "L-wilshire" },
    ],
  });
  const open = await countOpenSquareOrders();
  ok("with a location each, the count is split by counter",
     open?.byCounter?.glendon === 2 && open?.byCounter?.wilshire === 1,
     JSON.stringify(open?.byCounter));
  // A counter with nothing on the rail has to be a zero. Leaving it out would
  // render as "we cannot say", and quiet is not the same as unknown.
  //
  // ⚠️ Ventura rather than Western. The quiet counter used to be the Koreatown
  // Outlet, and the shop paused it, so it is not one of the counters Square is
  // asked about any more. Any open counter with nothing on the rail does the
  // job — what is being checked is that zero is reported rather than omitted.
  ok("a quiet counter is a zero rather than missing",
     open?.byCounter?.ventura === 0, JSON.stringify(open?.byCounter));
  // Sorted, because which order LOCATIONS happens to be declared in is not
  // something this assertion is about.
  ok("and every counter's location is searched",
     JSON.stringify([...(wire().location_ids as string[])].sort()) ===
       JSON.stringify(["L-fullerton", "L-glendon", "L-larchmont", "L-pasadena", "L-ventura", "L-wilshire"]),
     JSON.stringify(wire().location_ids));

  // An entry Square declines to attribute is counted in the total and against
  // no counter — inventing one would put somebody else's ticket on this rail.
  reset({ order_entries: [{ location_id: "L-glendon" }, {}] });
  const orphan = await countOpenSquareOrders();
  ok("an entry with no location still counts toward the whole",
     orphan?.total === 2, JSON.stringify(orphan));
  ok("but is not assigned to a counter",
     orphan?.byCounter?.glendon === 1 && orphan?.byCounter?.wilshire === 0,
     JSON.stringify(orphan?.byCounter));

  // Back to the shared-location shape for the assertions below, which are
  // about the request rather than the split.
  delete process.env.SQUARE_LOCATION_WILSHIRE;
  delete process.env.SQUARE_LOCATION_LARCHMONT;
  delete process.env.SQUARE_LOCATION_VENTURA;
  delete process.env.SQUARE_LOCATION_PASADENA;
  delete process.env.SQUARE_LOCATION_FULLERTON;
  reset({ order_entries: [{ location_id: "L-glendon" }] });
  await countOpenSquareOrders();
  const filter = ((wire().query as Wire)?.filter ?? {}) as Wire;
  ok("only OPEN orders are asked for",
     JSON.stringify((filter.state_filter as Wire)?.states) === JSON.stringify(["OPEN"]),
     JSON.stringify(filter.state_filter));
  ok("and only ones nobody has handed over yet",
     JSON.stringify((filter.fulfillment_filter as Wire)?.fulfillment_states) ===
       JSON.stringify(["PROPOSED", "RESERVED", "PREPARED"]),
     JSON.stringify(filter.fulfillment_filter));
  // Three counters, two distinct Square locations: glendon is mapped, the
  // other two fall back to the default. Asking about one location would
  // undercount a shop with three tills.
  ok("every counter's location is searched, deduplicated",
     JSON.stringify(wire().location_ids) === JSON.stringify(["L-default", "L-glendon"]),
     JSON.stringify(wire().location_ids));

  // ⚠️ Null and zero are different answers. A confident zero tells the next
  // customer the kitchen is empty on the morning Square is down.
  reset({ errors: [{ code: "UNAUTHORIZED" }] }, 401);
  const unknown = await countOpenSquareOrders();
  ok("a failed count is null and never zero", unknown === null, String(unknown));

  // ——— Attaching the courier afterwards ———
  //
  // The bag is booked after the order exists, so this is the second call that
  // makes Square's copy and Uber's copy point at each other.
  const forDelivery = {
    ...draft,
    diningOption: "delivery" as const,
    deliveryAddress: "123 S Main St, Los Angeles, CA 90013",
    courier: { provider: "Uber Direct", supportPhone: "8005550199" },
  };
  reset({ order: { id: "sq-8", version: 2 } });
  const attached = await attachSquareCourier(
    forDelivery,
    { orderId: "sq-8", version: 1, fulfillmentUid: "F-1" },
    "uber-del-77",
  );
  ok("the courier is attached", attached === true, String(attached));
  ok("by PUT to the order's own URL",
     sentUrl === "https://connect.squareupsandbox.com/v2/orders/sq-8", sentUrl);
  // The path alone does not say this is an update. POST to the same URL is a
  // different request, and asserting only the path let that through once.
  ok("as an update, not another create", sentMethod === "PUT", sentMethod);
  ok("naming the version it expects, so a counter's edit is not overwritten",
     order().version === 1, String(order().version));
  ok("and the fulfillment by uid, not by position", first().uid === "F-1", String(first().uid));
  ok("the courier's id is on it", delivery().external_delivery_id === "uber-del-77",
     String(delivery().external_delivery_id));

  // ⚠️ The whole fulfillment goes up, not a patch of it. Square's example shows
  // an unnamed sibling *object* surviving an update; it does not say whether a
  // nested object inside a named one merges or replaces. Sending everything
  // makes that question moot, and a partial that turned out to replace would
  // strip the recipient and the schedule off a live delivery.
  ok("the recipient rides along rather than being left to merge",
     ((delivery().recipient ?? {}) as Wire).display_name === "Ada Lovelace",
     JSON.stringify(delivery().recipient));
  ok("so does the courier declaration", delivery().managed_delivery === true,
     String(delivery().managed_delivery));
  ok("and the schedule", delivery().schedule_type === "ASAP",
     String(delivery().schedule_type));
  ok("with an idempotency key tied to this order and this delivery",
     wire().idempotency_key === "courier-sq-8-uber-del-77", String(wire().idempotency_key));

  // Nothing to update against, so nothing is sent. Guessing a version is how
  // you overwrite somebody else's edit.
  reset();
  ok("no version means no call", (await attachSquareCourier(
       forDelivery, { orderId: "sq-8", fulfillmentUid: "F-1" }, "uber-del-77")) === false);
  ok("and none was made", sentUrl === "", sentUrl);
  reset();
  ok("no fulfillment uid means no call either", (await attachSquareCourier(
       forDelivery, { orderId: "sq-8", version: 1 }, "uber-del-77")) === false);
  ok("still nothing sent", sentUrl === "", sentUrl);

  // A pickup has no courier to attach, whatever it is handed.
  reset();
  ok("a pickup is never given a courier", (await attachSquareCourier(
       draft, { orderId: "sq-8", version: 1, fulfillmentUid: "F-1" }, "uber-del-77")) === false);
  ok("and nothing was sent for it", sentUrl === "", sentUrl);

  // Square refusing is survivable by construction: the order is placed and the
  // courier is booked before this runs.
  reset({ errors: [{ code: "VERSION_MISMATCH", detail: "stale version" }] }, 409);
  ok("a refused update reports false rather than throwing", (await attachSquareCourier(
       forDelivery, { orderId: "sq-8", version: 1, fulfillmentUid: "F-1" }, "uber-del-77")) === false);

  // ——— And nothing goes anywhere without configuration ———
  delete process.env.SQUARE_ACCESS_TOKEN;
  reset();
  const unconfigured = await createSquareOrder(draft);
  ok("no token, no order", unconfigured.ok === false, JSON.stringify(unconfigured));
  ok("and nothing was sent", sentUrl === "", sentUrl);
  process.env.SQUARE_ACCESS_TOKEN = "token";

  globalThis.fetch = realFetch;
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
