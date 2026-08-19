import { createHmac, timingSafeEqual } from "node:crypto";
import { refresh } from "../../../orderStatus";

// Square's order webhook.
//
// Fires on `order.updated` and `order.fulfillment.updated` — the second being
// the one that matters, because it is what a person pressing a button on the
// counter's iPad produces. That press is the most trustworthy signal in this
// whole system: somebody looking at a bag on a shelf.
//
// ——— Verified properly, unlike the Toast one ———
//
// The Toast webhook next door checks a signature written against a guess at
// their scheme, and says so in its own comment. Square's is documented and
// implemented in their SDK, so this one is the real thing: HMAC-SHA256 over the
// notification URL concatenated with the raw request body, keyed by the
// subscription's signature key, base64, compared in constant time.
//
// ⚠️ The URL half is why SQUARE_WEBHOOK_URL exists and why it has to match the
// subscription *exactly* — scheme, host, path, no trailing slash unless the
// subscription has one. A correct key and the wrong URL is a signature that
// never matches, and the failure looks identical to a forged request.
//
// ——— And it still refuses to believe the body ———
//
// The message says what changed. This takes the order id out of it and asks
// Square, rather than trusting a state that arrived over the wire. A verified
// signature proves the message came from Square; it does not prove the app's
// parse of a nested payload is right, and the customer-facing claim "your food
// is ready" should rest on an answer we asked for.
//
// Node, not edge: HMAC via node:crypto, and the raw body has to be read as
// text before anything parses it.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function verified(rawBody: string, header: string | null): boolean {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY?.trim();
  const url = process.env.SQUARE_WEBHOOK_URL?.trim();
  // No key, no trust. An unverified webhook that is honoured anyway is an
  // endpoint anybody can use to move somebody's order to "ready".
  if (!key || !url || !header) return false;
  const expected = createHmac("sha256", key).update(url + rawBody).digest("base64");
  return sameSignature(expected, header);
}

export async function POST(request: Request) {
  // Read as text first. Parsing and re-serialising would change the bytes the
  // signature was computed over — a reordered key or a dropped space is enough
  // — so the raw string is the only thing that can be verified.
  const raw = await request.text();

  if (!verified(raw, request.headers.get("x-square-hmacsha256-signature"))) {
    // 401 rather than 404: unlike the read endpoints, this URL is one Square is
    // meant to know about, and hiding it from a caller with a bad signature
    // buys nothing while making a misconfigured subscription harder to debug.
    return new Response(null, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Signed but unreadable. 200 rather than 400: Square retries on a failure
    // status, and retrying a message we will never be able to parse is a loop.
    return new Response(null, { status: 200 });
  }

  // Both event shapes put the order under data.object, one as `order` and one
  // as `order_fulfillment_updated`. Read narrowly and named, rather than by
  // sweeping the payload for anything id-shaped the way the Toast endpoint has
  // to: Square documents this, so there is nothing to guess at.
  const object = (payload as { data?: { object?: Record<string, unknown> } })?.data?.object;
  const id =
    (object?.order as { id?: unknown } | undefined)?.id ??
    (object?.order_fulfillment_updated as { order_id?: unknown } | undefined)?.order_id;

  if (typeof id === "string" && id.length > 0) {
    // Asks Square what the order is now, and writes what comes back. An id we
    // have never seen writes nothing.
    //
    // The kind is "toast" and means "the till" — it picks the food half of the
    // status store and the `toast_guid` column behind the push subscriptions.
    // See the note at the top of app/orderStatus.ts.
    //
    // Answer first, work second, the same as the Toast endpoint next door.
    // Square disables a subscription that keeps timing out, and holding this
    // connection open while we call Square back is how a busy morning turns
    // into a disabled subscription. This process outlives the response — it is
    // a long-running server, not a function that is frozen at return.
    void refresh("toast", id).catch(() => undefined);
  }

  return new Response(null, { status: 200 });
}
