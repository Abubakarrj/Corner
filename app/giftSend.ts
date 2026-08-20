import "server-only";

import { sendEmail } from "./email";
import { sendSms } from "./sms";
import { giftMessage } from "./giftMessage";
import { giftCardById } from "./squareGiftCards";
import {
  destinationFor,
  markGiftDelivered,
  markGiftFailed,
  pendingGiftDeliveries,
  undeliverable,
  type GiftDelivery,
} from "./giftDelivery";

// Getting an issued gift card to the person it was bought for.
//
// ——— Two callers, one path ———
//
// A card with no date on it is sent by /api/gift-card the moment it is paid
// for. A card bought for a birthday on Saturday is sent by /api/gift-send when
// the cron wakes up on Saturday. Both go through `deliverGiftCard` below, so
// "sent immediately" and "sent four days later" are the same code with a
// different trigger — which is the only way the second one can be trusted,
// since nobody watches it.
//
// ——— ⚠️ What "failed" has to mean here ———
//
// The money was taken before this file ran. So there is no outcome where a card
// quietly stops existing:
//
//   · Square unreachable, Resend down, Twilio filtering — the row stays owed
//     with the reason recorded, and the next run tries again
//   · a send that worked but could not be marked sent is a duplicate on the
//     next run, which is a second copy of a gift rather than none
//
// Both are stated in giftDelivery.ts. This file's job is to never invent a
// third outcome where the row is closed and nothing arrived.
//
// ——— The number ———
//
// Fetched from Square here, used once, dropped. It is not in the row, not in a
// log line, and not in anything this returns. See giftMessage.ts.

export type GiftSendResult =
  | { sent: true }
  | { sent: false; reason: string };

/** Send one card. Marks the row either way. */
export async function deliverGiftCard(delivery: GiftDelivery): Promise<GiftSendResult> {
  const blocked = undeliverable(delivery.method);
  if (blocked) {
    // Should not be reachable — /api/gift-card refuses an undeliverable method
    // before it charges — but a transport switched off after a card was queued
    // gets here, and it has to wait rather than be dropped.
    await markGiftFailed(delivery.id, blocked);
    return { sent: false, reason: blocked };
  }

  const card = await giftCardById(delivery.squareGiftCardId);
  if (!card.ok) {
    await markGiftFailed(delivery.id, `could not read the card: ${card.reason}`);
    return { sent: false, reason: card.reason };
  }
  // ⚠️ A card that is not ACTIVE has no spendable balance, and sending its
  // number would hand somebody a present that does not work. Far better to hold
  // the row and have somebody look than to deliver a dead card.
  if (card.state !== "ACTIVE") {
    const reason = `the card is ${card.state}, not ACTIVE`;
    await markGiftFailed(delivery.id, reason);
    return { sent: false, reason };
  }

  const message = giftMessage(delivery, card.gan);
  const to = destinationFor(delivery);

  const result =
    delivery.method === "text"
      ? await sendSms(to, message.sms)
      : await sendEmail({
          to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          // No replyTo. A reply goes to the shop's own from address, which is
          // what somebody holding a card that will not scan wants. Pointing it
          // at the buyer would tell a recipient who bought their surprise.
        });

  if (result.sent) {
    await markGiftDelivered(delivery.id);
    // ⚠️ The destination, the amount, and nothing else. Not the number.
    console.info(`[gift] sent ${delivery.id} to ${to}`);
    return { sent: true };
  }

  const reason =
    result.reason === "not-configured"
      ? "no transport is configured for this method"
      : result.detail;
  await markGiftFailed(delivery.id, reason);
  console.error(`[gift] could not send ${delivery.id} to ${to}: ${reason}`);
  return { sent: false, reason };
}

/** Everything owed as of `todayIso`, sent one at a time.
 *
 *  ——— Why one at a time ———
 *
 *  Not for politeness. Each send costs money and touches Square; running them
 *  in parallel turns a bug in this file from "some cards went wrong" into "all
 *  of them did, at once, before anybody could stop it". A backlog of fifty is
 *  a few seconds either way.
 *
 *  A failure does not stop the run. One recipient with a dead mailbox must not
 *  hold up everybody else's birthday. */
export async function sendDueGiftCards(
  todayIso: string,
  limit = 50,
): Promise<{ sent: number; failed: number; considered: number }> {
  const due = await pendingGiftDeliveries(todayIso, limit);
  let sent = 0;
  let failed = 0;
  for (const delivery of due) {
    const result = await deliverGiftCard(delivery);
    if (result.sent) sent += 1;
    else failed += 1;
  }
  return { sent, failed, considered: due.length };
}
