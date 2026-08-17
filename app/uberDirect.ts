import "server-only";

import { milesBetween } from "./(marketing)/locations/locations";

// Uber Direct — the courier behind delivery orders.
//
// Uber Direct is Uber Eats' delivery network sold without the marketplace:
// the order is ours, the customer is ours, and Uber supplies the person on
// the bike. That's the right shape for this shop, which already takes its own
// orders and only needs someone to carry them.
//
// Three calls, in this order, and the order matters:
//
//   POST https://auth.uber.com/oauth/v2/token
//        client_credentials, scope eats.deliveries → a bearer token
//   POST /v1/customers/{id}/delivery_quotes
//        two addresses → a fee, an ETA, and a quote id that expires
//   POST /v1/customers/{id}/deliveries
//        that quote id + who and what → a delivery, with a tracking URL
//
// The quote is not optional and it is not decoration. It is where Uber says
// whether it will do the job at all — outside the courier's range, at 2am, in
// weather — and what it costs. Creating a delivery without one means finding
// that out after the customer has paid.
//
// The quote is also why the delivery fee on the checkout is a real number
// rather than a flat rate we invented. A flat fee is a bet that every address
// costs the same, and the shop eats the difference on the far ones.

const AUTH_URL = "https://auth.uber.com/oauth/v2/token";
const API = "https://api.uber.com/v1";

export type UberConfig = {
  customerId: string;
  clientId: string;
  clientSecret: string;
};

export function uberConfig(): UberConfig | null {
  const customerId = process.env.UBER_DIRECT_CUSTOMER_ID;
  const clientId = process.env.UBER_DIRECT_CLIENT_ID;
  const clientSecret = process.env.UBER_DIRECT_CLIENT_SECRET;
  if (!customerId || !clientId || !clientSecret) return null;
  return { customerId, clientId, clientSecret };
}

export function isUberConfigured(): boolean {
  return uberConfig() !== null;
}

// Tokens last 30 days, so minting one per request would be both slow and
// rude. Cached in module scope with a minute of slack against the clock —
// which is per-instance, and that's fine: the worst case is a few instances
// each holding their own valid token.
let cached: { token: string; expiresAt: number } | null = null;

async function token(config: UberConfig): Promise<string | null> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const response = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "client_credentials",
      scope: "eats.deliveries",
    }),
  });
  if (!response.ok) {
    console.error(`[uber] token failed: ${response.status}`);
    return null;
  }
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) return null;
  cached = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 2592000) * 1000,
  };
  return cached.token;
}

