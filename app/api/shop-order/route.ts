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
  closeLabel,
  isOpenNow,
  minutesUntilClose,
  nextOpening,
  PREP_MINUTES,
  SHOP_ADDRESS_PARTS,
  SHOP_PHONE,
} from "../../shopFacts";
import { createToastOrder, isToastConfigured } from "../../toast";
import { geocode } from "../../googleMaps";
import {
  createDelivery,
  isUberConfigured,
  quoteDelivery,
  structuredAddress,
} from "../../uberDirect";
import { deliveryOrigin } from "../../storePlaces";
import { joinQueue } from "../../kitchenQueue";

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

/** A free-text field off the request: trimmed, capped, and "" for anything
 *  that isn't a string. The cap is here rather than at the field's own call
 *  site because these end up in somebody else's system — Toast's ticket, an
 *  Uber dropoff note — and both have limits of their own. */
function readText(body: unknown, key: string, max: number): string {
  const value = (body as Record<string, unknown> | null)?.[key];
  return typeof value === "string" ? value.trim().slice(0, max) : "";
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
    return Response.json({ error: "api.badJson" }, { status: 400 });
  }

  const body = payload as
    | { name?: unknown; email?: unknown; phone?: unknown; items?: unknown }
    | null;

  const { name, email } = body ?? {};
  if (!isNonEmptyString(name) || !isValidEmail(email)) {
    return Response.json(
      { error: "api.fillNameEmail" },
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
          : `There isn't time to make that before we close at ${closeLabel()}.`,
      },
      { status: 409 },
    );
  }

  const rawItems = body?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return Response.json({ error: "api.cartEmpty" }, { status: 400 });
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
      return Response.json({ error: "api.invalidCartItem" }, { status: 400 });
    }
    const product = getProduct(slug);
    if (!product) {
      return Response.json({ error: "api.invalidCartItem" }, { status: 400 });
    }
    // Gone since the basket was filled. 409 rather than 400: the request is
    // well-formed, the world moved.
    if (soldOut(slug)) {
      // Every sold-out line, not the first one found.
      //
      // Refusing one at a time is a loop the customer has to run: pay, get
      // refused, remove that line, pay, get refused again. The whole basket
      // is already in front of us, so the whole answer goes back at once and
      // the client can clear all of them in a single step.
      //
      // The slugs travel too. Without them the browser is told a name in a
      // sentence and has to match it back against its own lines by string —
      // in ten languages, against a name the endpoint wrote in English.
      const gone = rawItems
        .map((raw) => (raw as { slug?: unknown })?.slug)
        .filter((s): s is string => typeof s === "string" && soldOut(s));
      return Response.json(
        {
          error: "api.soldOutNow",
          soldOut: [...new Set(gone)],
        },
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

  // ——— What the driver is told ———
  //
  // Separate from `note` below, which is the kitchen's. They used to be the
  // same string sent to both, so "no onions" reached the courier and "gate
  // code 4432" reached the baker, and the one instruction that decides whether
  // a bag arrives had to compete for 255 characters with a food request.
  //
  // The unit is the important half. A geocoder resolves a building; "Apt 4B"
  // is the part it cannot know, and until the checkout asked for it a driver
  // in a forty-unit block had a street number and a phone call to make.
  const deliveryDetail = readText(body, "deliveryDetail", 60);
  const courierNote = readText(body, "courierNote", 200);
  const leaveAtDoor = (body as { handoff?: unknown })?.handoff === "door";

  if (forDelivery) {
    if (!deliveryAddress) {
      return Response.json({ error: "api.missingAddress" }, { status: 400 });
    }
    if (!isUberConfigured()) {
      return Response.json(
        { error: "api.deliveryDownPickupOpen" },
        { status: 503 },
      );
    }

    // The counter, resolved from its address rather than the coordinates
    // typed beside it. This is what the courier is sent to. See
    // storePlaces.ts.
    const origin = await deliveryOrigin();

    const place = await geocode(deliveryAddress, origin);
    if (!place) {
      return Response.json({ error: "api.addressNotFound" }, { status: 400 });
    }
    dropoff = place;

    const fresh = await quoteDelivery({
      pickupAddress: structuredAddress(SHOP_ADDRESS_PARTS),
      pickupLat: origin[0],
      pickupLng: origin[1],
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
            ? "api.noCourierPickupOpen"
            : "api.couldNotArrangeDelivery",
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
        { error: "api.orderSendFailed" },
        { status: 502 },
      );
    }

    // On the counter now, for the busyness line the next customer sees. After
    // the kitchen has accepted it, never before — an order that Toast refused
    // is not work anybody is doing.
    //
    // Written even though this branch means Toast is connected, and
    // /api/kitchen-load therefore reads the count from Orders Hub instead. One
    // insert per order to keep the fallback table true rather than empty: a
    // fallback that has been silently accumulating nothing is not a fallback,
    // it is a second outage waiting behind the first.
    await joinQueue(sent.orderGuid, sent.orderGuid);

    return Response.json(
      {
        ok: true,
        totals,
        orderGuid: sent.orderGuid,
        // Same value as orderGuid here, and named separately on purpose: the
        // client asks about its place in the line with this, and it should
        // not have to know that the queue happens to be keyed by Toast's id
        // on one path and by something we made up on the other.
        queueId: sent.orderGuid,
        // When the shop says it will be ready, from Toast rather than from
        // our own fixed estimate. Absent when Toast didn't send one, and the
        // client falls back exactly as before.
        ...(sent.readyAt === undefined ? {} : { readyAt: sent.readyAt }),
        submitted: "toast",
        ...(await bookCourier()),
      },
      { status: 200 },
    );
  }

  // No Toast, so no guid and nothing to close this row later — it ages out on
  // the clock instead. Still counted: the food is being made either way, and a
  // queue that only works once Toast is connected is a queue that reads clear
  // through the exact period the shop is running on this path.
  // Handed back, unlike before. This id used to be generated here and thrown
  // away, which meant the row existed and nothing could ever point at it —
  // fine while the only question was how many rows there were, useless the
  // moment a customer wants to know where *theirs* sits. On the Toast path
  // the guid does this job and is already returned.
  const queueId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await joinQueue(queueId);

  return Response.json(
    { ok: true, totals, submitted: "logged", queueId, ...(await bookCourier()) },
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
    deliveryId?: string;
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
      // English, and deliberately: this is read by a courier standing on a
      // Los Angeles pavement, not by the customer. The handoff is stated
      // either way rather than only when it's "leave it" — a driver who is
      // told nothing about a handoff decides for himself.
      dropoffNote:
        [
          deliveryDetail ? `Unit: ${deliveryDetail}` : null,
          leaveAtDoor ? "Leave at the door." : "Hand it to the customer.",
          courierNote || null,
        ]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 280) || undefined,
      // The choices travel with the item. Toast has always had them as
      // modifiers; Uber was getting the bare product name, so a courier's
      // screen read "Egg & Schmear" for an order that specified a bagel and a
      // spread. priceCents already includes the upcharge, so the manifest was
      // showing the right money for the wrong item.
      items: items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        priceCents: item.priceCents,
        options: item.optionsLabel,
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
      // Uber's id for the courier's job. Kept for the same reason as Toast's
      // order guid: it is the handle the delivery half of the tracker asks
      // about, and it was being dropped here exactly as the guid was dropped
      // in the checkout.
      deliveryId: booked.delivery.deliveryId,
    };
  }
}
