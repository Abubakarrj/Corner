import { cookies } from "next/headers";
import { SESSION_COOKIE, readSession } from "../../auth/auth0";
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
import {
  attachPosCourier,
  createPosOrder,
  isPosConfigured,
  posName,
  type PosOrderDraft,
} from "../../pos";
import { chargeSquare, isSquarePaymentsConfigured, refundSquare } from "../../squarePayments";
import { geocode } from "../../googleMaps";
import {
  createDelivery,
  isUberConfigured,
  quoteDelivery,
  structuredAddress,
  uberCourier,
} from "../../uberDirect";
import {
  deliveryOrigin,
  deliveryStoreFor,
  earliestDeliveryHour,
} from "../../storePlaces";
import { notServedAt, storeById } from "../../shop/storeMenu";
import {
  addressParts,
  opensAt,
  type StoreLocation,
} from "../../(marketing)/locations/locations";
import { recordDemand } from "../../demand";
import { claim } from "../../pickupSchedule";
import { releaseSlot } from "../../scheduledPickups";
import { joinQueue } from "../../kitchenQueue";
import { earn } from "../../rewards";
import { refreshSoldOut } from "../../soldOut";

// Order intake, behind /checkout on the shop subdomain.
//
// Everything about money is recomputed here. The client sends what it thinks
// the order costs so the two can be compared, but nothing it sends is
// believed: prices come from the catalog, tax and totals come from
// app/shop/money.ts, and the tip is the one number taken as given — because
// it is genuinely the customer's to name — clamped to something sane.
//
// When a till is configured — Square or Toast, see app/pos.ts — the order goes
// to it. When it isn't, the order is logged and the shop is told by other
// means, which is what happens today. Either way the response says which, so
// nobody has to guess whether the kitchen actually heard about it.

function isNonEmptyString(input: unknown): input is string {
  return typeof input === "string" && input.trim().length > 0;
}


/** A free-text field off the request: trimmed, capped, and "" for anything
 *  that isn't a string. The cap is here rather than at the field's own call
 *  site because these end up in somebody else's system — the till's ticket, an
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
  /** The signed-in account's address, or "" for a guest.
   *
   *  ——— Not from the request ———
   *
   *  This used to be a field in the body, and the rewards ledger was keyed off
   *  it: `earn(order.email, ...)`. So the address that collected the points was
   *  free text a caller chose, and anybody could post an order and credit
   *  somebody else's account with it. It is read from the session cookie now,
   *  which is a signed JWT script cannot forge — the same rule /api/orders
   *  already follows about whose history it will hand over.
   *
   *  Empty is an ordinary state, not a failure: most people ordering breakfast
   *  are not signed in. It costs them points and cross-device history, and
   *  costs the order nothing. */
  email: string;
  /** How the shop reaches them, and required now that the email is not.
   *
   *  The kitchen rings when something sells out from under an order, and a
   *  courier outside a locked lobby rings before giving up — Uber is handed
   *  this as dropoff_phone_number. */
  phone: string;
  items: OrderItem[];
  subtotalCents: number;
  // What the customer paid for the courier, and what the courier cost. They
  // differ when the order cleared the free-delivery threshold: Uber is booked
  // and billed at the quote either way, and the shop absorbs it. The record
  // keeps both so that difference is visible rather than showing up as a zero
  // nobody can reconcile against the Uber invoice.
  deliveryCents: number;
  deliveryQuotedCents: number;
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
    `[shop-order] order from ${order.name}, phone=${order.phone}` +
      `${order.email ? ` <${order.email}>` : " (guest)"}\n${lines}\n` +
      `  Subtotal: $${(order.subtotalCents / 100).toFixed(2)}` +
      `  Tip: $${(order.tipCents / 100).toFixed(2)}` +
      `  Total: $${(order.totalCents / 100).toFixed(2)}` +
      (extras ? `\n  ${extras}` : ""),
  );
}