async function call(
  config: UberConfig,
  path: string,
  body: unknown,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; reason: string }> {
  const bearer = await token(config);
  if (!bearer) return { ok: false, reason: "no-token" };

  const response = await fetch(`${API}/customers/${config.customerId}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const parsed = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    // Uber's errors carry a machine-readable `code` — address_undeliverable,
    // customer_not_found, request_timeout. Kept whole in the log; the caller
    // decides what the customer is told.
    return {
      ok: false,
      reason: `${response.status} ${String(parsed?.code ?? "")} ${String(parsed?.message ?? "")}`.trim(),
    };
  }
  return { ok: true, body: parsed ?? {} };
}

// Uber takes addresses either as a plain string or as a structured object
// serialised into one. Structured is better — "650 S Catalina St" alone names
// no city, and there is a Catalina St in more than one of them — and the
// structured form is what the shop's own address is written as below.
export function structuredAddress(parts: {
  street: string;
  city: string;
  state: string;
  zip: string;
}): string {
  return JSON.stringify({
    street_address: [parts.street],
    city: parts.city,
    state: parts.state,
    zip_code: parts.zip,
    country: "US",
  });
}

export type Quote = {
  quoteId: string;
  // What Uber charges to carry it, in cents.
  feeCents: number;
  // Minutes from now until it's at the door, by Uber's estimate.
  etaMinutes: number | null;
  // When the quote stops being honoured. Past this, re-quote.
  expiresAt: string | null;
};

export type QuoteResult =
  | { ok: true; quote: Quote }
  // `reason` is for the log. `undeliverable` is the one the customer needs to
  // hear about, because it means this address can't be served at all rather
  // than something went wrong on our side.
  | { ok: false; reason: string; undeliverable: boolean };

export async function quoteDelivery(input: {
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  // When the food will be ready. Uber schedules the pickup against it, so a
  // courier doesn't stand at the counter for twelve minutes.
  readyAt?: Date;
}): Promise<QuoteResult> {
  const config = uberConfig();
  if (!config) return { ok: false, reason: "not-configured", undeliverable: false };

  const result = await call(config, "/delivery_quotes", {
    pickup_address: input.pickupAddress,
    pickup_latitude: input.pickupLat,
    pickup_longitude: input.pickupLng,
    dropoff_address: input.dropoffAddress,
    dropoff_latitude: input.dropoffLat,
    dropoff_longitude: input.dropoffLng,
    ...(input.readyAt ? { pickup_ready_dt: input.readyAt.toISOString() } : {}),
  });

  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason,
      undeliverable: result.reason.includes("address_undeliverable"),
    };
  }

  const id = result.body.id;
  const fee = result.body.fee;
  if (typeof id !== "string" || typeof fee !== "number") {
    return { ok: false, reason: "quote-malformed", undeliverable: false };
  }

  // dropoff_eta is an ISO timestamp; the checkout wants minutes.
  const eta = result.body.dropoff_eta;
  const etaMinutes =
    typeof eta === "string" && !Number.isNaN(Date.parse(eta))
      ? Math.max(0, Math.round((Date.parse(eta) - Date.now()) / 60_000))
      : null;

  return {
    ok: true,
    quote: {
      quoteId: id,
      feeCents: fee,
      etaMinutes,
      expiresAt: typeof result.body.expires === "string" ? result.body.expires : null,
    },
  };
}

export type Delivery = {
  deliveryId: string;
  // The page the customer watches the courier on. Uber runs it; there is no
  // point rebuilding a live map of somebody else's driver.
  trackingUrl: string | null;
  /** Where Uber decided the two ends actually are, and what it calls them.
   *
   *  Uber does not report the mileage it priced, so there is no distance of
   *  theirs to check ours against. It does report the two points, and that is
   *  the more useful check anyway: a distance is only right if it was measured
   *  between the places the courier is going. */
  resolved: {
    pickup: [number, number] | null;
    dropoff: [number, number] | null;
    pickupAddress: string | null;
    dropoffAddress: string | null;
  };
};

// How far Uber may move an end before it is worth a line in the log.
//
// Two numbers because the two ends are not the same kind of thing. A dropoff
// is a different address every time and a courier reads the label as well as
// the pin, so a small correction there is ordinary. The pickup is the same
// doorway on every single delivery: if Uber puts it eighty metres from where
// we measured, that is not one odd trip, it is every quote and every ETA the
// shop gives, and it is the signal that locations.ts wants a `door`.
const PICKUP_DRIFT_METRES = 40;
const DROPOFF_DRIFT_METRES = 75;

function point(value: unknown): [number, number] | null {
  const place = value as { lat?: unknown; lng?: unknown } | null;
  return typeof place?.lat === "number" && typeof place?.lng === "number"
    ? [place.lat, place.lng]
    : null;
}

function metresApart(a: [number, number], b: [number, number]): number {
  return milesBetween(a, b) * 1609.344;
}

function noteDrift(
  what: string,
  sent: [number, number],
  got: [number, number] | null,
  limit: number,
): void {
  if (!got) return;
  const drift = metresApart(sent, got);
  if (drift <= limit) return;
  console.warn(
    `[uber] ${what} resolved ${drift.toFixed(0)}m from the point we sent` +
      ` (${sent[0].toFixed(5)},${sent[1].toFixed(5)} → ${got[0].toFixed(5)},${got[1].toFixed(5)}).` +
      ` The courier is going to Uber's point, and our distance was measured to ours.`,
  );
}

export type CreateResult =
  | { ok: true; delivery: Delivery }
  | { ok: false; reason: string };

// How long a manifest item's name may be.
//
// Uber does not publish a limit and a create that is rejected for a long
// name does not fail politely — it fails the whole delivery, on an order the
// kitchen has already accepted. So this stays well inside anything plausible.
const MANIFEST_NAME_MAX = 120;

/** "Egg & Schmear (Jalapeño Cheddar, Vegan plain)".
 *
 *  Uber's manifest carries a name, a quantity and a price, and nothing that
 *  holds modifiers. So the choices go in the name or they do not travel: the
 *  courier's screen said "Egg & Schmear" while the customer had ordered a
 *  specific bagel with a specific spread. That matters at the two moments
 *  this manifest exists for — somebody at a door saying this is not what they
 *  ordered, and a bag going back to the shop that support has to identify.
 *
 *  The product name is protected on truncation and the choices are what get
 *  cut. A clipped list of spreads is still recognisable; a clipped product
 *  name is a different item. */
