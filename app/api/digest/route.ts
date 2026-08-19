import { createHash, timingSafeEqual } from "node:crypto";
import { SCHEMA, db, explainDbError, ready } from "../../db";
import { digestDay, sendDigest } from "../../demandDigest";

// The daily demand digest, fired by whatever runs on a schedule.
//
// ——— Why this is an endpoint and not a timer ———
//
// There is no scheduler in this app and adding one would mean a process that
// has to stay up, which is not what this deployment is. A Render cron job — or
// a GitHub Action, or anything that can make one authenticated request a day —
// is the whole mechanism:
//
//   curl -fsS -X POST https://thecornerbagel.com/api/digest \
//        -H "Authorization: Bearer $KITCHEN_TOKEN"
//
// Point it at 15:00 UTC, which is 7am in Los Angeles year round give or take
// an hour of daylight saving, so the mail is there when the shop opens.
//
// ——— Sent once, whatever the cron does ———
//
// A cron that retries on a timeout, two instances waking together, somebody
// curling it to see what it looks like: all three send a second copy of the
// same morning unless something says no. The claim below is a row insert with
// a primary key on the day, so the second attempt writes nothing, learns that
// from rowCount, and returns without sending.
//
// The claim is taken *before* the mail goes out rather than after. The two
// failure modes are not equal: claiming first can lose a digest if the send
// then fails, and the shop can ask for it again with ?day=; claiming after
// means a slow send gets a duplicate, and duplicates are how a daily report
// stops being read.

export const dynamic = "force-dynamic";

const DDL = `
  CREATE TABLE IF NOT EXISTS ${SCHEMA}.digest_sent (
    day     date        PRIMARY KEY,
    sent_at timestamptz NOT NULL DEFAULT now()
  );
`;

function sameToken(offered: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(offered), digest(expected));
}

function authorized(request: Request): boolean {
  const expected = process.env.KITCHEN_TOKEN?.trim();
  if (!expected) return false;
  const header = request.headers.get("authorization")?.trim() ?? "";
  const offered = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  return offered.length > 0 && sameToken(offered, expected);
}

/** True when this call is the one that gets to send. */
async function claimDay(day: string): Promise<boolean | null> {
  const client = db();
  if (!client) return null;
  try {
    await ready("digest_sent", DDL);
    const { rowCount } = await client.query(
      `INSERT INTO ${SCHEMA}.digest_sent (day) VALUES ($1::date)
       ON CONFLICT (day) DO NOTHING`,
      [day],
    );
    return (rowCount ?? 0) > 0;
  } catch (error) {
    console.error(`[digest] could not claim ${day}: ${explainDbError(error)}`);
    return null;
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "api.unknownRequest" }, { status: 404 });
  }

  const url = new URL(request.url);
  const asked = url.searchParams.get("day");
  const day = /^\d{4}-\d{2}-\d{2}$/.test(asked ?? "") ? (asked as string) : digestDay();
  // An explicit ?day= is somebody asking for a resend on purpose — the digest
  // that was lost when a send failed after the claim. It skips the claim
  // rather than defeating it: the automatic path stays exactly once a day.
  const resend = asked !== null;

  if (!resend) {
    const mine = await claimDay(day);
    if (mine === null) {
      return Response.json({ sent: false, reason: "no-store", day }, { status: 503 });
    }
    if (!mine) {
      return Response.json({ sent: false, reason: "already-sent", day }, { status: 200 });
    }
  }

  const result = await sendDigest(day);
  if (result.sent) return Response.json({ sent: true, day });

  // A failure is reported honestly and with a status a cron will notice. The
  // claim stays taken; ?day= is how it gets sent again once the reason is
  // fixed, which is better than a retry loop mailing four copies.
  console.error(`[digest] ${day} not sent: ${result.reason}`);
  return Response.json(
    { sent: false, reason: result.reason, day },
    { status: result.reason === "not-configured" ? 503 : 502 },
  );
}
