import "server-only";

import { LOCATIONS } from "./(marketing)/locations/locations";
import { PREP_MINUTES } from "./shopFacts";
import { TAX_RATE } from "./shop/money";
import type { OpenOrderCount, PosOrderDraft, PosOrderResult, PosOrderState } from "./pos";

// Square, as the till.
//
// ——— Why raw fetch and not the SDK ———
//
// Every other integration in this app is hand-written against the wire: Toast,
// Uber Direct, Google Maps, Resend. They all needed the same two things an SDK
// hides — an error message a human can act on, and control over exactly what is
// sent — and a fifth vendor client in the bundle to make five calls is a poor
// trade. The shapes below were taken from Square's own TypeScript types rather
// than from prose, so they are the SDK's shapes without the SDK.
//
// ⚠️ The SDK's types are camelCase; the wire is snake_case. `locationId` in the
// SDK is `location_id` in JSON. Everything below is written in wire form, which
// is why it looks unlike the rest of this codebase.
//
// ——— Pinned to a version ———
//
// Square dates its API and serves whatever version the request asks for. An
// unpinned integration is one that changes behaviour on Square's release
// schedule rather than on ours, which is how a working checkout breaks on a
// morning nobody deployed.
//
// ——— What is not here yet ———
//
// Payments live next door in app/squarePayments.ts, on the same credentials.
// Kept out of this file because the till and the processor fail differently and
// are read by different people: an order that does not reach the kitchen is one
// problem, a charge that does not go through is another, and a card number is a
// liability neither of them should be near.
//
// Couriers. Square records a delivery; it does not dispatch one. There is no
// endpoint here that books a driver, and `managed_delivery` is a declaration
// that somebody else is carrying the bag rather than a request that Square
// find somebody. Square's own on-demand delivery — DoorDash Drive, or Nash
// picking a local courier — belongs to Square Online, their hosted storefront,
// and is not reachable from an app driving the Orders API. Uber Direct stays
// ours. What this file can do is tell Square who the courier is, so the
// counter's screen has a provider and a number to call.
//
// Catalog. products.ts stays the source of truth — it carries allergens, option
// groups, mix-and-match packs and ten languages, none of which Square's catalog
// holds well. Lines go up as ad-hoc items with our name and our price. Setting
// `posItemId` on a draft line is what would link them, and it is worth doing
// only once somebody wants Square's own reporting to break out by item.

const API_VERSION = "2026-08-19";

export type SquareConfig = {
  host: string;
  token: string;
  /** The default shop, for a deployment with one Square location or for a
   *  counter that has not been mapped. */
  locationId: string;
};

/** Sandbox unless told otherwise.
 *
 *  ⚠️ The safe default on purpose. A missing SQUARE_ENV should send orders to a
 *  sandbox nobody collects from, not to a real till in front of real staff. */
