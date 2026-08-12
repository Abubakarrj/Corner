import "server-only";

import webpush from "web-push";
import { forgetOrder, forgetSubscription, subscriptionsFor } from "./store";

// Sending a notification to a device.
//
// ——— VAPID ———
//
// Three values, and none of them is an account with anybody: a key pair this
// app generates once, and a contact address that push services use to reach a
// human if a sender misbehaves. Apple, Google and Mozilla each run the actual
// delivery; VAPID is only how they know the messages are from us.
//
//   VAPID_PUBLIC_KEY    also sent to the browser — it is public by design
//   VAPID_PRIVATE_KEY   server only
//   VAPID_SUBJECT       mailto: or https:, whoever is responsible
//
// Generate a pair with `node scripts/vapid-keys.mjs`. They must stay stable:
// changing them orphans every subscription already granted, silently, because
// a subscription is bound to the key it was created with.
//
// ——— What this never becomes ———
//
// An order's own progress, and nothing else. Push permission is granted for
// "tell me about my bagels", and a marketing message through that channel is
// the fastest way to have it revoked and the app uninstalled. The drop list is
// where anything promotional belongs, and it is a mailing list somebody opted
// into separately.

export type PushPayload = {
  title: string;
  body: string;
  /** Where tapping it goes. Same-origin path. */
  url: string;
  /** Collapses replacements: a second notification with the same tag replaces
   *  the first rather than stacking. Order progress is one story, so a phone
   *  should show its latest chapter and not four of them. */
  tag: string;
};

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

export function publicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

let armed = false;

function arm(): boolean {
  if (armed) return true;
  if (!isPushConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT as string,
    process.env.VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  );
  armed = true;
  return true;
}

/** Tell every device watching this order.
 *
 *  Never throws. A notification is the least important thing happening at the
 *  moment it is sent — the webhook that triggered it has an order to record
 *  and a customer refreshing a tracker — so a push service having a bad
 *  minute must not turn into a failed webhook that the provider then retries. */
export async function notifyOrder(orderId: string, payload: PushPayload): Promise<number> {
  if (!arm()) return 0;

  const devices = await subscriptionsFor(orderId);
  if (devices.length === 0) return 0;

  const body = JSON.stringify(payload);
  let delivered = 0;

  await Promise.all(
    devices.map(async (device) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: device.endpoint,
            keys: { p256dh: device.p256dh, auth: device.auth },
          },
          body,
          // Long enough to survive a phone in a lift, short enough that a
          // "your order is ready" never arrives the following morning.
          { TTL: 1800 },
        );
        delivered += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404 and 410 are the push service saying this subscription is gone —
        // uninstalled, permission revoked, expired. Keeping it would mean
        // retrying a dead endpoint on every future update.
        if (status === 404 || status === 410) {
          await forgetSubscription(device.endpoint);
        } else {
          console.error(`[push] send failed (${status ?? "no status"}) for one device`);
        }
      }
    }),
  );
  return delivered;
}

/** The order is over. Send the last notification, then drop the rows — they
 *  are device identifiers with nothing left to be about. */
export async function notifyAndClose(orderId: string, payload: PushPayload): Promise<void> {
  await notifyOrder(orderId, payload);
  await forgetOrder(orderId);
}
