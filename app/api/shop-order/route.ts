import {
  describeOptions,
  getProduct,
  normalizeOptions,
  soldOut,
  unitPriceCents,
  type SelectedOptions,
} from "../../shop/products";
import { totalsFor } from "../../shop/money";
import {
  isOpenNow,
  minutesUntilClose,
  nextOpening,
  PREP_MINUTES,
  SHOP_ADDRESS_PARTS,
  SHOP_PHONE,
} from "../../shopFacts";
import { createToastOrder, isToastConfigured } from "../../toast";
import { DELIVERY_ORIGIN } from "../../(marketing)/locations/locations";
import { geocode } from "../../googleMaps";
import {
  createDelivery,
  isUberConfigured,
  quoteDelivery,
  structuredAddress,
} from "../../uberDirect";

// Order intake, behind /checkout on the shop subdomain.
//
// Everything about money is recomputed here. The client sends what it thinks
// the order costs so the two can be compared, but nothing it sends is
// believed: prices come from the catalog, tax and totals come from
// app/shop/money.ts, and the tip is the one number taken as given — because
// it is genuinely the customer's to name — clamped to something sane.
//
// When Toast is configured the order goes to it. When it isn't, the order is
// logged and the shop is told by other means, which is what happens today.
// Either way the response says which, so nobody has to guess whether the
// kitchen actually heard about it.

function isNonEmptyString(input: unknown): input is string {
  return typeof input === "string" && input.trim().length > 0;
}