export async function POST(request: Request) {
  // What's off the board, before the basket is checked against it. This is the
  // check that actually stops an order for something the kitchen ran out of,
  // so it has to be reading today's list rather than whatever shipped in the
  // bundle. Cached for thirty seconds; see app/soldOut.ts.
  await refreshSoldOut();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "api.badJson" }, { status: 400 });
  }

  const body = payload as
    | { name?: unknown; phone?: unknown; items?: unknown }
    | null;

  const { name, phone } = body ?? {};
  // A name and a number the shop can ring. Ten digits after the punctuation,
  // matching the checkout's own test — see the note on PHONE_DIGITS in
  // useCheckout.ts for why this is deliberately loose.
  const digits = typeof phone === "string" ? (phone.match(/\d/g) ?? []).length : 0;
  if (!isNonEmptyString(name) || !isNonEmptyString(phone) || digits < 10) {
    return Response.json(
      { error: "api.fillNamePhone" },
      { status: 400 },
    );
  }

  // Whose account this order belongs to, from the cookie rather than the body.
  // Null for a guest, which is fine and common — see the note on Order.email.
  const account = await readSession((await cookies()).get(SESSION_COOKIE)?.value);

  // ——— Which counter this is going to ———
  //
  // Read before the loop because every line is checked against it. Only
  // pickup and catering name a counter: a delivery leaves from the kitchen,
  // which makes everything, so its absence here is the correct answer rather
  // than a missing field.
  //
  // This is the half of the counter's menu that a customer cannot skip. The
  // catalog hiding a sandwich at the outlet is a courtesy; a request can be
  // typed by hand, replayed from a basket filled at the other counter, or
  // built by a client that has not caught up with the menu, and the kitchen
  // has to be able to make whatever this returns 200 for.
  const orderAt = (() => {
    const raw = (payload as { fulfillment?: { mode?: unknown; locationId?: unknown } })
      ?.fulfillment;
    if (raw?.mode !== "pickup" && raw?.mode !== "catering") return null;
    return typeof raw.locationId === "string" ? raw.locationId : null;
  })();

  // Closed means closed. The checkout disables its own button, but that is a
  // courtesy to the person using it — this is the rule, and it's here because
  // a request doesn't have to come from the form.
  //
  // PREP_MINUTES of headroom, because being open at 1:58pm is not the same as
  // being able to make something before 2.
  //
  // Against the chosen counter's own hours, not the shop's. The full stores
  // open at 7 and the Western Ave outlet at 11, so a pickup from Western at
  // 8am is a request for a shut door — and the four hours between them is
  // long enough that somebody really would stand outside one.
  //
  // A delivery has no counter here and falls back to the usual hour. That is
  // the right answer rather than a gap: which kitchen a delivery leaves from
  // is decided further down from the basket and the address, and the earliest
  // any of them opens is the honest bound on whether an order can be made at
  // all.
  //
  // ——— A delivery asks a different question ———
  //
  // Not "is the shop open" but "is there a kitchen that is open and can make
  // this", which for a delivery is the same question. The counter it leaves
  // from is chosen from the basket and the address further down, and the
  // choice is only real if something is lit: at 8am with a bagel in the
  // basket the outlet is dark and Wilshire is open, so there is one; a
  // sandwich at 8am has only ever had one kitchen and it is open; and before
  // 7 there is none.
  //
  // So a delivery is gated on the earliest hour any kitchen that could make
  // this basket opens, rather than on a counter it has not been assigned to.
  // Read from the payload here rather than from the bindings further down:
  // this gate runs before the basket is parsed, deliberately, so a request
  // that arrives at 3am is refused without the endpoint doing any of the work
  // of understanding it.
  const isDelivery =
    (payload as { fulfillment?: { mode?: unknown } })?.fulfillment?.mode === "delivery";
  const orderSlugs = Array.isArray(body?.items)
    ? (body.items as unknown[])
        .map((line) => (line as { slug?: unknown })?.slug)
        .filter((value): value is string => typeof value === "string")
    : [];
  const counterOpensAt = isDelivery
    ? earliestDeliveryHour(orderSlugs)
    : opensAt(storeById(orderAt));

  // ——— Shut is no longer the end of the conversation ———
  //
  // For a pickup at a named counter it is the start of a different one: the
  // order is taken and given a time, rather than refused. See
  // app/pickupSlots.ts for why that time is handed out rather than accepted,
  // and app/pickupSchedule.ts for where the two halves meet.
  //
  // The seat is claimed further down — after the basket has been priced and
  // checked, and immediately before the order goes to the kitchen — so a
  // request that is going to be refused for a sold-out bagel does not take a
  // slot on the way past. This is only the decision that it is going to be
  // scheduled.
  //
  // ⚠️ Delivery is still refused, and that is not an oversight.
  //
  // A courier cannot be booked for tomorrow morning from here: Uber quotes
  // are minutes-fresh and the whole delivery path — quote, fee comparison,
  // dispatch — is built around a ride that starts now. Scheduling a delivery
  // means holding an order overnight and quoting at dawn, which is a piece of
  // machinery this endpoint does not have. Somebody who wants breakfast
  // tomorrow can schedule a pickup; somebody who wants it delivered orders in
  // the morning.
  //
  // Pickup only, not catering. A catering order is a tray for twenty arranged
  // days ahead by a person; putting one in a ten minute slot meant for a bagel
  // would be scheduling in name and overbooking in fact. orderAt covers both
  // modes, so the mode is read again here rather than inferred from it.
  const isPickup =
    (payload as { fulfillment?: { mode?: unknown } })?.fulfillment?.mode === "pickup";
  const counterStore = isPickup ? storeById(orderAt) : null;
  const openNow =
    isOpenNow(new Date(), counterOpensAt) &&
    minutesUntilClose(new Date(), counterOpensAt) >= PREP_MINUTES;
  const scheduling = !openNow && counterStore !== null;

  if (!openNow && !scheduling) {
    const next = nextOpening(new Date(), counterOpensAt);
    return Response.json(
      {
        error: next
          ? `We're closed right now — we open ${next}.`
          : `There isn't time to make that before we close at ${closeLabel()}.`,
      },
      { status: 409 },
    );
  }

  // The time the customer was shown and agreed to. Absent is answered with a
  // time rather than with an order — see claim() in pickupSchedule.ts.
  const wantedSlot = (() => {
    const raw = (body as { scheduledFor?: unknown })?.scheduledFor;
    if (typeof raw !== "string") return null;
    const at = new Date(raw);
    return Number.isNaN(at.getTime()) ? null : at;
  })();

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
    // Not made at this counter. 409 for the same reason sold-out is: the
    // request is well-formed and the world it was built against is not the
    // one it arrived in — a basket filled at Wilshire, then pointed at the
    // outlet on Western.
    //
    // The whole list at once, and the slugs with it, exactly as above. The
    // client clears them in one step and does not have to match a sentence
    // back against its own lines in ten languages.
    const notHere = notServedAt(orderAt, [
      ...new Set(
        rawItems
          .map((line) => (line as { slug?: unknown })?.slug)
          .filter((value): value is string => typeof value === "string"),
      ),
    ]);
    if (notHere.length > 0) {
      return Response.json(
        { error: "api.notAtCounter", notAtCounter: notHere },
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
  const fulfillment = (
    body as {
      fulfillment?: { mode?: unknown; address?: unknown; lat?: unknown; lng?: unknown };
    }
  )?.fulfillment;
  const forDelivery = fulfillment?.mode === "delivery";
  const deliveryAddress =
    typeof fulfillment?.address === "string" ? fulfillment.address.trim() : "";

  // ⚠️ The pin, and this is the hop where losing it costs the most.
  //
  // Everything upstream — the range check, the fee, the ETA — is a number on a
  // screen. This one books a courier and tells them where to drive. Geocoding
  // the address here instead would mean the customer placed a point, was
  // quoted against it, and then had a dispatch sent to Google's idea of the
  // words: the fee they agreed to and the doorway they get would be measured
  // to two different places.
  //
  // Validated rather than trusted. It arrives through the browser like
  // everything else in this body, and a coordinate that came through the
  // browser is one the browser can change — an out-of-band pair falls back to
  // the geocoder, which is where a delivery saved before the picker existed
  // goes anyway.
  const pinLat = Number(fulfillment?.lat);
  const pinLng = Number(fulfillment?.lng);
  const pinned =
    Number.isFinite(pinLat) &&
    Number.isFinite(pinLng) &&
    Math.abs(pinLat) <= 90 &&
    Math.abs(pinLng) <= 180;

  let deliveryCents = 0;
  let deliveryQuoteId: string | null = null;
  let dropoff: { address: string; lat: number; lng: number } | null = null;
  // Which counter the courier collects from. Settled when the quote is taken
  // and reused when the delivery is booked, so the two name the same shop —
  // re-deriving it at booking time would be two chances to pick differently.
  let pickupStore: StoreLocation | null = null;
  // And where that counter is. Carried alongside the store rather than
  // re-derived at booking time, so the point the quote was priced from is the
  // point the courier is sent to.
  let pickupPoint: [number, number] | null = null;
  // The one handle this order is known by, written onto Uber's copy of it as
  // external_id. The till's id where a till is connected, the queue id where
  // it isn't — the same string the client polls the tracker with and the
  // kitchen queue is keyed on, so a delivery on Uber's dashboard can be traced
  // back to an order here without a fourth identifier to keep in step.
  //
  // Set on both paths before bookCourier() runs. It cannot read `queueId`
  // directly: that const is declared after the till branch returns, and the
  // till path calls bookCourier() above it.
  let reference: string | null = null;

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
    // typed beside it, and chosen against where this order is going. This is
    // what the courier collects from. See storePlaces.ts.
    const biasedTo: [number, number] | undefined = pinned ? [pinLat, pinLng] : undefined;
    const place = pinned
      ? { address: deliveryAddress, lat: pinLat, lng: pinLng }
      : await geocode(deliveryAddress, await deliveryOrigin());
    if (!place) {
      return Response.json({ error: "api.addressNotFound" }, { status: 400 });
    }
    dropoff = place;

    // The basket rides along. Nearest is not enough now that both counters
    // deliver and one of them does not make sandwiches — see kitchensFor in
    // storePlaces.ts.
    const { store, place: counter } = await deliveryStoreFor(
      biasedTo ?? [place.lat, place.lng],
      items.map((item) => item.slug),
    );
    const origin = counter.position;
    pickupStore = store;
    pickupPoint = origin;

    const fresh = await quoteDelivery({
      pickupAddress: structuredAddress(addressParts(store)),
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
    email: account?.email ?? "",
    phone: phone.trim(),
    items,
    subtotalCents,
    deliveryCents: totals.deliveryCents,
    deliveryQuotedCents: totals.deliveryQuotedCents,
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

  // ——— The seat ———
  //
  // Taken here: after everything that could refuse this order has had its
  // say, and before the kitchen hears about it. Earlier would hold a time for
  // an order about to be turned away for a sold-out bagel; later would mean
  // the confirmation screen was written before the shop agreed to the minute
  // printed on it.
  //
  // The id is this order's own handle, generated here because neither the
  // till's id nor the queue id exists yet — and it is what the seat is
  // released by if the kitchen refuses the order below.
  const scheduleId = `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let scheduledFor: Date | null = null;
  if (scheduling && counterStore) {
    const held = await claim(scheduleId, counterStore, wantedSlot);
    if (!held.ok) {
      if (held.reason === "full") {
        return Response.json({ error: "api.scheduleFull" }, { status: 409 });
      }
      if (held.reason === "unreadable") {
        return Response.json({ error: "api.scheduleUnavailable" }, { status: 503 });
      }
      // Moved. Not an error the customer did anything to cause — the time
      // they were shown went while they were typing a card number — so it
      // goes back with the new one attached and the checkout redraws rather
      // than saying no.
      return Response.json(
        {
          error: "api.scheduleChanged",
          scheduledFor: held.at.toISOString(),
          slots: held.slots.map((at) => at.toISOString()),
        },
        { status: 409 },
      );
    }
    scheduledFor = held.at;
  }

  // ——— The money ———
  //
  // Here, and in this order, for a reason worth stating plainly.
  //
  // Charging *before* the kitchen is told means a declined card stops the order
  // while nothing has happened yet: no ticket, no bagels, nothing to cancel. A
  // decline is the common failure by a wide margin, and this is the ordering
  // that makes the common failure free.
  //
  // The rare failure is the other way round — paid, and then the till refuses —
  // and that one is handled below by giving the money back rather than by
  // hoping. It is rare because everything that could refuse this order has
  // already run: the repricing, the opening hours, the sold-out check, the
  // delivery quote, and the seat.
  //
  // ⚠️ `paymentToken` is a single-use token from Square's hosted fields. The
  // card number is not in this request and never has been. See the note at the
  // top of app/squarePayments.ts.
  const paymentToken = readText(body, "paymentToken", 1024);
  const verificationToken = readText(body, "verificationToken", 2048) || undefined;
  let payment: Awaited<ReturnType<typeof chargeSquare>> | null = null;

  // ⚠️ Only when the customer chose to pay now.
  //
  // This read `if (isSquarePaymentsConfigured())` and demanded a token from
  // every order — which broke "pay at the window" completely the moment Square
  // was configured. Somebody choosing to pay at the counter sends no token,
  // correctly, and was told their card could not be read.
  //
  // Paying at the window is not an unpaid order; it is the tender this shop has
  // always had, settled when the bag is handed over. The only thing that has to
  // be true is that an order claiming it will pay *now* actually carries the
  // means to.
  const payingNow = readText(body, "tender", 16) === "card";

  if (isSquarePaymentsConfigured() && payingNow) {
    if (!paymentToken) {
      // Says it is paying now and brought nothing to pay with. That is a broken
      // client rather than a choice, and confirming it would promise the
      // customer a charge that never happened.
      if (scheduledFor) await releaseSlot(scheduleId);
      return Response.json({ error: "api.paymentRequired" }, { status: 402 });
    }

    payment = await chargeSquare({
      sourceId: paymentToken,
      // ⚠️ Our number, from totalsFor() above, never the browser's. The client
      // sends a tip and a quote id; it does not send a total, and if it did it
      // would not be read.
      amountCents: order.totalCents,
      reference: scheduleId,
      ...(orderAt ? { counter: orderAt } : {}),
      ...(order.email ? { buyerEmail: order.email } : {}),
      ...(verificationToken ? { verificationToken } : {}),
    });

    if (!payment.ok) {
      console.error(`[shop-order] payment failed: ${payment.reason}`);
      if (scheduledFor) await releaseSlot(scheduleId);
      // Two different sentences for two different situations. "Your card was
      // declined" to somebody whose card is fine is how a working card gets cut
      // up, so a failure that is ours says so.
      return Response.json(
        { error: payment.declined ? "api.cardDeclined" : "api.paymentFailed" },
        { status: payment.declined ? 402 : 502 },
      );
    }
  }

  /** Give the money back, for the one path that can take it and then fail.
   *
   *  Only ever called after a successful charge whose order did not go
   *  through. refundSquare logs loudly on its own failure, because at that
   *  point somebody has to open the Square dashboard. */
  async function undoPayment(): Promise<void> {
    if (payment?.ok) await refundSquare(payment.paymentId, order.totalCents, scheduleId);
  }

  // The till, when it's there. The draft is built from the repriced order,
  // never from the request, so what the kitchen is told and what the customer
  // was shown come from the same numbers.
  if (isPosConfigured()) {
    const [firstName, ...rest] = order.name.split(/\s+/);
    // Held in a const rather than passed inline: the courier is booked after
    // the order is placed, and attaching its id to the till's copy means
    // rebuilding the same fulfillment rather than a partial patch of it.
    const posDraft: PosOrderDraft = {
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
      // A scheduled order, told to the till twice on purpose: as the pickup
      // time its own scheduling reads, and in the ticket note, which is what
      // the person at the counter reads. Either one alone is a single point of
      // failure for the one fact that matters — that this bag is not for now.
      //
      // The reference goes up with it, and only here: it is the handle the
      // seat is held under, so a ticket for a time slot can be matched back to
      // the slot it occupies. An ordinary order has no such handle before the
      // till answers, and the till's own id becomes it.
      ...(scheduledFor ? { promisedAt: scheduledFor, reference: scheduleId } : {}),
      // Who is driving, on a delivery. The till records a courier somebody else
      // arranged rather than arranging one, so without this its copy of the
      // order describes a delivery the shop is making itself.
      ...(forDelivery && uberCourier() ? { courier: uberCourier()! } : {}),
      ...(orderAt ? { counter: orderAt } : {}),
    };
    const sent = await createPosOrder(posDraft);

    if (!sent.ok) {
      // The order did not reach the kitchen. Saying "you're all set" here
      // would send somebody to a counter that has never heard of them, so
      // this fails loudly instead.
      console.error(`[shop-order] ${posName() ?? "pos"} submission failed: ${sent.reason}`);
      // And give the money back. This is the one path in the whole checkout
      // that can have taken a payment for food nobody is going to make, which
      // is exactly why the refund is not optional and not deferred.
      await undoPayment();
      // And give the time back. A seat held for an order the kitchen refused
      // is a slot nobody can buy and nobody is coming for.
      if (scheduledFor) await releaseSlot(scheduleId);
      return Response.json(
        { error: "api.orderSendFailed" },
        { status: 502 },
      );
    }

    // On the counter now, for the busyness line the next customer sees. After
    // the kitchen has accepted it, never before — an order the till refused is
    // not work anybody is doing.
    //
    // Written even though this branch means a till is connected, and
    // /api/kitchen-load therefore reads the count from the till instead. One
    // insert per order to keep the fallback table true rather than empty: a
    // fallback that has been silently accumulating nothing is not a fallback,
    // it is a second outage waiting behind the first.
    await joinQueue(sent.orderId, sent.orderId);
    await countDemand();
    // Points, on the subtotal, keyed to this order so a retry cannot pay
    // twice. Awaited but incapable of failing the order — see earn().
    //
    // Only for a signed-in customer. A guest has no account to credit, and
    // inventing one from a typed-in address is exactly what this stopped
    // doing.
    if (order.email) await earn(order.email, sent.orderId, subtotalCents);
    reference = sent.orderId;

    return Response.json(
      {
        ok: true,
        totals,
        orderGuid: sent.orderId,
        // Same value as orderGuid here, and named separately on purpose: the
        // client asks about its place in the line with this, and it should
        // not have to know that the queue happens to be keyed by the till's id
        // on one path and by something we made up on the other.
        queueId: sent.orderId,
        // When the shop says it will be ready, from the till rather than from
        // our own fixed estimate. Absent when the till didn't send one, and
        // the client falls back exactly as before.
        ...(sent.readyAt === undefined ? {} : { readyAt: sent.readyAt }),
        // The time the shop agreed to, for an order placed while the counter
        // was shut. Absent on every ordinary order, which is what tells the
        // confirmation screen to talk about minutes rather than about a
        // morning.
        ...(scheduledFor ? { scheduledFor: scheduledFor.toISOString() } : {}),
        // Which till heard about it, by name. "toast" until this line, which
        // was true when Toast was the only one and is a lie the moment Square
        // is connected — and this field exists precisely so nobody has to
        // guess where an order went.
        submitted: posName() ?? "pos",
        ...(await courierFor(posDraft, sent)),
      },
      { status: 200 },
    );
  }

  // No till, so no id from one and nothing to close this row later — it ages
  // out on the clock instead. Still counted: the food is being made either
  // way, and a queue that only works once a till is connected is a queue that
  // reads clear through the exact period the shop is running on this path.
  // Handed back, unlike before. This id used to be generated here and thrown
  // away, which meant the row existed and nothing could ever point at it —
  // fine while the only question was how many rows there were, useless the
  // moment a customer wants to know where *theirs* sits. On the till path the
  // till's own id does this job and is already returned.
  const queueId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await joinQueue(queueId);
  await countDemand();
  // Same on this path. The ref is the queue id rather than the till's id,
  // which is the only handle this branch has — and it is the one the client
  // gets back, so the two agree about which order was paid for.
  if (order.email) await earn(order.email, queueId, subtotalCents);
  reference = queueId;

  return Response.json(
    {
      ok: true,
      totals,
      submitted: "logged",
      queueId,
      ...(scheduledFor ? { scheduledFor: scheduledFor.toISOString() } : {}),
      ...(await bookCourier()),
    },
    { status: 200 },
  );

  // ——— Counted, once the kitchen has it ———
  //
  // After the order is real and never before: an order Toast refused is not
  // demand that was served, and counting it would put a phantom on the map the
  // shop plans from.
  //
  // A delivery is filed where it went. A pickup and a catering order are filed
  // at the counter's own coordinates — the customer never says where they
  // live and this does not ask, so the honest location of that demand is the
  // shop it was collected from. See app/demand.ts.
  async function countDemand(): Promise<void> {
    if (forDelivery) {
      if (!dropoff) return;
      await recordDemand({
        mode: "delivery",
        outcome: "placed",
        channel: "order",
        at: [dropoff.lat, dropoff.lng],
        ...(pickupStore ? { counter: pickupStore.id } : {}),
      });
      return;
    }
    const store = storeById(orderAt);
    if (!store) return;
    await recordDemand({
      mode: fulfillment?.mode === "catering" ? "catering" : "pickup",
      outcome: "placed",
      channel: "order",
      at: store.position,
      counter: store.id,
    });
  }

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
  /** bookCourier, then tell the till who is driving.
   *
   *  Two records that each knew half the delivery is what this closes: after
   *  it, Square's copy of the order names Uber's job and Uber's copy names the
   *  order. Only on the till path, because it is the only one with an order id
   *  and a version to update against.
   *
   *  Not awaited, and it must not be. The customer is waiting on this response,
   *  the order is already placed and the courier is already booked; a slow or
   *  refused write to Square cannot be allowed to hold up or change any of
   *  that. It logs and that is all. */
  async function courierFor(
    draft: PosOrderDraft,
    placed: { orderId: string; version?: number; fulfillmentUid?: string },
  ): Promise<{ trackingUrl?: string; deliveryId?: string; deliveryBooked?: boolean }> {
    const booked = await bookCourier();
    if (booked.deliveryId) {
      void attachPosCourier(draft, placed, booked.deliveryId).catch(() => false);
    }
    return booked;
  }

  async function bookCourier(): Promise<{
    trackingUrl?: string;
    deliveryId?: string;
    deliveryBooked?: boolean;
  }> {
    if (!forDelivery || !deliveryQuoteId || !dropoff || !pickupPoint) return {};

    const [firstName, ...rest] = order.name.split(/\s+/);
    const booked = await createDelivery({
      quoteId: deliveryQuoteId,
      pickupName: pickupStore ? `Corner Bagel ${pickupStore.name}` : "Corner Bagel",
      pickupAddress: structuredAddress(
        pickupStore ? addressParts(pickupStore) : SHOP_ADDRESS_PARTS,
      ),
      pickupPhone: SHOP_PHONE,
      // The same two points the quote was priced between. Without them Uber
      // geocodes the address strings itself and the courier goes wherever
      // that lands, which is not necessarily where any of this was measured.
      // See the note in uberDirect.ts.
      pickupLat: pickupPoint[0],
      pickupLng: pickupPoint[1],
      // The name, and it is always there — the endpoint refuses an order
      // without one. The old fallback here was the email address, which a
      // guest no longer has and which was never a thing to read out to a
      // courier anyway.
      dropoffName: `${firstName ?? ""} ${rest.join(" ")}`.trim() || order.name,
      dropoffAddress: dropoff.address,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      ...(reference ? { reference } : {}),
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
      // The choices travel with the item. The till has always had them as
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
      // Uber's id for the courier's job. Kept for the same reason as the
      // till's order id: it is the handle the delivery half of the tracker
      // asks about, and it was being dropped here exactly as that id was
      // dropped in the checkout.
      deliveryId: booked.delivery.deliveryId,
    };
  }
}