function host(): string {
  return process.env.SQUARE_ENV?.trim().toLowerCase() === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

export function squareConfig(): SquareConfig | null {
  const token = process.env.SQUARE_ACCESS_TOKEN?.trim();
  const locationId = process.env.SQUARE_LOCATION_ID?.trim();
  if (!token || !locationId) return null;
  return { host: host(), token, locationId };
}

export function isSquareConfigured(): boolean {
  return squareConfig() !== null;
}

/** Which Square location a counter is.
 *
 *  Square keys everything on its own location ids, and ours are words. The map
 *  is environment rather than code because the ids differ between the sandbox
 *  and the real account, and a value that differs per deployment is a value
 *  that belongs in the deployment.
 *
 *  SQUARE_LOCATION_WILSHIRE, SQUARE_LOCATION_LARCHMONT, SQUARE_LOCATION_GLENDON,
 *  SQUARE_LOCATION_VENTURA, SQUARE_LOCATION_WESTERN — the counter's id,
 *  uppercased. Anything unmapped falls back to SQUARE_LOCATION_ID, which is
 *  right for a shop with one Square location and visible in the log when it is
 *  not.
 *
 *  ⚠️ The names come from the ids in locations.ts, so opening a counter needs a
 *  matching variable on the deploy and closing one leaves a variable behind.
 *  LARCHMONT, GLENDON and VENTURA are new and unset until somebody adds them;
 *  until then those counters' takings are filed against SQUARE_LOCATION_ID and
 *  Square's per-location reporting attributes five shops to one. The warning
 *  below says so once per counter.
 *
 *  SQUARE_LOCATION_FIGUEROA is read by nothing now that the USC store has
 *  closed. It is inert rather than harmful — this function only ever looks up
 *  the ids it is given — but it should come off the deploy, and Square's own
 *  location for that store should be deactivated in the dashboard so it stops
 *  showing up in reporting as a counter with no sales. */
/** The sales tax rate at one of our counters, as a fraction.
 *
 *  Looked up rather than passed, because the draft carries the counter id and
 *  not the record. An unknown counter — including undefined, which is what a
 *  draft from a deployment with one location looks like — is the shop's usual
 *  rate, which is the same fallback taxFor() makes. */
function counterTaxRate(counter: string | undefined): number {
  if (!counter) return TAX_RATE;
  return LOCATIONS.find((store) => store.id === counter)?.taxRate ?? TAX_RATE;
}

export function squareLocationFor(counter: string | undefined): string | null {
  const config = squareConfig();
  if (!config) return null;
  if (!counter) return config.locationId;
  const named = process.env[`SQUARE_LOCATION_${counter.toUpperCase()}`]?.trim();
  if (named) return named;
  if (LOCATIONS.some((store) => store.id === counter) && !warned.has(counter)) {
    // ⚠️ Once per counter, not once per call.
    //
    // This is read on every order and three times on every kitchen-load poll,
    // so warning each time produced a steady drip of three identical lines a
    // minute. That is not diligence, it is a log nobody can read — and the cost
    // showed up exactly when it mattered, with a real FORBIDDEN from Square
    // buried among dozens of copies of a configuration note.
    //
    // A standing condition deserves one line. Something that has changed
    // deserves a new one.
    warned.add(counter);
    console.warn(
      `[square] no SQUARE_LOCATION_${counter.toUpperCase()} for the ${counter} counter;` +
        ` its orders are going to SQUARE_LOCATION_ID. Square's own per-location` +
        ` reporting will file them under the wrong shop until this is set.`,
    );
  }
  return config.locationId;
}

/** Counters whose missing mapping has already been mentioned. Per process, and
 *  so reset by a deploy — which is when somebody is most likely to be reading. */
const warned = new Set<string>();

export function headers(config: SquareConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.token}`,
    "Square-Version": API_VERSION,
  };
}

/** What went wrong, from the body rather than the status code.
 *
 *  Square returns an `errors` array with a machine-readable `code` and a
 *  `detail` written for a developer. Both are worth surfacing: the code is what
 *  you search for, the detail is usually the actual answer. The status alone
 *  says almost nothing — a bad token and a malformed order are both 401/400
 *  shaped and lead to very different afternoons. */
export function explainSquare(status: number, detail: string): string {
  try {
    const body = JSON.parse(detail) as {
      errors?: { code?: string; detail?: string; field?: string }[];
    };
    const first = body.errors?.[0];
    if (first) {
      return (
        `${first.code ?? status}: ${first.detail ?? "no detail"}` +
        (first.field ? ` (field: ${first.field})` : "")
      );
    }
  } catch {
    // Not JSON, which is itself worth knowing.
  }
  if (status === 401) return "401: the access token was rejected.";
  return `${status}: ${detail.slice(0, 200)}`;
}

/** An ISO 8601 duration, which is what Square wants for prep and windows.
 *
 *  Written the long way — P0DT0H12M0S rather than PT12M — because that is the
 *  form Square's own examples use and the short form is one more thing to
 *  discover is unsupported at the worst moment. */
function duration(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  return `P0DT${Math.floor(whole / 60)}H${whole % 60}M0S`;
}

type SquareOrderResponse = {
  order?: {
    id?: string;
    state?: string;
    /** Square's optimistic-concurrency counter. An update that names a stale
     *  version is refused rather than silently overwriting somebody else's
     *  change, which on a live till is the counter's own edit. */
    version?: number;
    fulfillments?: {
      /** Square's handle for this fulfillment within the order. An update
       *  addresses a fulfillment by this, not by position. */
      uid?: string;
      state?: string;
      pickup_details?: { pickup_at?: string };
      delivery_details?: { deliver_at?: string };
    }[];
  };
};

export async function createSquareOrder(draft: PosOrderDraft): Promise<PosOrderResult> {
  const config = squareConfig();
  if (!config) return { ok: false, reason: "not-configured" };
  const locationId = squareLocationFor(draft.counter);
  if (!locationId) return { ok: false, reason: "no-location" };
  const fulfillment = fulfillmentFor(draft);

  const body = {
    // Square's own guard against a retried request becoming two orders. Ours is
    // the order's reference where there is one, which makes the guarantee ours
    // rather than a matter of how the network behaved.
    idempotency_key: (draft.reference ?? `cb-${Date.now()}-${Math.random()}`).slice(0, 192),
    order: {
      location_id: locationId,
      ...(draft.reference ? { reference_id: draft.reference.slice(0, 40) } : {}),
      source: { name: "Corner Bagel" },
      // What the order is called in the list of open tickets. A name, because
      // that is what somebody calling out an order needs — with the scheduled
      // time in front of it, because "is this one for now?" is the question
      // that has to be answerable without opening the ticket.
      //
      // 30 characters is Square's limit, and it is short enough that the order
      // of these two matters: the time survives the truncation, the surname
      // does not.
      ticket_name: ticketName(recipientFor(draft).display_name, draft.promisedAt),
      // ⚠️ Without this an order reaches Square as a bare sale with no pickup
      // and no delivery on it — it appears in reporting and never appears on
      // anybody's screen as something to make. Square allows at most one
      // fulfillment per order created through the API, which is why this is a
      // single-element array rather than a list.
      fulfillments: [fulfillment],
      // ——— Tax, because an order without it is the wrong number ———
      //
      // The first real order landed in Square reading $3.75 on a basket the
      // customer is charged $4.11 for: total_tax_money 0, because nothing here
      // ever mentioned tax. The ticket understated it, and so did every report
      // built on it.
      //
      // Sent as a rate rather than an amount so Square arrives at the figure
      // itself and the two cannot drift by a rounding cent. ORDER scope spreads
      // it across the lines the way a receipt shows it, and ADDITIVE means it is
      // added on top rather than assumed to be inside the prices — which is what
      // is true here: app/shop/money.ts computes tax on the subtotal.
      taxes: [
        {
          uid: "cb-tax",
          name: "Sales tax",
          // ⚠️ The counter's rate, not the shop's usual one. Square prints this
          // on the customer's receipt and files it in the shop's own tax
          // reporting, so a ticket from Pasadena stamped with the county rate
          // is wrong in two places at once — on paper in somebody's hand, and
          // in the numbers the shop remits from. `counter` is our location id;
          // a counter with no rate of its own falls back to TAX_RATE, which is
          // every counter but one. See `taxRate` in locations.ts.
          percentage: ((counterTaxRate(draft.counter) * 100))
            .toFixed(4)
            .replace(/0+$/, "")
            .replace(/\.$/, ""),
          scope: "ORDER",
          type: "ADDITIVE",
        },
      ],
      // The courier's fee, when the customer is paying one. A service charge
      // rather than a line item: it is not something the kitchen makes, and a
      // fourth "item" on a ticket for a bag of two bagels reads as a mistake.
      //
      // ⚠️ Taxable false. The tax above is computed on food in
      // app/shop/money.ts, and letting Square tax the delivery fee as well
      // would charge more than the customer was shown.
      ...(draft.deliveryCents && draft.deliveryCents > 0
        ? {
            service_charges: [
              {
                uid: "cb-delivery",
                name: "Delivery",
                amount_money: { amount: draft.deliveryCents, currency: "USD" },
                calculation_phase: "TOTAL_PHASE",
                taxable: false,
              },
            ],
          }
        : {}),
      line_items: draft.items.map((item) => ({
        // Quantity is a *string* in Square, and a number here is a 400 that
        // reads like a schema complaint about something else entirely.
        quantity: String(item.quantity),
        ...(item.posItemId
          ? { catalog_object_id: item.posItemId }
          : // An ad-hoc line: Square takes the name and the price as given.
            // See the note at the top about why the catalog stays ours.
            {
              name: item.name,
              base_price_money: { amount: item.unitCents, currency: "USD" },
            }),
        // The choices ride in the note rather than as modifiers. An ad-hoc
        // modifier without a catalog object is the kind of thing that is
        // accepted in one API version and refused in the next, and a bagel
        // arriving without its spread because a modifier was silently dropped
        // is worse than a line of text the counter can read.
        ...(item.modifiers.length > 0
          ? { note: item.modifiers.join(", ").slice(0, 500) }
          : {}),
      })),
    },
  };

  return await postOrder(config, body);
}

/** Everything the till needs to know about the customer. */
function recipientFor(draft: PosOrderDraft) {
  const [firstName, ...rest] = [draft.customer.firstName, draft.customer.lastName]
    .filter(Boolean)
    .join(" ")
    .split(/\s+/);
  return {
    display_name: [firstName, ...rest].join(" ").trim() || "Customer",
    ...(draft.customer.phone ? { phone_number: draft.customer.phone } : {}),
    ...(draft.customer.email ? { email_address: draft.customer.email } : {}),
  };
}

/** The order's one fulfillment: who it is for, when, and how it leaves.
 *
 *  ⚠️ Built in one place and rebuilt whole rather than patched, because an
 *  update to a fulfillment addresses it by uid and Square does not document
 *  whether a nested object inside it merges or replaces. Sending the complete
 *  object makes that question moot: either behaviour lands on the same result.
 *  A partial `delivery_details` that turned out to replace would silently drop
 *  the recipient, the schedule and the courier from a live delivery. */
function fulfillmentFor(
  draft: PosOrderDraft,
  extra: { uid?: string; externalDeliveryId?: string } = {},
) {
  // The ticket carries what Square has no field for: curbside, utensils, the
  // customer's note, and — first, in capitals — a scheduled time. It prints on
  // the ticket, which is where the person making the order will read it.
  const notes = [
    draft.promisedAt ? `FOR ${scheduledLabel(draft.promisedAt)}` : null,
    draft.diningOption === "curbside" ? "CURBSIDE" : null,
    draft.utensils ? "Utensils" : null,
    draft.note,
  ]
    .filter(Boolean)
    .join(" · ");

  const recipient = recipientFor(draft);

  // ASAP unless the order is scheduled. Square computes an ASAP pickup_at from
  // prep_time_duration, which is why the prep time is sent rather than a time:
  // it lets Square's own answer to "when is this ready" be the one shown, the
  // same way Toast's estimatedFulfillmentDate was.
  const scheduled = draft.promisedAt !== undefined;
  return draft.diningOption === "delivery"
      ? {
          // Present only on an update, where it says which fulfillment this is.
          // Sending one at creation would be naming something that does not
          // exist yet.
          ...(extra.uid ? { uid: extra.uid } : {}),
          type: "DELIVERY",
          state: "PROPOSED",
          delivery_details: {
            recipient: {
              ...recipient,
              ...(draft.deliveryAddress
                ? { address: { address_line_1: draft.deliveryAddress } }
                : {}),
            },
            schedule_type: scheduled ? "SCHEDULED" : "ASAP",
            ...(scheduled ? { deliver_at: draft.promisedAt!.toISOString() } : {}),
            prep_time_duration: duration(PREP_MINUTES),
            // ⚠️ This field reads backwards from the obvious guess, and the
            // obvious guess is what this code shipped with.
            //
            // `managed_delivery` does not ask Square to arrange a courier.
            // Square's own type calls it "the flag to indicate the delivery is
            // managed by a third party (ie DoorDash), which means we may not
            // receive all recipient information for PII purposes" — it is how
            // you *declare* that somebody else is carrying the bag, and it is
            // why `courier_provider_name` and `courier_support_phone_number`
            // are the fields that come with it. Square has no endpoint that
            // dispatches a courier at all.
            //
            // So true is the honest answer for this shop: Uber Direct carries
            // it. False said the shop drives its own deliveries, which put a
            // wrong description of every delivery order onto the till.
            //
            // Only when there is a courier to name, though. Square documents
            // the provider and the support number as required alongside a true
            // here, and a 400 on every delivery order is a worse failure than
            // an imprecise flag — so an unconfigured courier keeps the old
            // value and the checkout keeps working.
            ...(draft.courier
              ? {
                  managed_delivery: true,
                  courier_provider_name: draft.courier.provider,
                  courier_support_phone_number: draft.courier.supportPhone,
                }
              : { managed_delivery: false }),
            // The courier's own id for the job. Only ever present on an update,
            // because the bag is booked after the order is created — see
            // attachSquareCourier below.
            ...(extra.externalDeliveryId
              ? { external_delivery_id: extra.externalDeliveryId }
              : {}),
            ...(notes ? { note: notes.slice(0, 500) } : {}),
          },
        }
      : {
          ...(extra.uid ? { uid: extra.uid } : {}),
          type: "PICKUP",
          state: "PROPOSED",
          pickup_details: {
            recipient,
            schedule_type: scheduled ? "SCHEDULED" : "ASAP",
            ...(scheduled ? { pickup_at: draft.promisedAt!.toISOString() } : {}),
            prep_time_duration: duration(PREP_MINUTES),
            is_curbside_pickup: draft.diningOption === "curbside",
            ...(notes ? { note: notes.slice(0, 500) } : {}),
          },
        };
}

/** POST or PUT an order body, and read the result the same way for both.
 *
 *  Shared because an update answers with exactly the shape a create does — the
 *  whole order, at its new version — so the caller of either wants the same
 *  four things out of it. */
async function postOrder(
  config: SquareConfig,
  body: unknown,
  path = "/v2/orders",
  method: "POST" | "PUT" = "POST",
): Promise<PosOrderResult> {
  let response: Response;
  try {
    response = await fetch(`${config.host}${path}`, {
      method,
      headers: headers(config),
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (networkError) {
    return {
      ok: false,
      reason: `network: ${networkError instanceof Error ? networkError.message : "unknown"}`,
    };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { ok: false, reason: explainSquare(response.status, detail) };
  }

  const parsed = (await response.json().catch(() => null)) as SquareOrderResponse | null;
  const order = parsed?.order;
  if (!order?.id) return { ok: false, reason: "no-order-id-in-response" };

  // Square's own answer to "when will this be ready", from the fulfillment it
  // just computed. Absent when it did not give one, and everything downstream
  // falls back to the constant it used before.
  const at =
    order.fulfillments?.[0]?.pickup_details?.pickup_at ??
    order.fulfillments?.[0]?.delivery_details?.deliver_at;
  const readyAt = at ? Date.parse(at) : NaN;

  return {
    ok: true,
    orderId: order.id,
    ...(Number.isNaN(readyAt) ? {} : { readyAt }),
    // Kept so this order can be changed later without reading it back first.
    // The courier's id is the case in view: the bag is booked after this call
    // returns, so `external_delivery_id` cannot be set at creation and has to
    // be written afterwards, and an update needs the version to be allowed and
    // the fulfillment's uid to know what to change.
    ...(typeof order.version === "number" ? { version: order.version } : {}),
    ...(typeof order.fulfillments?.[0]?.uid === "string"
      ? { fulfillmentUid: order.fulfillments[0].uid }
      : {}),
  };
}

/** Write the courier's own id onto Square's copy of a delivery order.
 *
 *  ——— Why this is a second call ———
 *
 *  The bag is booked after the order is created: the checkout needs an order
 *  before it has a courier, so `external_delivery_id` cannot be set at
 *  creation. This is the call that closes the loop, and after it Square's
 *  record and Uber's point at each other.
 *
 *  ——— Why it sends the whole fulfillment ———
 *
 *  An update names an object by `uid` and leaves unnamed objects alone —
 *  Square's own example patches one line item and the order's other line
 *  survives untouched. What that example does not settle is whether a nested
 *  object *inside* a named one merges or replaces. Sending the complete
 *  fulfillment makes the question moot, because both behaviours land on the
 *  same result. A partial `delivery_details` that turned out to replace would
 *  quietly drop the recipient, the schedule and the courier from a live
 *  delivery, and it would do it on exactly the orders somebody is waiting on.
 *
 *  ——— Best effort, and it has to stay that way ———
 *
 *  This runs after the customer has their confirmation and after the courier is
 *  booked. Nothing about the order depends on it. A failure is logged and
 *  nothing else: no throw, no retry, no effect on what anybody was told. The
 *  version comes from the create response, so a counter that edited the ticket
 *  in the seconds in between makes Square refuse this — which is the correct
 *  outcome, and is why it is logged rather than forced. */
export async function attachSquareCourier(
  draft: PosOrderDraft,
  placed: { orderId: string; version?: number; fulfillmentUid?: string },
  deliveryId: string,
): Promise<boolean> {
  const config = squareConfig();
  // Without a version there is nothing to send that Square will accept, and
  // without a uid there is nothing to name. Both come from the create response.
  if (!config || placed.version === undefined || !placed.fulfillmentUid) return false;
  if (draft.diningOption !== "delivery") return false;

  const result = await postOrder(
    config,
    {
      idempotency_key: `courier-${placed.orderId}-${deliveryId}`.slice(0, 192),
      order: {
        version: placed.version,
        fulfillments: [
          fulfillmentFor(draft, {
            uid: placed.fulfillmentUid,
            externalDeliveryId: deliveryId,
          }),
        ],
      },
    },
    `/v2/orders/${encodeURIComponent(placed.orderId)}`,
    "PUT",
  );

  if (!result.ok) {
    console.error(
      `[square] could not attach courier ${deliveryId} to order ${placed.orderId}:` +
        ` ${result.reason}. The order stands; Square's copy simply does not name` +
        ` the delivery job.`,
    );
    return false;
  }
  return true;
}