function isValidEmail(input: unknown): input is string {
  return typeof input === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

type OrderItem = {
  slug: string;
  name: string;
  quantity: number;
  // Unit price with the chosen options priced in.
  priceCents: number;
  options: SelectedOptions;
  // The same choices as labels, so a human reading this log doesn't have to
  // map choice ids back onto the menu.
  optionsLabel: string;
};
type Order = {
  name: string;
  email: string;
  phone: string;
  items: OrderItem[];
  subtotalCents: number;
  deliveryCents: number;
  tipCents: number;
  totalCents: number;
  curbside: boolean;
  utensils: boolean;
  note: string;
};

function onOrder(order: Order) {
  const lines = order.items
    .map(
      (item) =>
        `  ${item.quantity}x ${item.name}${item.optionsLabel ? ` [${item.optionsLabel}]` : ""} (${item.slug}) — $${(item.priceCents / 100).toFixed(2)} each`,
    )
    .join("\n");
  const extras = [
    order.curbside ? "curbside" : null,
    order.utensils ? "utensils" : null,
    order.note ? `note: ${order.note}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  console.info(
    `[shop-order] order from ${order.name} <${order.email}>, phone=${order.phone || "—"}\n${lines}\n` +
      `  Subtotal: $${(order.subtotalCents / 100).toFixed(2)}` +
      `  Tip: $${(order.tipCents / 100).toFixed(2)}` +
      `  Total: $${(order.totalCents / 100).toFixed(2)}` +
      (extras ? `\n  ${extras}` : ""),
  );
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const body = payload as
    | { name?: unknown; email?: unknown; phone?: unknown; items?: unknown }
    | null;

  const { name, email } = body ?? {};
  if (!isNonEmptyString(name) || !isValidEmail(email)) {
    return Response.json(
      { error: "Fill in your name and email." },
      { status: 400 },
    );
  }

  // Closed means closed. The checkout disables its own button, but that is a
  // courtesy to the person using it — this is the rule, and it's here because
  // a request doesn't have to come from the form.
  //
  // PREP_MINUTES of headroom, because being open at 1:58pm is not the same as
  // being able to make something before 2.
  if (!isOpenNow() || minutesUntilClose() < PREP_MINUTES) {
    const next = nextOpening();
    return Response.json(
      {
        error: next
          ? `We're closed right now — we open ${next}.`
          : "There isn't time to make that before we close at 2pm.",
      },
      { status: 409 },
    );
  }

  const rawItems = body?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return Response.json({ error: "Your cart is empty." }, { status: 400 });
  }

  // Recompute against the catalog rather than trusting client-submitted
  // prices/subtotal — a tampered request shouldn't be able to check out at
  // an arbitrary price. That now includes the options: the surcharge for a
  // spread comes from the catalog's own choice list, so a request claiming
  // lox spread at $0 is repriced, not honoured.
  //
  // normalizeOptions also closes the other half of that: a choice id the
  // menu doesn't have is replaced with the group's default, and a group left
  // unanswered is filled in, so nothing downstream sees a half-specified
  // item. A bagel with no kind chosen would otherwise reach the kitchen as a
  // question rather than an order.
  const items: OrderItem[] = [];
  for (const raw of rawItems) {
    const slug = (raw as { slug?: unknown })?.slug;
    const quantity = (raw as { quantity?: unknown })?.quantity;
    if (
      typeof slug !== "string" ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      return Response.json({ error: "Invalid cart item." }, { status: 400 });
    }
    const product = getProduct(slug);
    if (!product) {
      return Response.json({ error: "Invalid cart item." }, { status: 400 });
    }
    // Gone since the basket was filled. 409 rather than 400: the request is
    // well-formed, the world moved.
    if (soldOut(slug)) {
      return Response.json(
        { error: `${product.name} sold out today.` },
        { status: 409 },
      );
    }
    const rawOptions = (raw as { options?: unknown })?.options;
    const options = normalizeOptions(
      product,
      typeof rawOptions === "object" && rawOptions !== null
        ? (rawOptions as SelectedOptions)
        : undefined,
    );
    // A group with no default that still isn't answered can't be made. The
    // UI blocks this, so reaching it means the request didn't come from it.
    const unanswered = (product.options ?? []).filter((group) => !options[group.id]);
    if (unanswered.length > 0) {
      return Response.json(
        { error: `Choose a ${unanswered[0].label.toLowerCase()} for ${product.name}.` },
        { status: 400 },
      );
    }
    items.push({
      slug,
      name: product.name,
      quantity,
      priceCents: unitPriceCents(product, options),
      options,
      optionsLabel: describeOptions(product, options).join(", "),
    });
  }
  const subtotalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);

  // The tip is the customer's to set, so it's taken as sent rather than
  // recomputed — but it's still bounded. A negative tip is a discount nobody
  // authorised, and a tip larger than the order is far more likely to be a
  // decimal-point slip or a tampered request than generosity.
  const rawTip = (body as { tipCents?: unknown })?.tipCents;
  const tipCents =
    typeof rawTip === "number" && Number.isFinite(rawTip)
      ? Math.min(Math.max(Math.round(rawTip), 0), subtotalCents * 2)
      : 0;

  // ——— Delivery ———
  //
  // Re-quoted here, not read off the request. The checkout showed a fee, and
  // that fee came from Uber — but it came back through the browser, so what
  // arrives is a claim. Quoting again costs one call and means the courier is
  // booked at the price the shop is actually charged.
  //
  // The comparison exists for the customer, not for us: if the fresh quote is
  // materially higher than the one they agreed to, the order stops and they
  // see the new number rather than finding it on a receipt.
  const fulfillment = (body as { fulfillment?: { mode?: unknown; address?: unknown } })
    ?.fulfillment;
  const forDelivery = fulfillment?.mode === "delivery";
  const deliveryAddress =
    typeof fulfillment?.address === "string" ? fulfillment.address.trim() : "";

  let deliveryCents = 0;
  let deliveryQuoteId: string | null = null;
  let dropoff: { address: string; lat: number; lng: number } | null = null;

  if (forDelivery) {
    if (!deliveryAddress) {
      return Response.json({ error: "Missing delivery address." }, { status: 400 });
    }
    if (!isUberConfigured()) {
      return Response.json(
        { error: "Delivery is unavailable right now. Pickup is still open." },
        { status: 503 },
      );
    }

    const place = await geocode(deliveryAddress, DELIVERY_ORIGIN.position);
    if (!place) {
      return Response.json({ error: "We couldn't find that address." }, { status: 400 });
    }
    dropoff = place;

    const fresh = await quoteDelivery({
      pickupAddress: structuredAddress(SHOP_ADDRESS_PARTS),
      pickupLat: DELIVERY_ORIGIN.position[0],
      pickupLng: DELIVERY_ORIGIN.position[1],
      dropoffAddress: place.address,
      dropoffLat: place.lat,
      dropoffLng: place.lng,
      readyAt: new Date(Date.now() + PREP_MINUTES * 60_000),
    });

    if (!fresh.ok) {
      console.error(`[shop-order] delivery quote failed: ${fresh.reason}`);
      return Response.json(
        {
          error: fresh.undeliverable
            ? "No courier can reach that address right now. Pickup is still open."
            : "We couldn't arrange delivery. Try again in a moment.",
        },
        { status: fresh.undeliverable ? 422 : 502 },
      );
    }

    deliveryCents = fresh.quote.feeCents;
    deliveryQuoteId = fresh.quote.quoteId;

    // A dollar of drift is the courier network repricing between two calls a
    // few seconds apart, and swallowing that is better than making somebody
    // start over. More than that is a different delivery from the one they
    // agreed to.
    const shown = (body as { deliveryFeeCents?: unknown })?.deliveryFeeCents;
    if (typeof shown === "number" && Math.abs(shown - deliveryCents) > 100) {
      return Response.json(
        {
          error: `The delivery fee changed to $${(deliveryCents / 100).toFixed(2)}. Check the total and place the order again.`,
          deliveryCents,
        },
        { status: 409 },
      );
    }
  }

  const totals = totalsFor({ subtotalCents, deliveryCents, tipCents });

  const order: Order = {
    name: name.trim(),
    email: email.trim(),
    phone: typeof body?.phone === "string" ? body.phone.trim() : "",
    items,
    subtotalCents,
    deliveryCents: totals.deliveryCents,
    tipCents: totals.tipCents,
    totalCents: totals.totalCents,
    curbside: (body as { curbside?: unknown })?.curbside === true,
    utensils: (body as { utensils?: unknown })?.utensils === true,
    note:
      typeof (body as { note?: unknown })?.note === "string"
        ? ((body as { note: string }).note).trim().slice(0, 255)
        : "",
  };

  onOrder(order);

  // Toast, when it's there. The draft is built from the repriced order, never
  // from the request, so what the kitchen is told and what the customer was
  // shown come from the same numbers.
  if (isToastConfigured()) {
    const [firstName, ...rest] = order.name.split(/\s+/);
    const sent = await createToastOrder({
      customer: {
        firstName: firstName ?? "",
        lastName: rest.join(" "),
        email: order.email,
        phone: order.phone,
      },
      diningOption: forDelivery ? "delivery" : order.curbside ? "curbside" : "pickup",
      deliveryAddress: dropoff?.address,
      items: items.map((item) => ({
        slug: item.slug,
        name: item.name,
        quantity: item.quantity,
        unitCents: item.priceCents,
        modifiers: item.optionsLabel ? item.optionsLabel.split(", ") : [],
      })),
      subtotalCents: order.subtotalCents,
      tipCents: order.tipCents,
      utensils: order.utensils,
      note: order.note || undefined,
    });

    if (!sent.ok) {
      // The order did not reach the kitchen. Saying "you're all set" here
      // would send somebody to a counter that has never heard of them, so
      // this fails loudly instead.
      console.error(`[shop-order] Toast submission failed: ${sent.reason}`);
      return Response.json(
        { error: "We couldn't send that to the shop. Please try again in a moment." },
        { status: 502 },
      );
    }

    return Response.json(
      {
        ok: true,
        totals,
        orderGuid: sent.orderGuid,
        submitted: "toast",
        ...(await bookCourier()),
      },
      { status: 200 },
    );
  }

  return Response.json(
    { ok: true, totals, submitted: "logged", ...(await bookCourier()) },
    { status: 200 },
  );

  // Booking the courier is the last thing, deliberately.
  //
  // Order of operations matters here in a way that isn't obvious: a courier
  // booked before the kitchen has the order is a courier arriving at a
  // counter that has never heard of it, and Uber charges for that. So the
  // till hears first, and only an order that landed gets a driver.
  //
  // A failure at this point is the one case where the customer is told the
  // order is placed and something still went wrong — because it did go
  // through, it is being made, and the honest answer is "it's coming, we're
  // sorting out the ride" rather than throwing away a real order.
  async function bookCourier(): Promise<{
    trackingUrl?: string;
    deliveryBooked?: boolean;
  }> {
    if (!forDelivery || !deliveryQuoteId || !dropoff) return {};

    const [firstName, ...rest] = order.name.split(/\s+/);
    const booked = await createDelivery({
      quoteId: deliveryQuoteId,
      pickupName: "Corner Bagel",
      pickupAddress: structuredAddress(SHOP_ADDRESS_PARTS),
      pickupPhone: SHOP_PHONE,
      dropoffName: `${firstName ?? ""} ${rest.join(" ")}`.trim() || order.email,
      dropoffAddress: dropoff.address,
      // Uber calls this number when the courier is outside. Without one the
      // delivery can stall on the pavement, which is why the checkout asks
      // for a phone and why this falls back to the shop's line.
      dropoffPhone: order.phone || SHOP_PHONE,
      dropoffNote: order.note || undefined,
      items: items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        priceCents: item.priceCents,
      })),
    });

    if (!booked.ok) {
      console.error(`[shop-order] courier booking failed: ${booked.reason}`);
      return { deliveryBooked: false };
    }
    return {
      deliveryBooked: true,
      ...(booked.delivery.trackingUrl
        ? { trackingUrl: booked.delivery.trackingUrl }
        : {}),
    };
  }
}
