import "server-only";

import { LOCATIONS } from "./(marketing)/locations/locations";
import { PREP_MINUTES } from "./shopFacts";
import type { PosOrderDraft, PosOrderResult, PosOrderState } from "./pos";

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
// Payments. Square is a processor as well as a till, and this app charges
// nobody today: the checkout collects a card brand and last four, and the money
// moves at the counter. Wiring the Web Payments SDK is the obvious next step
// and is deliberately not folded into this change, because it is the first code
// in this app that would move money and it deserves its own testing pass.
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
 *  SQUARE_LOCATION_WILSHIRE, SQUARE_LOCATION_FIGUEROA, SQUARE_LOCATION_WESTERN
 *  — the counter's id, uppercased. Anything unmapped falls back to
 *  SQUARE_LOCATION_ID, which is right for a shop with one Square location and
 *  visible in the log when it is not. */
export function squareLocationFor(counter: string | undefined): string | null {
  const config = squareConfig();
  if (!config) return null;
  if (!counter) return config.locationId;
  const named = process.env[`SQUARE_LOCATION_${counter.toUpperCase()}`]?.trim();
  if (named) return named;
  if (LOCATIONS.some((store) => store.id === counter)) {
    console.warn(
      `[square] no SQUARE_LOCATION_${counter.toUpperCase()} for the ${counter} counter;` +
        ` its orders are going to SQUARE_LOCATION_ID. Square's own per-location` +
        ` reporting will file them under the wrong shop until this is set.`,
    );
  }
  return config.locationId;
}

function headers(config: SquareConfig): Record<string, string> {
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
function explainSquare(status: number, detail: string): string {
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
    fulfillments?: {
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

  const [firstName, ...rest] = [draft.customer.firstName, draft.customer.lastName]
    .filter(Boolean)
    .join(" ")
    .split(/\s+/);
  const recipient = {
    display_name: [firstName, ...rest].join(" ").trim() || "Customer",
    ...(draft.customer.phone ? { phone_number: draft.customer.phone } : {}),
    ...(draft.customer.email ? { email_address: draft.customer.email } : {}),
  };

  // ASAP unless the order is scheduled. Square computes an ASAP pickup_at from
  // prep_time_duration, which is why the prep time is sent rather than a time:
  // it lets Square's own answer to "when is this ready" be the one shown, the
  // same way Toast's estimatedFulfillmentDate was.
  const scheduled = draft.promisedAt !== undefined;
  const fulfillment =
    draft.diningOption === "delivery"
      ? {
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
            // Uber Direct carries the bag, not Square. Saying so is what stops
            // Square offering or expecting to arrange a courier of its own.
            managed_delivery: false,
            ...(notes ? { note: notes.slice(0, 500) } : {}),
          },
        }
      : {
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
      ticket_name: ticketName(recipient.display_name, draft.promisedAt),
      // ⚠️ Without this an order reaches Square as a bare sale with no pickup
      // and no delivery on it — it appears in reporting and never appears on
      // anybody's screen as something to make. Square allows at most one
      // fulfillment per order created through the API, which is why this is a
      // single-element array rather than a list.
      fulfillments: [fulfillment],
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

  let response: Response;
  try {
    response = await fetch(`${config.host}/v2/orders`, {
      method: "POST",
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
  };
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

export async function countOpenSquareOrders(): Promise<number | null> {
  const config = squareConfig();
  if (!config) return null;

  // Every counter's Square location, because the question is how busy the
  // kitchen is and a shop with three tills has three sets of tickets.
  const locations = [
    ...new Set(
      LOCATIONS.map((store) => squareLocationFor(store.id)).filter(
        (id): id is string => typeof id === "string",
      ),
    ),
  ];

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
      console.error(`[square] could not count open orders: ${explainSquare(response.status, detail)}`);
    }
    return null;
  }

  const parsed = (await response.json().catch(() => null)) as {
    order_entries?: unknown[];
  } | null;
  if (!parsed) return null;
  return parsed.order_entries?.length ?? 0;
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
