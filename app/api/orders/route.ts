import { cookies } from "next/headers";
import { SESSION_COOKIE, readSession } from "../../auth/auth0";
import { isDatabaseConfigured } from "../../db";
import { ordersFor, saveOrder, type StoredOrder } from "../../orderHistory";

// A signed-in customer's order history.
//
//   GET   this account's orders, newest first
//   POST  keep one
//
// ——— Whose orders ———
//
// The session cookie's, and nothing else. There is no account parameter and no
// way to ask for somebody else's: the email comes from a signed JWT that
// script cannot read or forge, and it is the only thing that decides which
// rows are touched. An endpoint that took an email and returned its orders
// would be a way to read any customer's history by guessing addresses.
//
// Signed out is 204 rather than 401. Not being signed in is the ordinary state
// of most people using this shop — it is not an error, it means there is
// nothing to sync, and a 401 in a console on the home page reads like a bug.

export const dynamic = "force-dynamic";

async function currentEmail(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await readSession(token);
  return session?.email ?? null;
}

export async function GET() {
  if (!isDatabaseConfigured()) return new Response(null, { status: 204 });
  const email = await currentEmail();
  if (!email) return new Response(null, { status: 204 });

  return Response.json({ orders: await ordersFor(email) });
}

// A cap on one request, so a bad client cannot post a megabyte of JSON into a
// row. A real order with a dozen lines is a couple of kilobytes.
const MAX_BYTES = 32_000;

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return new Response(null, { status: 204 });
  const email = await currentEmail();
  if (!email) return new Response(null, { status: 204 });

  let payload: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BYTES) {
      return Response.json({ error: "Too large." }, { status: 413 });
    }
    payload = JSON.parse(text);
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  const order = (payload as { order?: unknown })?.order as StoredOrder | undefined;
  // The two fields this module needs to key and sort by. Everything else is
  // the device's own record, handed back unread — app/account.ts validates the
  // shape when it reads, and it is the only thing that renders it.
  if (
    typeof order !== "object" ||
    order === null ||
    typeof order.id !== "string" ||
    order.id.length === 0 ||
    order.id.length > 64 ||
    typeof order.placedAt !== "number" ||
    !Number.isFinite(order.placedAt)
  ) {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  const saved = await saveOrder(email, order);
  // A history that could not be written is not a failed order. The order is
  // already placed, the kitchen already has it, and the device already has its
  // own copy — so this answers plainly rather than making the checkout think
  // something went wrong.
  return Response.json({ saved });
}
