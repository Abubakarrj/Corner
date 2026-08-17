import "server-only";

import { isFinal, messageFor, notifiable, type Alert } from "./messages";
import { notifyDevices } from "./send";
import { forgetOrder, subscriptionsForProvider } from "./store";

// Which status changes are worth a phone buzzing.
//
// ——— Most of them are not ———
//
// The food has five stages and the courier six, and notifying on all eleven
// would mean a phone going off every couple of minutes for a twelve-minute
// order. The test each one has to pass is whether it changes what the person
// should *do*:
//
//   ready         go and get it, or know it is waiting          yes
//   collected     it left the shop, it is coming to you          yes
//   delivered     it is at your door now                         yes
//   voided        something went wrong and you should know       yes
//   canceled      the courier is not coming                      yes
//
//   received      you just placed it; you are looking at it      no
//   cooking       it is doing what you expected it to do         no
//   assigned      a courier exists somewhere                     no
//   collecting    a courier is driving to the shop               no
//   delivering    the same fact as "collected", said again       no
//   done          the order is over; the last word was better    no
//
// That list is in messages.ts, which is also where the copy lives, so adding a
// stage is one edit rather than two that can disagree.

/** Tell the devices watching this provider's id, if this change is worth it.
 *
 *  Never throws and never blocks anything important. It is called from
 *  refresh(), which is called from a webhook that Toast and Uber will retry if
 *  we answer badly — a notification failing must not turn into a provider
 *  deciding our endpoint is broken. */
export async function announce(
  kind: "toast" | "uber",
  providerId: string,
  stage: Alert,
): Promise<void> {
  try {
    if (!notifiable(stage)) return;

    // The webhook knows a Toast guid or an Uber delivery id and nothing else,
    // so this is the lookup a status change actually has to make.
    const devices = await subscriptionsForProvider(kind, providerId);
    if (devices.length === 0) return;
    const orderId = devices[0].orderId;
    const url = `/shop/order/${encodeURIComponent(orderId)}`;
    // One tag per order, so a later update replaces the earlier one on the
    // lock screen instead of stacking three notifications about one bag.
    const tag = `order-${orderId}`;

    // Grouped by language, because the message differs per device. Two people
    // sharing an order on two phones can be reading the app in two languages,
    // and each of them recorded theirs when they turned notifications on.
    const byLocale = new Map<string, typeof devices>();
    for (const device of devices) {
      const group = byLocale.get(device.locale) ?? [];
      group.push(device);
      byLocale.set(device.locale, group);
    }

    await Promise.all(
      [...byLocale].map(([locale, group]) => {
        const { title, body } = messageFor(stage, locale);
        return notifyDevices(group, { title, body, url, tag });
      }),
    );

    // The order is over. The rows are device identifiers with nothing left to
    // be about, so they go.
    if (isFinal(stage)) await forgetOrder(orderId);
  } catch (error) {
    console.error("[push] announce failed:", (error as Error).message);
  }
}
