import { createHash, timingSafeEqual } from "node:crypto";
import { sendDueGiftCards } from "../../giftSend";

// Gift cards dated for later, sent on the day.
//
// ——— Why this is an endpoint and not a timer ———
//
// The same reason as /api/digest: there is no scheduler in this app, and adding
// one means a process that has to stay up, which is not what this deployment
// is. A Render cron job is the whole mechanism:
//
//   curl -fsS -X POST https://thecornerbagel.com/api/gift-send \
//        -H "Authorization: Bearer $KITCHEN_TOKEN"
//
// ⚠️ Point it at 15:00 UTC, which is 7am in Los Angeles. A card bought for a
// birthday should arrive with breakfast, not at midnight — and the shop's own
// date is what "Saturday" means here, so a run scheduled at 00:00 UTC would be
// looking at the wrong day for everybody west of Greenwich.
//
// It is safe to run more often than once a day, and safe to run twice by
// accident. A card that has been sent has `sent_at` set and does not come back
// from pendingGiftDeliveries, so a second run in the same morning finds
// nothing. That is a stronger guarantee than the digest's claim row, and it
// comes for free from the queue already being a queue.
//
// ——— What a failure here is, and is not ———
//
// Every card in this queue is money already taken. A run that cannot reach
// Square, or Resend, or Twilio, leaves each row owed with its reason recorded
// and tries again tomorrow — see giftSend.ts. So this endpoint answering 200
// with `failed: 3` is not success: it is three people who have not got their
// present, and the count is here so a cron with alerting on it can say so.
//
// The endpoint answers 200 as long as it ran. A cron job that goes red on a
// single dead mailbox is a cron job somebody switches off.

export const dynamic = "force-dynamic";

/** How many to send in one run.
 *
 *  A ceiling rather than "everything owed": a queue that has built up for a
 *  week behind a broken transport should drain over several runs rather than in
 *  one request that times out halfway, leaving nobody knowing which half went.
 *  The next run picks up the rest. */
const PER_RUN = 50;

function sameToken(offered: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(offered), digest(expected));
}

function authorized(request: Request): boolean {
  const expected = process.env.KITCHEN_TOKEN?.trim();
  // ⚠️ No token set means no access, not open access. An unset variable is the
  // state a fresh deploy is in, and it must not be the state where anything on
  // the internet can make the shop send every queued gift card.
  if (!expected) return false;
  const header = request.headers.get("authorization")?.trim() ?? "";
  const offered = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  return offered.length > 0 && sameToken(offered, expected);
}

/** Today where the shop is. Not the server's day — Render runs in UTC, and a
 *  card dated Saturday must not go out on Friday evening in Los Angeles. */
function todayInShopTime(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // ?day= to catch up by hand after an outage, the same override /api/digest
  // has. Cards dated before it are due too — isDue treats a date that has gone
  // by as owed, not skipped — so this only ever moves the line forward.
  const asked = new URL(request.url).searchParams.get("day");
  const day = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : todayInShopTime();

  const result = await sendDueGiftCards(day, PER_RUN);

  // Silent when there was nothing to do, which is most mornings. A daily line
  // saying "0 sent" is a line that stops being read, and this log is also where
  // a failure has to be visible.
  if (result.considered > 0) {
    console.info(
      `[gift-send] ${day}: ${result.sent} sent, ${result.failed} still owed` +
        ` of ${result.considered} due.`,
    );
  }

  return Response.json({ ok: true, day, ...result, limit: PER_RUN }, { status: 200 });
}