/** What Square currently thinks of an order. */
export async function fetchSquareOrder(id: string): Promise<PosOrderState | null> {
  const config = squareConfig();
  if (!config) return null;

  const response = await fetch(
    `${config.host}/v2/orders/${encodeURIComponent(id)}`,
    { headers: headers(config), cache: "no-store" },
  ).catch(() => null);
  if (!response || !response.ok) return null;

  const parsed = (await response.json().catch(() => null)) as SquareOrderResponse | null;
  const order = parsed?.order;
  if (!order?.id) return null;

  return {
    id: order.id,
    status: order.state ?? null,
    fulfillment: order.fulfillments?.[0]?.state ?? null,
  };
}

/** How many orders the kitchen has open.
 *
 *  ⚠️ A floor rather than a count when it hits the cap. Square's search is
 *  paged, this asks for one page, and a shop with more than LIMIT open orders
 *  gets LIMIT — which is a number that says "very busy" and is not a lie about
 *  the queue, but is not the queue either. Worth paging the day this shop can
 *  have two hundred tickets open at once. */
const LIMIT = 200;

/** The last reason the count failed, so a standing fault is said once. */
let lastCountFailure: string | null = null;

/** Notes about the configuration that are true on every request.
 *
 *  Said once per process rather than on every kitchen-load poll, which is
 *  three times a minute all day — a standing condition logged that often is a
 *  log nobody reads. */
