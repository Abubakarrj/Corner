import { createHmac, timingSafeEqual } from "node:crypto";
import { refresh } from "../../../orderStatus";
import { uberWebhookSecret } from "../../../uberDirect";

// Uber Direct's delivery webhook.
//
// event.delivery_status fires whenever the courier moves a stage — assigned,
// collecting, on the way, delivered. Same treatment as the Toast one: verify,
// then ask Uber rather than believing the body.
//
// Uber's signing is unambiguous, unlike Toast's — HMAC-SHA256 of the raw body,
// hex, in X-Postmates-Signature — so the check here is exact. The refresh is
// still a refresh, because there is no reason for the two halves of this
// system to behave differently and every reason for them not to.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameSignature(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const raw = await request.text();

  // Read per request and under either name — see uberWebhookSecret(). It used
  // to be a module-scope const, which meant a value pasted into Render only
  // took effect on the next deploy rather than the next request.
  const secret = uberWebhookSecret();
  if (!secret) {
    console.error("[uber-webhook] UBER_DIRECT_WEBHOOK_SECRET is not set — message rejected");
    return new Response("not configured", { status: 503 });
  }

  const signature = request.headers.get("x-postmates-signature");
  if (!signature) return new Response("unsigned", { status: 401 });
  if (!sameSignature(createHmac("sha256", secret).update(raw).digest("hex"), signature)) {
    console.warn("[uber-webhook] signature did not match — message rejected");
    return new Response("bad signature", { status: 401 });
  }

  let payload: { delivery_id?: unknown; data?: { id?: unknown } } | null;
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    return new Response("bad json", { status: 400 });
  }

  // Uber puts the id at the top level on some events and inside `data` on
  // others. Both are read; neither is trusted for anything but the lookup.
  const id =
    typeof payload?.delivery_id === "string"
      ? payload.delivery_id
      : typeof payload?.data?.id === "string"
        ? payload.data.id
        : null;

  if (id === null) {
    console.warn("[uber-webhook] no delivery id in a verified message");
    return Response.json({ ok: true }, { status: 200 });
  }

  void refresh("uber", id).catch(() => undefined);
  return Response.json({ ok: true }, { status: 200 });
}
