import "server-only";

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
};

export type ToastOrderResult =
  /** `readyAt` is Toast's estimatedFulfillmentDate as epoch ms, when it sent
      one. See the note where it is parsed. */
  | { ok: true; orderGuid: string; readyAt?: number }
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
    orderGuid: body.guid,
    ...(Number.isNaN(estimated) ? {} : { readyAt: estimated }),
  };
}

export type ToastOrderState = {
  guid: string;
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
    guid: body.guid,
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