const said = new Set<string>();
function sayOnce(message: string): void {
  if (said.has(message)) return;
  said.add(message);
  console.warn(`[square] ${message}`);
}

export async function countOpenSquareOrders(): Promise<OpenOrderCount | null> {
  const config = squareConfig();
  if (!config) return null;

  // Every counter's Square location, because the question is how busy the
  // kitchen is and a shop with three tills has three sets of tickets.
  //
  // ⚠️ Kept as a pairing rather than flattened to a list of ids. The answer
  // comes back keyed by Square's location id and has to be turned back into
  // counters, and two counters can legitimately share a location on a
  // deployment that has only set SQUARE_LOCATION_ID — see the fold below.
  const mapped = LOCATIONS.map((store) => ({
    counter: store.id,
    locationId: squareLocationFor(store.id),
  })).filter((pair): pair is { counter: string; locationId: string } =>
    typeof pair.locationId === "string",
  );
  const locations = [...new Set(mapped.map((pair) => pair.locationId))];

  const response = await fetch(`${config.host}/v2/orders/search`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({
      location_ids: locations,
      limit: LIMIT,
      // Entries rather than whole orders: this counts them, it does not read
      // them, and a hundred full orders is a hundred times the payload for a
      // number.
      return_entries: true,
      query: {
        filter: {
          state_filter: { states: ["OPEN"] },
          // Open *and* not yet handed over. An order sitting OPEN because it
          // is awaiting payment is not work on the counter.
          fulfillment_filter: {
            fulfillment_states: ["PROPOSED", "RESERVED", "PREPARED"],
          },
        },
      },
    }),
    cache: "no-store",
  }).catch(() => null);

  if (!response || !response.ok) {
    if (response) {
      const detail = await response.text().catch(() => "");
      const why = explainSquare(response.status, detail);
      // The same reasoning as the counter warning above, with one difference:
      // the *reason* is remembered rather than the fact. A standing FORBIDDEN
      // says itself once; the same call starting to fail differently is news
      // and gets its own line.
      if (lastCountFailure !== why) {
        lastCountFailure = why;
        console.error(
          `[square] could not count open orders: ${why}.` +
            " The busyness line falls back to our own queue; this repeats" +
            " silently until it changes.",
        );
      }
    }
    return null;
  }
  lastCountFailure = null;

  const parsed = (await response.json().catch(() => null)) as {
    order_entries?: { location_id?: string | null }[];
  } | null;
  if (!parsed) return null;
  const entries = parsed.order_entries ?? [];

  // ⚠️ Every entry carries the location it belongs to, and this used to throw
  // that away and return a length. One number for three counters is what made
  // a queue at Wilshire show up on the Western outlet's sheet.
  const perLocation = new Map<string, number>();
  for (const entry of entries) {
    const id = entry.location_id;
    if (typeof id !== "string") continue;
    perLocation.set(id, (perLocation.get(id) ?? 0) + 1);
  }

  // ——— ⚠️ Whether Square can tell these counters apart at all ———
  //
  // Only when each counter has a Square location of its own. Two counters
  // sharing one location means Square stamps both their tickets with the same
  // id, and there is no way to say which kitchen a ticket is in.
  //
  // The first version of this handed both counters that shared location's
  // count and called it honest. It is not: it is the original bug wearing a
  // per-counter shape. A deployment with only SQUARE_LOCATION_ID set — which
  // is what a shop looks like before somebody fills in the per-counter names —
  // has every counter on one location, so every sheet showed the same number
  // again and the whole change did nothing.
  //
  // And "Square cannot say" is not "nobody can". Our own table records the
  // counter off the order itself and knows exactly which kitchen has it. So
  // this returns null and lets /api/kitchen-load fall through to the source
  // that can answer, rather than handing back a number that cannot.
  const splittable = new Set(mapped.map((pair) => pair.locationId)).size === mapped.length;
  if (!splittable) {
    sayOnce(
      "counters share a Square location, so Square cannot say which kitchen a" +
        " ticket is in. The per-counter queue comes from this app's own table" +
        " instead. Set SQUARE_LOCATION_WILSHIRE and the rest to have Square" +
        " split it.",
    );
    return { total: entries.length, byCounter: null };
  }

  // Folded back onto counters. A counter with no tickets gets a zero rather
  // than being left out: absent has to mean "we cannot say", and a quiet
  // counter is not that.
  const byCounter: Record<string, number> = {};
  for (const pair of mapped) {
    byCounter[pair.counter] = perLocation.get(pair.locationId) ?? 0;
  }

  return { total: entries.length, byCounter };
}

