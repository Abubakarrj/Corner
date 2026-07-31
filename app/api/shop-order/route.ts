import { getProduct } from "../../shop/products";

// Placeholder order-intake endpoint behind /checkout on the shop subdomain.
//
// An order that passes validation is logged here, not charged or sent
// anywhere — there's no Toast integration yet. Once Toast's API docs are in
// hand, the real submission (create the order / take payment, however
// Toast's retail API actually shapes that) belongs in onOrder below, same
// "log now, wire the real send later" pattern as app/api/drop-list/route.ts
// and app/api/catering/route.ts.

function isNonEmptyString(input: unknown): input is string {
  return typeof input === "string" && input.trim().length > 0;
}

function isValidEmail(input: unknown): input is string {
  return typeof input === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

type OrderItem = { slug: string; name: string; quantity: number; priceCents: number };
type Order = { name: string; email: string; phone: string; items: OrderItem[]; subtotalCents: number };

function onOrder(order: Order) {
  const lines = order.items
    .map((item) => `  ${item.quantity}x ${item.name} (${item.slug}) — $${(item.priceCents / 100).toFixed(2)} each`)
    .join("\n");
  console.info(
    `[shop-order] order from ${order.name} <${order.email}>, phone=${order.phone || "—"}\n${lines}\n  Subtotal: $${(order.subtotalCents / 100).toFixed(2)}`,
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

  const rawItems = body?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return Response.json({ error: "Your cart is empty." }, { status: 400 });
  }

  // Recompute against the catalog rather than trusting client-submitted
  // prices/subtotal — a tampered request shouldn't be able to check out at
  // an arbitrary price.
  const items: OrderItem[] = [];
  for (const raw of rawItems) {
    const slug = (raw as { slug?: unknown })?.slug;
    const quantity = (raw as { quantity?: unknown })?.quantity;
    if (typeof slug !== "string" || typeof quantity !== "number" || quantity <= 0) {
      return Response.json({ error: "Invalid cart item." }, { status: 400 });
    }
    const product = getProduct(slug);
    if (!product) {
      return Response.json({ error: "Invalid cart item." }, { status: 400 });
    }
    items.push({ slug, name: product.name, quantity, priceCents: product.priceCents });
  }
  const subtotalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);

  onOrder({
    name: name.trim(),
    email: email.trim(),
    phone: typeof body?.phone === "string" ? body.phone.trim() : "",
    items,
    subtotalCents,
  });

  return Response.json({ ok: true }, { status: 200 });
}
