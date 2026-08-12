import "server-only";

import type { CourierStage, FoodStage } from "../orderStages";
import { en } from "../i18n/en";
import { notifyOrder, notifyAndClose } from "./send";
import { subscriptionsForProvider } from "./store";

// Which status changes are worth a phone buzzing, and what they say.
//
// ——— Most of them are not ———
//
// The tracker has five stages and the courier has six, and notifying on all
// eleven would mean a customer's phone going off every couple of minutes for a
// twelve-minute order. The test each one has to pass is whether it changes
// what the person should *do*:
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
// ——— The language ———
//
// English, and the reason is uncomfortable but honest: the notification is
// composed here, on the server, from a status change — not in the browser
// where useT() lives. The device's locale is stored with the subscription, so
// this can be per-language, and the string table is already translated ten
// ways. What is missing is a server-side lookup that does not drag the client
// i18n module into a webhook. That is the next piece of work on this, and it
// is a small one; until then a customer who reads the app in Korean gets an
// English notification, which is worth knowing about rather than discovering.

type Announcement = { title: string; body: string; final: boolean };

function foodNews(stage: FoodStage): Announcement | null {
  switch (stage) {
    case "ready":
      return { title: en["push.readyTitle"], body: en["push.readyBody"], final: false };
    case "voided":
      return { title: en["push.voidedTitle"], body: en["push.voidedBody"], final: true };
    default:
      return null;
  }
}

function courierNews(stage: CourierStage): Announcement | null {
  switch (stage) {
    case "collected":
      return { title: en["push.collectedTitle"], body: en["push.collectedBody"], final: false };
    case "delivered":
      return { title: en["push.deliveredTitle"], body: en["push.deliveredBody"], final: true };
    case "canceled":
      return { title: en["push.canceledTitle"], body: en["push.canceledBody"], final: true };
    default:
      return null;
  }
}

/** Tell the devices watching this provider's id, if this change is worth it.
 *
 *  Never throws and never blocks anything important. It is called from
 *  refresh(), which is called from a webhook that Toast and Uber will retry if
 *  we answer badly — a notification failing must not turn into a provider
 *  deciding our endpoint is broken. */
export async function announce(
  kind: "toast" | "uber",
  providerId: string,
  stage: FoodStage | CourierStage,
): Promise<void> {
  try {
    const news =
      kind === "toast"
        ? foodNews(stage as FoodStage)
        : courierNews(stage as CourierStage);
    if (!news) return;

    // One lookup to find which of our orders this is. A device subscribes with
    // both provider ids, so either one finds the row.
    const devices = await subscriptionsForProvider(kind, providerId);
    if (devices.length === 0) return;
    const orderId = devices[0].orderId;

    const payload = {
      title: news.title,
      body: news.body,
      url: `/shop/order/${encodeURIComponent(orderId)}`,
      // One tag per order, so a later update replaces the earlier one on the
      // lock screen instead of stacking three notifications about one bag.
      tag: `order-${orderId}`,
    };

    if (news.final) {
      await notifyAndClose(orderId, payload);
    } else {
      await notifyOrder(orderId, payload);
    }
  } catch (error) {
    console.error("[push] announce failed:", (error as Error).message);
  }
}