/** Whether Square answers at all, for the status page. */
export async function squareReachable(): Promise<{ ok: true } | { ok: false; why: string }> {
  const config = squareConfig();
  if (!config) return { ok: false, why: "Square is not configured." };
  const response = await fetch(`${config.host}/v2/locations`, {
    headers: headers(config),
    cache: "no-store",
  }).catch(() => null);
  if (!response) return { ok: false, why: "Square could not be reached." };
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { ok: false, why: explainSquare(response.status, detail) };
  }

  // ——— Answering is not the same as being usable ———
  //
  // This used to stop above: Square replied, so Square was fine. That passed
  // happily while every single checkout failed with
  //
  //   Not authorized to take payments with location_id=…
  //
  // which is a property of the location rather than of the connection. A Square
  // location only takes cards when its capabilities include
  // CREDIT_CARD_PROCESSING, and a location created by hand — in the sandbox or
  // otherwise — often does not have it. The credentials are right, the API is
  // reachable, the id exists, and the money still cannot move.
  //
  // So the reply is read rather than counted. The point of this endpoint is to
  // answer "will an order work right now", and the only place that question can
  // be settled cheaply is here, before somebody's card is involved.
  const parsed = (await response.json().catch(() => null)) as {
    locations?: {
      id?: string;
      name?: string;
      status?: string;
      currency?: string;
      capabilities?: string[];
    }[];
  } | null;
  const locations = parsed?.locations ?? [];
  const here = locations.find((location) => location.id === config.locationId);

  if (!here) {
    const known = locations.map((l) => l.id).filter(Boolean).join(", ") || "none";
    return {
      ok: false,
      why:
        `SQUARE_LOCATION_ID is ${config.locationId}, which this token cannot see.` +
        ` Locations it can: ${known}.`,
    };
  }
  if (here.status && here.status !== "ACTIVE") {
    return { ok: false, why: `The ${here.name ?? config.locationId} location is ${here.status}.` };
  }
  if (here.capabilities && !here.capabilities.includes("CREDIT_CARD_PROCESSING")) {
    return {
      ok: false,
      why:
        `The ${here.name ?? config.locationId} location cannot take card payments` +
        ` (capabilities: ${here.capabilities.join(", ") || "none"}). Orders will reach` +
        ` the kitchen; every charge will be refused. Pick a location whose` +
        ` capabilities include CREDIT_CARD_PROCESSING.`,
    };
  }
  // We charge in dollars and say so in every request, so a location keeping its
  // books in anything else refuses each one on a mismatch nobody would guess
  // from the message.
  if (here.currency && here.currency !== "USD") {
    return {
      ok: false,
      why: `The ${here.name ?? config.locationId} location is in ${here.currency}; this app charges USD.`,
    };
  }
  return { ok: true };
}

/** The open ticket's label: who it is for, and when it is for when that is not
 *  now. Capped at Square's 30 characters here rather than at the call site so
 *  the cap and the ordering that depends on it stay in one place. */
function ticketName(name: string, promisedAt: Date | undefined): string {
  const parts = promisedAt ? [`FOR ${scheduledLabel(promisedAt)}`, name] : [name];
  return parts.join(" · ").slice(0, 30);
}

/** A scheduled time as the counter reads it: shop time, English, and short
 *  enough to survive a ticket header. Not translated — this prints in the
 *  kitchen, not on the customer's phone. */
function scheduledLabel(at: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}
