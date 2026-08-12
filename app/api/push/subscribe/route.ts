import { isPushConfigured, publicKey } from "../../../push/send";
import { isPushStoreConfigured, forgetSubscription, saveSubscription } from "../../../push/store";

// Subscribing a device to one order's progress.
//
// GET returns the public VAPID key, which the browser needs before it can
// create a subscription at all. It is public by design — it is the half of the
// pair that identifies this sender to Apple, Google and Mozilla, and it is
// embedded in every subscription any browser makes.
export const runtime = "nodejs";

export function GET() {
  return Response.json({
    // Both have to be true for any of this to work, and they fail
    // independently: keys without a database means nowhere to put the
    // subscription, a database without keys means nothing to sign with.
    enabled: isPushConfigured() && isPushStoreConfigured(),
    key: publicKey(),
  });
}

const MAX_FIELD = 512;

function text(value: unknown, limit = MAX_FIELD): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= limit ? value : null;
}

export async function POST(request: Request) {
  if (!isPushConfigured() || !isPushStoreConfigured()) {
    if (!isPushConfigured()) {
      console.warn(
        "[push] subscribe refused: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and" +
          " VAPID_SUBJECT are all required. Generate a pair with" +
          " `node scripts/vapid-keys.mjs`.",
      );
    }
    if (!isPushStoreConfigured()) {
      console.warn("[push] subscribe refused: DATABASE_URL is not set, so there is nowhere to keep it.");
    }
    return Response.json({ error: "Notifications aren't set up yet." }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const body = (payload ?? {}) as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
    orderId?: unknown;
    toastGuid?: unknown;
    deliveryId?: unknown;
    locale?: unknown;
  };

  // The endpoint is a URL at whichever push service the browser uses, and it
  // is the only thing here that could be pointed somewhere else. Anything that
  // is not https is not a push service.
  const endpoint = text(body.endpoint, 1024);
  if (!endpoint || !endpoint.startsWith("https://")) {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const p256dh = text(body.keys?.p256dh);
  const auth = text(body.keys?.auth);
  const orderId = text(body.orderId, 64);
  if (!p256dh || !auth || !orderId) {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  const saved = await saveSubscription({
    endpoint,
    p256dh,
    auth,
    orderId,
    // The ids the webhooks will know this order by. Absent on an order placed
    // before Toast was wired, and deliveryId is absent on every pickup.
    toastGuid: text(body.toastGuid, 128),
    deliveryId: text(body.deliveryId, 128),
    locale: text(body.locale, 8) ?? "en",
  });
  if (!saved) {
    return Response.json({ error: "Couldn't turn notifications on." }, { status: 502 });
  }
  return Response.json({ ok: true });
}

/** Turning them off, from the device that turned them on. */
export async function DELETE(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const endpoint = text((payload as { endpoint?: unknown })?.endpoint, 1024);
  if (!endpoint) return Response.json({ error: "Bad request." }, { status: 400 });
  await forgetSubscription(endpoint);
  return Response.json({ ok: true });
}
