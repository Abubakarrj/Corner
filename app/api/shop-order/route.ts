import {
  describeOptions,
  getProduct,
  normalizeOptions,
  soldOut,
  unitPriceCents,
  type SelectedOptions,
} from "../../shop/products";
import { totalsFor } from "../../shop/money";
import { isOpenNow, minutesUntilClose, nextOpening } from "../../shopFacts";
import { createToastOrder, isToastConfigured } from "../../toast";

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
  const PREP_MINUTES = 12;
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

  const totals = totalsFor({ subtotalCents, tipCents });

  const order: Order = {
    name: name.trim(),
    email: email.trim(),
    phone: typeof body?.phone === "string" ? body.phone.trim() : "",
    items,
    subtotalCents,
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
      diningOption:
        (body as { fulfillment?: { mode?: unknown } })?.fulfillment?.mode === "delivery"
          ? "delivery"
          : order.curbside
            ? "curbside"
            : "pickup",
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
      { ok: true, totals, orderGuid: sent.orderGuid, submitted: "toast" },
      { status: 200 },
    );
  }

  return Response.json({ ok: true, totals, submitted: "logged" }, { status: 200 });
}
