import { createHmac, timingSafeEqual } from "node:crypto";
import { refresh } from "../../../orderStatus";

// Toast's guest order fulfillment webhook.
//
// Fires when somebody presses Order Ready in Orders Hub, or when a KDS marks
// an order fulfilled. That press is the most trustworthy signal in this whole
// system: a person looking at a bag on a shelf.
//
// What this endpoint does with the message is refuse to read it. It checks the
// signature, takes the order id, and asks Toast. See the note at the top of
// app/orderStatus.ts for why — briefly, Toast's signing scheme concatenates
// the body with a timestamp in a form I could not pin down from the docs
// available, and a status the customer is shown should not rest on a
// signature check written against a guess.
//
// Node, not edge: HMAC via node:crypto.
export const runtime = "nodejs";
// Never cached, never prerendered — it is a side effect with a 200 attached.
export const dynamic = "force-dynamic";

const SECRET = process.env.TOAST_WEBHOOK_SECRET;

/** Constant-time compare that survives a length mismatch.
 *
 *  timingSafeEqual throws when the buffers differ in length, and an exception
 *  is a timing signal of its own as well as a 500 where a 401 belongs. */
function sameSignature(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Every id in the message that might be an order.
 *
 *  Toast's payload shape for this webhook is one of the things I could not
 *  confirm, so rather than reaching for one path and breaking on another, this
 *  collects anything that looks like a guid and refreshes each. Refreshing an
 *  id that turns out not to be an order costs one Toast call that returns
 *  nothing, and refreshing an id we have never seen writes nothing, because
 *  the store only keeps what Toast recognises.
 *
 *  When somebody has watched a real message arrive, this can become a single
 *  documented path. Until then, breadth is what makes it work on the first
 *  real order rather than the second deploy. */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function guidsIn(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (typeof value === "string") {
    if (GUID.test(value)) found.add(value);
    return found;
  }
  if (Array.isArray(value)) {
    for (const entry of value) guidsIn(entry, found);
    return found;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) guidsIn(entry, found);
  }
  return found;
}

export async function POST(request: Request) {
  // The raw text, before any parsing: a signature is over bytes, and
  // JSON.parse then re-stringify does not reproduce them.
  const raw = await request.text();

  if (!SECRET) {
    console.error("[toast-webhook] TOAST_WEBHOOK_SECRET is not set — message rejected");
    return new Response("not configured", { status: 503 });
  }

  const signature = request.headers.get("toast-signature");
  if (!signature) return new Response("unsigned", { status: 401 });

  // Toast signs the body concatenated with a timestamp from the payload. Both
  // orders are accepted because the documentation available did not settle
  // which, and a plain body-only HMAC is accepted too. This is deliberately
  // the weakest part of the endpoint, and deliberately not load-bearing: what
  // it guards is a Toast API call, not the status a customer sees.
  const stamp = (() => {
    try {
      const body = JSON.parse(raw) as { timestamp?: unknown };
      return typeof body.timestamp === "string" || typeof body.timestamp === "number"
        ? String(body.timestamp)
        : "";
    } catch {
      return "";
    }
  })();
  const candidates = [raw, `${raw}${stamp}`, `${stamp}${raw}`];
  const signed = candidates.some((candidate) =>
    sameSignature(createHmac("sha256", SECRET).update(candidate).digest("base64"), signature),
  );
  if (!signed) {
    console.warn("[toast-webhook] signature did not match — message rejected");
    return new Response("bad signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const ids = [...guidsIn(payload)];
  // Answer first, work second. Toast pauses a subscription that is slow or
  // erroring, and holding the connection open while we call Toast back is how
  // a busy morning turns into a paused subscription.
  const work = Promise.all(ids.map((id) => refresh("toast", id).catch(() => undefined)));
  if (ids.length === 0) {
    console.warn("[toast-webhook] no order id in a verified message");
  } else {
    void work;
  }
  return Response.json({ ok: true }, { status: 200 });
}
