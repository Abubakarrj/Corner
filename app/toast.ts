import "server-only";

import { foodStageOf } from "./orderStages";
import { SHOP_TIME_ZONE } from "./shopFacts";

/** A scheduled time as the counter reads it: shop time, English, and short
 *  enough to survive a ticket header. Not translated — this prints in the
 *  kitchen, not on the customer's phone. */
function scheduledLabel(at: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TIME_ZONE,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

// Toast — the POS the shop actually runs on.
//
// Three things live here: getting a token, pulling the published menu, and
// pushing an order onto the till.
//
//   POST {host}/authentication/v1/authentication/login
//        -> a bearer token, cached until shortly before it expires
//   GET  {host}/menus/v2/menus
//        -> the published menu
//   POST {host}/orders/v2/orders
//        with Toast-Restaurant-External-ID: <restaurant GUID>
//        -> the created order, with its own GUID and check
//   GET  {host}/orders/v2/orders/{guid}
//        -> that order's current state
//
// ——— Menus before orders ———
//
// The tempting first integration is order submission. It is the wrong one.
//
// app/shop/products.ts is the source of truth for what exists and what it
// costs. The moment Toast is the POS, the till is — and the two will disagree,
// because somebody will change a price at the counter and nobody will edit a
// TypeScript file. Then the site quotes $14.50, the customer agrees to $14.50,
// and the window charges $15.00. That is a worse failure than the site not
// being able to submit an order at all, and it is silent.
//
// So `fetchMenuItems` exists, and an order line carries a `toastGuid` when
// products.ts knows one. Until each product carries its GUID, lines go up as
// open items with our own names and prices attached — which Toast accepts,
// and which is honest about where the numbers came from. Filling in the GUIDs
// is the next step, and it is data entry rather than code.
//
// ——— On payment ———
//
// This module never sees a card number, and no part of this app should.
//
// Card fields belong inside Toast's own hosted payment element, so the card
// data goes from the browser to Toast's PCI environment without this site in
// between. Recreating those inputs as plain fields on our page would put a
// live card number in this page's memory, our request logs, and any error
// report that captures a request body — and would drag whoever deploys this
// into PCI DSS scope. The order created here is therefore created unpaid;
// what settles it is either the counter or a Toast payment token applied to
// the check. A token, never a PAN.

export type ToastConfig = {
  host: string;
  clientId: string;
  clientSecret: string;
  restaurantGuid: string;
};

// Read per-call rather than at module load, so a deployment that adds the
// credentials starts working on the next request instead of the next restart.
// All four are server-only names — no NEXT_PUBLIC_ prefix — because a client
// id and secret in the browser bundle is a secret published to everyone.
export function toastConfig(): ToastConfig | null {
  const host = process.env.TOAST_API_HOST;
  const clientId = process.env.TOAST_CLIENT_ID;
  const clientSecret = process.env.TOAST_CLIENT_SECRET;
  const restaurantGuid = process.env.TOAST_RESTAURANT_GUID;
  if (!host || !clientId || !clientSecret || !restaurantGuid) return null;
  return { host: host.replace(/\/$/, ""), clientId, clientSecret, restaurantGuid };
}

export function isToastConfigured(): boolean {
  return toastConfig() !== null;
}

// ——— Auth ———

let cachedToken: { value: string; expiresAt: number } | null = null;

async function token(config: ToastConfig): Promise<string | null> {
  // A minute of slack, so a token that expires mid-flight isn't used.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const response = await fetch(
    `${config.host}/authentication/v1/authentication/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        userAccessType: "TOAST_MACHINE_CLIENT",
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    console.error(`[toast] auth failed: ${response.status}`);
    return null;
  }

  const body = (await response.json()) as {
    token?: { accessToken?: string; expiresIn?: number };
  };
  const accessToken = body.token?.accessToken;
  if (!accessToken) return null;

  cachedToken = {
    value: accessToken,
    expiresAt: Date.now() + (body.token?.expiresIn ?? 86400) * 1000,
  };
  return accessToken;
}

async function authHeaders(config: ToastConfig): Promise<Record<string, string> | null> {
  const bearer = await token(config);
  if (!bearer) return null;
  return {
    Authorization: `Bearer ${bearer}`,
    "Content-Type": "application/json",
    "Toast-Restaurant-External-ID": config.restaurantGuid,
  };
}

// ——— Menus ———

export type ToastMenuItem = {
  guid: string;
  name: string;
  priceCents: number | null;
};

// The published menu, flattened to the items an order can reference.
//
// Cached for five minutes: the menu changes when somebody edits it at the
// counter, which is rare, and pulling the whole thing on every request is
// both slow and a good way to be rate-limited.
export async function fetchMenuItems(): Promise<ToastMenuItem[]> {
  const config = toastConfig();
  if (!config) return [];

  const auth = await authHeaders(config);
  if (!auth) return [];

  const response = await fetch(`${config.host}/menus/v2/menus`, {
    headers: auth,
    next: { revalidate: 300 },
  });
  if (!response.ok) {
    console.error(`[toast] menu pull failed: ${response.status}`);
    return [];
  }

  const body = (await response.json()) as {
    menus?: {
      menuGroups?: {
        menuItems?: { guid?: string; name?: string; price?: number }[];
      }[];
    }[];
  };

  const items: ToastMenuItem[] = [];
  for (const menu of body.menus ?? []) {
    for (const group of menu.menuGroups ?? []) {
      for (const item of group.menuItems ?? []) {
        if (!item.guid || !item.name) continue;
        items.push({
          guid: item.guid,
          name: item.name,
          // Toast quotes prices in dollars as a decimal; everything in this
          // app is integer cents, and the conversion happens once, here.
          priceCents: typeof item.price === "number" ? Math.round(item.price * 100) : null,
        });
      }
    }
  }
  return items;
}

// ——— Orders ———

// What we hand Toast, in our own vocabulary. Kept separate from Toast's wire
// format on purpose: the mapping between the two is one function, so a change
// to their schema doesn't reach into the checkout page.
export type ToastOrderDraft = {
  customer: { firstName: string; lastName: string; email: string; phone: string };
  diningOption: "pickup" | "delivery" | "curbside";
  deliveryAddress?: string;
  items: {
    slug: string;
    name: string;
    quantity: number;
    unitCents: number;
    modifiers: string[];
    // The Toast menu item this line is, when products.ts knows it. Without it
    // the line goes up as an open item with our name and price on it.
    toastGuid?: string;
  }[];
  subtotalCents: number;
  tipCents: number;
  utensils: boolean;
  note?: string;
  /** When a scheduled order is due, for an order placed while the counter was
   *  shut. Absent on an ordinary order, which Toast times itself. */
  promisedAt?: Date;
};

export type ToastOrderResult =
  /** `readyAt` is Toast's estimatedFulfillmentDate as epoch ms, when it sent
      one. See the note where it is parsed.
      `orderId` rather than `orderGuid`: the shape is shared with Square now
      through app/pos.ts, and one of the two had to stop using its vendor's
      word for the same thing. */
  | { ok: true; orderId: string; readyAt?: number }
  // `reason` is for the log, not the customer. A failure here means the
  // kitchen never heard about the order, so the caller has to say so plainly
  // rather than showing a confirmation.
  | { ok: false; reason: string };

// Toast's dining-option behaviours. The GUIDs of a restaurant's own dining
// options are per-restaurant, so the order carries the behaviour and lets
// Toast pick the matching option — which is what makes this work without a
// configuration step per deployment.
const BEHAVIOUR = {
  pickup: "TAKE_OUT",
  curbside: "TAKE_OUT",
  delivery: "DELIVERY",
} as const;

export async function createToastOrder(
  draft: ToastOrderDraft,
): Promise<ToastOrderResult> {
  const config = toastConfig();
  if (!config) return { ok: false, reason: "not-configured" };

  const auth = await authHeaders(config);
  if (!auth) return { ok: false, reason: "no-token" };

  // The ticket carries what Toast has no field for: curbside, utensils, and
  // whatever the customer typed. It prints on the ticket, which is where the
  // person making the order will actually read it.
  const notes = [
    // First, and in capitals, because it is the one fact that changes what
    // the counter does with the ticket. A scheduled order made on arrival is
    // a cold bagel sitting on a shelf until its owner turns up.
    draft.promisedAt ? `FOR ${scheduledLabel(draft.promisedAt)}` : null,
    draft.diningOption === "curbside" ? "CURBSIDE" : null,
    draft.utensils ? "Utensils" : null,
    draft.note,
  ]
    .filter(Boolean)
    .join(" · ");

  const customer = {
    firstName: draft.customer.firstName,
    lastName: draft.customer.lastName,
    email: draft.customer.email,
    ...(draft.customer.phone ? { phone: draft.customer.phone } : {}),
  };

  const payload = {
    entityType: "Order",
    diningOption: { behavior: BEHAVIOUR[draft.diningOption] },
    // Toast's own field for a future order. Sent alongside the note above
    // rather than instead of it: this is what its scheduling reads, the note
    // is what a person reads, and an order that is early on one and on time
    // on the other is the failure worth two lines of redundancy.
    ...(draft.promisedAt ? { promisedDate: draft.promisedAt.toISOString() } : {}),
    ...(draft.deliveryAddress
      ? { deliveryInfo: { address1: draft.deliveryAddress } }
      : {}),
    customer,
    checks: [
      {
        customer,
        ...(notes ? { tabName: notes.slice(0, 255) } : {}),
        selections: draft.items.map((item) => ({
          ...(item.toastGuid
            ? { item: { guid: item.toastGuid } }
            : // An open item: Toast takes the name and price as given. Used
              // until products.ts carries Toast GUIDs — see the note at the
              // top of this file about why the menu pull comes first.
              { displayName: item.name, price: item.unitCents / 100 }),
          quantity: item.quantity,
          modifiers: item.modifiers.map((label) => ({ displayName: label })),
        })),
      },
    ],
  };

  let response: Response;
  try {
    response = await fetch(`${config.host}/orders/v2/orders`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify(payload),
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
    return { ok: false, reason: `${response.status}: ${detail.slice(0, 300)}` };
  }

  const body = (await response.json().catch(() => null)) as {
    guid?: string;
    estimatedFulfillmentDate?: string;
  } | null;
  if (!body?.guid) return { ok: false, reason: "no-guid-in-response" };
  // Toast works this out from the restaurant's own quote time, its hours and
  // its throttling — the shop's answer to "when will this be ready", not
  // ours. We were parsing it out of the response and dropping it on the
  // floor, and showing a fixed PREP_MINUTES instead.
  //
  // Optional because it is Toast's field and we do not control it, and
  // because nothing here runs when Toast is unconfigured. Absent, everything
  // downstream falls back to the constant it used before.
  const estimated = body.estimatedFulfillmentDate
    ? Date.parse(body.estimatedFulfillmentDate)
    : NaN;
  return {
    ok: true,
    orderId: body.guid,
    ...(Number.isNaN(estimated) ? {} : { readyAt: estimated }),
  };
}

export type ToastOrderState = {
  id: string;
  // Toast's own words for where the order is. Passed through rather than
  // mapped onto our tracker's stages, because the mapping is a guess until
  // somebody has watched a real order move through it.
  status: string | null;
  /** Where the kitchen has got to, in Toast's vocabulary — the same values the
      guest order fulfillment webhook sends. Mapped to our own stages in
      app/orderStatus.ts, in one place. */
  fulfillment: string | null;
};

// What Toast currently thinks of an order. This is what real order tracking
// reads, in place of the clock-based estimate in app/account.ts.
export async function fetchToastOrder(guid: string): Promise<ToastOrderState | null> {
  const config = toastConfig();
  if (!config) return null;
  const auth = await authHeaders(config);
  if (!auth) return null;

  const response = await fetch(
    `${config.host}/orders/v2/orders/${encodeURIComponent(guid)}`,
    { headers: auth, cache: "no-store" },
  );
  if (!response.ok) return null;

  const body = (await response.json()) as {
    guid?: string;
    guestOrderStatus?: string;
    checks?: { paymentStatus?: string; selections?: { fulfillmentStatus?: string }[] }[];
  };
  if (!body.guid) return null;
  return {
    id: body.guid,
    status: body.checks?.[0]?.paymentStatus ?? null,
    fulfillment: body.guestOrderStatus ?? derivedFulfillment(body),
  };
}

/** What the kitchen has done, when the order object doesn't carry an
 *  order-level guest status.
 *
 *  Toast tracks preparation per menu item: a selection is NEW, then HOLD or
 *  SENT once it's fired, then READY when it's made. An order is only ready
 *  when every part of it is, so this is an AND, not an OR — half a sandwich
 *  being ready is not an order to come and collect.
 *
 *  Returns null rather than a guess when there is nothing to read, which
 *  leaves the tracker on its estimate. */
function derivedFulfillment(body: {
  checks?: { selections?: { fulfillmentStatus?: string }[] }[];
}): string | null {
  const states = (body.checks ?? [])
    .flatMap((check) => check.selections ?? [])
    .map((selection) => selection.fulfillmentStatus?.toUpperCase())
    .filter((state): state is string => Boolean(state));
  if (states.length === 0) return null;
  if (states.every((state) => state === "READY")) return "READY_FOR_PICKUP";
  if (states.some((state) => state === "SENT")) return "IN_PREPARATION";
  return "RECEIVED";
}

// ——— How much work is on the counter ———
//
// Orders Hub is the till, so this is the authoritative answer to "how many
// orders are the kitchen still making". Better than the count this app keeps
// for itself in app/kitchenQueue.ts, in three ways that all come from the same
// fact — Toast sees the kitchen and we see only what we sent it:
//
//   every channel     a ticket entered at the POS, or arriving from anywhere
//                     else, is in this number. Our own table can only ever
//                     count what passed through /api/shop-order.
//   current state     read, not accumulated. Our table depends on a webhook
//                     arriving to close a row, and needs a staleness cutoff
//                     to survive one that never does. Nothing here can drift.
//   no bookkeeping    nothing to insert, close, or sweep.
//
// The reason it is not the only path is that Toast can be unconfigured, and
// the count then has to come from somewhere or the feature goes dark.

const QUEUE_WINDOW_MINUTES = 180;

/** Orders the kitchen is still working on, from Orders Hub.
 *
 *  Null when Toast is not configured or the call fails — never 0. A zero from
 *  a failed request renders as "no orders ahead" on the screen somebody uses
 *  to decide whether to walk over, which is a confident lie assembled out of
 *  an error. See app/api/kitchen-load/route.ts. */
export async function countOpenOrders(): Promise<number | null> {
  const config = toastConfig();
  if (!config) return null;
  const auth = await authHeaders(config);
  if (!auth) return null;

  // A window rather than the business date. Late in the day a business-date
  // query returns every order since 7am to count the four that matter, and
  // nothing in a bagel kitchen has been open for three hours.
  const end = new Date();
  const start = new Date(end.getTime() - QUEUE_WINDOW_MINUTES * 60_000);
  const params = new URLSearchParams({
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    pageSize: "100",
  });

  let response: Response;
  try {
    response = await fetch(`${config.host}/orders/v2/ordersBulk?${params}`, {
      headers: auth,
      cache: "no-store",
    });
  } catch (error) {
    console.error("[toast] ordersBulk failed:", (error as Error).message);
    return null;
  }
  if (!response.ok) {
    console.error(`[toast] ordersBulk failed: ${response.status}`);
    return null;
  }

  const orders = (await response.json().catch(() => null)) as
    | {
        voided?: boolean;
        deleted?: boolean;
        closedDate?: string | null;
        guestOrderStatus?: string;
        checks?: { selections?: { fulfillmentStatus?: string }[] }[];
      }[]
    | null;
  if (!Array.isArray(orders)) return null;

  return orders.filter(inTheKitchen).length;
}

/** Still being made: not voided, not closed, and not yet ready.
 *
 *  Reads the fulfillment through the same two steps the tracker uses —
 *  guestOrderStatus, or derivedFulfillment when the order object does not
 *  carry one, then foodStageOf. Sharing that path is what stops the queue and
 *  the tracker disagreeing about what "ready" means, which would show as a
 *  customer being told their food is ready while still being counted as
 *  somebody else's wait.
 *
 *  An order whose status is unrecognised counts. foodStageOf returns undefined
 *  there rather than guessing, and for a queue the safe reading of "we don't
 *  know what this is" is that the kitchen still has it — overstating a wait by
 *  one sends somebody five minutes late, understating it sends them into a
 *  line. */
function inTheKitchen(order: {
  voided?: boolean;
  deleted?: boolean;
  closedDate?: string | null;
  guestOrderStatus?: string;
  checks?: { selections?: { fulfillmentStatus?: string }[] }[];
}): boolean {
  if (order.voided === true || order.deleted === true) return false;
  if (order.closedDate) return false;
  const stage = foodStageOf(order.guestOrderStatus ?? derivedFulfillment(order));
  return stage === undefined || stage === "received" || stage === "cooking";
}

/** Whether Toast will actually issue us a token, asked now.
 *
 *  For /api/status. Credentials present in the environment is not the same as
 *  credentials that work, and the difference is a shop that believes orders
 *  are reaching the kitchen.
 *
 *  Deliberately does not go through token() and does not touch its cache. The
 *  first version did, and it was the exact bug this endpoint exists to find,
 *  written into the endpoint: the cached token lives for a day, so a status
 *  check would have reported Toast healthy for twenty-four hours after Toast
 *  stopped answering. A check that reads a cache is not a check.
 *
 *  Nothing here is cached either, in the other direction — a successful probe
 *  does not seed the cache, because a token minted for a diagnostic is not one
 *  the order path should be quietly relying on. */
export async function toastReachable(): Promise<{ ok: true } | { ok: false; why: string }> {
  const config = toastConfig();
  if (!config) return { ok: false, why: "not configured" };

  let response: Response;
  try {
    response = await fetch(`${config.host}/authentication/v1/authentication/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        userAccessType: "TOAST_MACHINE_CLIENT",
      }),
      cache: "no-store",
    });
  } catch (error) {
    return {
      ok: false,
      why: `TOAST_API_HOST is unreachable: ${(error as Error).message}`,
    };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, why: `Toast rejected the credentials (${response.status}).` };
  }
  if (!response.ok) {
    return { ok: false, why: `Toast answered ${response.status} to the login call.` };
  }
  const body = (await response.json().catch(() => null)) as {
    token?: { accessToken?: string };
  } | null;
  return body?.token?.accessToken
    ? { ok: true }
    : { ok: false, why: "Toast accepted the login but returned no token." };
}