function manifestName(name: string, options?: string): string {
  const choices = options?.trim();
  if (!choices) return name.slice(0, MANIFEST_NAME_MAX);
  const room = MANIFEST_NAME_MAX - name.length - 3; // " (" and ")"
  if (room < 4) return name.slice(0, MANIFEST_NAME_MAX);
  const fitted = choices.length <= room ? choices : `${choices.slice(0, room - 1)}…`;
  return `${name} (${fitted})`;
}

export async function createDelivery(input: {
  quoteId: string;
  pickupName: string;
  pickupAddress: string;
  pickupPhone: string;
  dropoffName: string;
  dropoffAddress: string;
  dropoffPhone: string;
  // ——— ⚠️ The coordinates are not optional ———
  //
  // This call used to send the two addresses and nothing else, and the quote
  // beside it sent points. So every delivery was priced between the places we
  // measured and then *dispatched* to wherever Uber's own geocoder put two
  // strings, which is not the same question and does not have to have the same
  // answer. Uber's own example shows it: "285 Fulton St" comes back resolved
  // to One World Trade Center.
  //
  // For the dropoff that threw away the pin. PinPicker exists because a point
  // in Koreatown has a building on every side of it and the customer is the
  // only one who knows which is theirs; sending the words and not the point
  // handed that decision back to a geocoder at the last moment, after the
  // customer had answered it and paid.
  //
  // For the pickup it threw away the counter — the geocoded address, or a
  // surveyed `door` where a shop has one — and substituted a fresh lookup of
  // the street address on every order.
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  dropoffNote?: string;
  /** Our own handle for this order, written on Uber's copy of it.
   *
   *  Uber's `external_id`. Without it the only thing tying a courier job to a
   *  Corner Bagel order is a delivery id we stored on our side, which is fine
   *  until somebody is looking at the *other* side: a charge on the Uber
   *  dashboard, a support thread about a delivery that went wrong, a
   *  reconciliation at the end of a week. Those all start from Uber's record
   *  and have nowhere to go.
   *
   *  The value is whatever the rest of the order is keyed by — Toast's order
   *  guid where Toast is connected, the queue id where it isn't. Deliberately
   *  the same string the customer's tracker polls with and the kitchen queue
   *  is keyed on, so there is one handle rather than a fourth. */
  reference?: string;
  // What's in the bag. Uber shows this to the courier and uses it for the
  // undeliverable-return flow, so it's the real items and not "food".
  //
  // `options` is the customer's choices — the bagel, the spread — as one
  // string. Uber's manifest has no modifiers field, so they are folded into
  // the name below or they do not travel at all.
  items: { name: string; quantity: number; priceCents: number; options?: string }[];
}): Promise<CreateResult> {
  const config = uberConfig();
  if (!config) return { ok: false, reason: "not-configured" };

  const result = await call(config, "/deliveries", {
    quote_id: input.quoteId,
    pickup_name: input.pickupName,
    pickup_address: input.pickupAddress,
    pickup_phone_number: input.pickupPhone,
    pickup_latitude: input.pickupLat,
    pickup_longitude: input.pickupLng,
    dropoff_name: input.dropoffName,
    dropoff_address: input.dropoffAddress,
    dropoff_phone_number: input.dropoffPhone,
    dropoff_latitude: input.dropoffLat,
    dropoff_longitude: input.dropoffLng,
    ...(input.dropoffNote ? { dropoff_notes: input.dropoffNote.slice(0, 280) } : {}),
    ...(input.reference ? { external_id: input.reference } : {}),
    manifest_items: input.items.map((item) => ({
      name: manifestName(item.name, item.options),
      quantity: item.quantity,
      price: item.priceCents,
      size: "small",
    })),
  });

  if (!result.ok) return { ok: false, reason: result.reason };

  const id = result.body.id;
  if (typeof id !== "string") return { ok: false, reason: "delivery-malformed" };

  // Uber echoes both ends back as it resolved them, and it does not always
  // agree with what it was sent. That echo is the only cross-check available
  // on a delivery: not "is our mileage the same as theirs", which cannot be
  // asked, but the question underneath it — are the two of us talking about
  // the same doorway.
  const pickup = (result.body.pickup ?? null) as Record<string, unknown> | null;
  const dropoff = (result.body.dropoff ?? null) as Record<string, unknown> | null;
  const resolved = {
    pickup: point(pickup?.location),
    dropoff: point(dropoff?.location),
    pickupAddress: text(pickup?.address),
    dropoffAddress: text(dropoff?.address),
  };

  noteDrift("pickup", [input.pickupLat, input.pickupLng], resolved.pickup, PICKUP_DRIFT_METRES);
  noteDrift("dropoff", [input.dropoffLat, input.dropoffLng], resolved.dropoff, DROPOFF_DRIFT_METRES);

  return {
    ok: true,
    delivery: {
      deliveryId: id,
      trackingUrl:
        typeof result.body.tracking_url === "string" ? result.body.tracking_url : null,
      resolved,
    },
  };
}

export type DeliveryState = {
  deliveryId: string;
  /** Uber's own word for where the courier is: pending, pickup,
      pickup_complete, dropoff, delivered, canceled, returned. Mapped to our
      stages in app/orderStatus.ts, in one place. */
  status: string | null;
  /** When Uber expects the bag to arrive, epoch ms, or null.
   *
   *  The reason this file grew past `status`. Our tracker's arrival time was
   *  derived — placed-at plus a constant — which is a guess that cannot know
   *  about traffic, a courier three streets away, or a pickup that has not
   *  happened yet. Uber is watching all of that. Reported beats derived. */
  dropoffEta: number | null;
  /** Who is bringing it, and in what. Absent until a courier is assigned. */
  courierName: string | null;
  courierVehicle: string | null;
  /** The time Uber commits to, as opposed to the one it expects.
   *
   *  `dropoff_deadline` on the delivery. Uber shows both on its own tracker —
   *  an estimate, and a "latest arrival by" under it — and the second is the
   *  more useful of the two to somebody deciding whether to wait: an estimate
   *  moves, a deadline is a statement. */
  dropoffDeadline: number | null;
  /** The number the customer can reach the courier on, when Uber gives one.
   *
   *  Uber's own app puts a call and a chat behind the courier's name. We
   *  cannot rebuild the chat, and would not — it is theirs — but a number is
   *  a number. Null whenever Uber has not supplied one, which includes every
   *  moment before a courier is assigned, and the screen simply has no button
   *  then rather than a dead one. */
  courierPhone: string | null;
  /** Uber's own "he is about to arrive".
   *
   *  Worth having because the alternative is arithmetic. A tracker can say
   *  "arriving around 8:42" from an ETA and be five minutes wrong in either
   *  direction; this is Uber watching the courier's actual position against
   *  the dropoff. It is the difference between a time to plan around and a
   *  reason to put shoes on. */
  courierImminent: boolean;
};

// Uber sends timestamps as RFC3339. Anything unparseable is treated as absent
// rather than as an epoch of zero, which would render as 1970 on a tracker.
function instant(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** What Uber currently says about a delivery.
 *
 *  A GET, unlike everything else here, so it does not go through call() —
 *  that helper posts.
 *
 *  Still no courier coordinates. The line is drawn there rather than at the
 *  ETA on purpose: a position is only worth having if it is live, and ours
 *  would be a marker that jumps once per poll — a worse version of the page
 *  Uber already runs. An arrival time and a courier's name do not degrade
 *  that way. They are true for minutes at a stretch, they read the same in
 *  our ten languages as in one, and they replace a number this app was
 *  otherwise making up. */
export async function fetchDelivery(deliveryId: string): Promise<DeliveryState | null> {
  const config = uberConfig();
  if (!config) return null;
  const bearer = await token(config);
  if (!bearer) return null;

  const response = await fetch(
    `${API}/customers/${config.customerId}/deliveries/${encodeURIComponent(deliveryId)}`,
    { headers: { Authorization: `Bearer ${bearer}` }, cache: "no-store" },
  );
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return null;
  // Every field below is optional in practice — a delivery that has not been
  // assigned yet has no courier, and Uber has been known to omit an eta on a
  // pending job. Each one is read on its own so a missing courier cannot take
  // the ETA down with it, and absent stays absent rather than becoming a
  // placeholder somebody has to read.
  const courier = (body.courier ?? null) as Record<string, unknown> | null;
  return {
    deliveryId,
    status: text(body.status),
    dropoffEta: instant(body.dropoff_eta),
    courierName: courier ? text(courier.name) : null,
    courierVehicle: courier ? text(courier.vehicle_type) : null,
    // Strictly true, never merely truthy. Absent means "Uber has not said so",
    // which is not the same claim as "he is nearly here" and must not become
    // it on a response that happened to omit the field.
    courierImminent: body.courier_imminent === true,
    dropoffDeadline: instant(body.dropoff_deadline),
    courierPhone: courier ? text(courier.phone_number) : null,
  };
}
