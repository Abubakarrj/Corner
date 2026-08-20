// Getting an issued gift card to the person it was bought for.
//
// ——— What this is protecting ———
//
// Every card that reaches this code has been paid for. So there is exactly one
// outcome that must never happen: the row is closed and nothing arrived. Every
// assertion below is a way that could happen.
//
// Square, Resend and Twilio are all stubbed. The database is not stubbed and is
// not needed: the two bookkeeping calls are no-ops without one, and what is
// under test here is which of them gets called and what goes out on the wire.

import { deliverGiftCard, sendDueGiftCards } from "../app/giftSend";
import { pendingGiftDeliveries, recordGiftDelivery, type GiftDelivery } from "../app/giftDelivery";
import { SCHEMA, db } from "../app/db";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

process.env.SQUARE_ACCESS_TOKEN = "token";
process.env.SQUARE_LOCATION_ID = "L-default";
process.env.RESEND_API_KEY = "re-test";
process.env.TWILIO_ACCOUNT_SID = "AC-test";
process.env.TWILIO_AUTH_TOKEN = "secret";
process.env.TWILIO_FROM = "+13235550000";
delete process.env.SQUARE_ENV;
// ——— Two halves, and why ———
//
// The first half runs with no database at all, so it goes anywhere: the
// bookkeeping calls are no-ops and what is under test is purely what goes out
// on the wire and in which order.
//
// ⚠️ But that is exactly why the first half cannot see the most important
// behaviour in this file. Without a database, "marked delivered" and "marked
// still owed" are two no-ops and look identical — a version of deliverGiftCard
// that closed the row on a failed send would pass every assertion above. That
// is a card somebody paid for, silently written off. So the second half needs a
// real Postgres and says so loudly when there is not one.
const DB_URL = process.env.CORNER_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
delete process.env.CORNER_DATABASE_URL;
delete process.env.DATABASE_URL;

const GAN = "7783320000001234";

const card = (over: Partial<GiftDelivery> = {}): GiftDelivery => ({
  id: "gift-1",
  squareGiftCardId: "gc-1",
  squareOrderId: "ord-1",
  amountCents: 5000,
  designId: "classic",
  method: "email",
  recipientContact: "friend@example.com",
  recipientName: "Sam",
  senderName: "Ada",
  buyerEmail: "ada@example.com",
  message: "happy birthday",
  deliverOn: null,
  ...over,
});

type Call = { url: string; body: string };
let calls: Call[] = [];
/** What Square answers when asked for the card. */
let squareCard: { state: string; gan?: string } | null = { state: "ACTIVE", gan: GAN };
/** Whether the transports accept. */
let transportOk = true;
/** Card ids Square will not hand over, so one bad row can sit in a run of
 *  good ones. */
let dead = new Set<string>();

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, body: String(init?.body ?? "") });
  if (url.includes("/v2/gift-cards/")) {
    const id = url.slice(url.lastIndexOf("/") + 1);
    if (!squareCard || dead.has(id)) return new Response("{}", { status: 404 });
    return new Response(
      JSON.stringify({
        gift_card: {
          id: "gc-1",
          state: squareCard.state,
          gan: squareCard.gan,
          balance_money: { amount: 5000 },
        },
      }),
      { status: 200 },
    );
  }
  return transportOk
    ? new Response(JSON.stringify({ id: "sent" }), { status: 200 })
    : new Response(JSON.stringify({ code: 21610, message: "unsubscribed" }), { status: 400 });
}) as typeof fetch;

const reset = () => {
  calls = [];
  squareCard = { state: "ACTIVE", gan: GAN };
  transportOk = true;
  dead = new Set<string>();
};

const to = (host: string) => calls.filter((call) => call.url.includes(host));

async function main() {
  // ——— An email card ———
  reset();
  const emailed = await deliverGiftCard(card());
  ok("an email card is sent", emailed.sent === true, JSON.stringify(emailed));
  ok("Square is asked for the number by the card's id",
     calls[0]?.url.endsWith("/v2/gift-cards/gc-1"), calls[0]?.url ?? "");
  const mail = to("api.resend.com")[0];
  ok("and one email goes out", to("api.resend.com").length === 1);
  ok("to the recipient, not the buyer",
     mail?.body.includes("friend@example.com") === true, mail?.body ?? "");
  ok("carrying the number", mail?.body.includes("7783 3200 0000 1234") === true);
  ok("and nothing goes to Twilio", to("api.twilio.com").length === 0);

  // ——— A text card ———
  reset();
  const texted = await deliverGiftCard(card({ method: "text", recipientContact: "(213) 555-1234" }));
  ok("a text card is sent", texted.sent === true, JSON.stringify(texted));
  const sms = to("api.twilio.com")[0];
  ok("through Twilio", to("api.twilio.com").length === 1);
  ok("to the number, normalised",
     new URLSearchParams(sms?.body ?? "").get("To") === "+12135551234",
     sms?.body ?? "");
  ok("carrying the number",
     new URLSearchParams(sms?.body ?? "").get("Body")?.includes("7783 3200 0000 1234") === true,
     String(new URLSearchParams(sms?.body ?? "").get("Body")));
  ok("and no email goes out as well", to("api.resend.com").length === 0);

  // ——— A card the buyer is sending to themselves ———
  reset();
  await deliverGiftCard(card({ method: "self" }));
  ok("a self card goes to the buyer",
     to("api.resend.com")[0]?.body.includes("ada@example.com") === true,
     to("api.resend.com")[0]?.body ?? "");

  // ——— ⚠️ A card that is not loaded ———
  //
  // Sending the number of a PENDING card hands somebody a present that does not
  // work, and they have no way to tell that from a typo. Far better to hold the
  // row and have somebody look.
  reset();
  squareCard = { state: "PENDING", gan: GAN };
  const pending = await deliverGiftCard(card());
  ok("a card that is not ACTIVE is not sent", pending.sent === false, JSON.stringify(pending));
  ok("and says what state it is in",
     pending.sent === false && /PENDING/.test(pending.reason), JSON.stringify(pending));
  ok("and nothing went out", to("api.resend.com").length === 0);

  // ——— Square unreachable ———
  reset();
  squareCard = null;
  const unknown = await deliverGiftCard(card());
  ok("a card Square will not hand over is not sent", unknown.sent === false);
  ok("and nothing went out", to("api.resend.com").length === 0);

  // ——— The transport refusing ———
  //
  // ⚠️ The row stays owed. Resend down for ten minutes must not lose a card.
  reset();
  transportOk = false;
  const refused = await deliverGiftCard(card());
  ok("a refused send is a failure, not a silent success",
     refused.sent === false, JSON.stringify(refused));
  ok("and carries the provider's own words",
     refused.sent === false && refused.reason.length > 0, JSON.stringify(refused));

  // ——— A method with no transport behind it ———
  //
  // Should not be reachable: /api/gift-card refuses before it charges. But a
  // shop that removes its Twilio keys after a card is queued gets here, and the
  // card has to wait rather than be dropped.
  reset();
  delete process.env.TWILIO_AUTH_TOKEN;
  const noSms = await deliverGiftCard(card({ method: "text", recipientContact: "2135551234" }));
  ok("a text card with Twilio switched off is held", noSms.sent === false, JSON.stringify(noSms));
  // ⚠️ Before Square is even asked. Reading the number out of Square for a
  // message that cannot be sent is a bearer instrument fetched for nothing.
  ok("and the number is not fetched for a message that cannot go", calls.length === 0,
     JSON.stringify(calls.map((c) => c.url)));
  process.env.TWILIO_AUTH_TOKEN = "secret";

  // ——— The number, and where it must not appear ———
  //
  // Every log line this file writes names the row and the destination. The
  // number is money; a copy of it in a deployment log is a copy anybody with
  // log access can spend.
  reset();
  const said: string[] = [];
  const realInfo = console.info;
  const realError = console.error;
  console.info = (...args: unknown[]) => { said.push(args.join(" ")); };
  console.error = (...args: unknown[]) => { said.push(args.join(" ")); };
  await deliverGiftCard(card());
  transportOk = false;
  await deliverGiftCard(card({ id: "gift-2" }));
  console.info = realInfo;
  console.error = realError;
  ok("a successful send is logged", said.some((line) => line.includes("gift-1")), said.join(" | "));
  ok("a failed one too", said.some((line) => line.includes("gift-2")), said.join(" | "));
  ok("⚠️ and the card number is in none of it",
     !said.some((line) => line.includes(GAN) || line.includes("7783 3200 0000 1234")),
     said.join(" | "));

  // ——— A run over the queue ———
  //
  // Nothing is owed without a database, so this is checking that an empty run
  // is calm rather than that it drains anything — the queue itself is covered
  // in giftDelivery.test.ts against a real Postgres.
  reset();
  const run = await sendDueGiftCards("2026-08-20");
  ok("a run with nothing owed sends nothing",
     run.sent === 0 && run.failed === 0 && run.considered === 0, JSON.stringify(run));
  ok("and makes no calls", calls.length === 0, JSON.stringify(calls.map((c) => c.url)));

  // ——— With a real queue behind it ———
  process.env.CORNER_DATABASE_URL = DB_URL;
  const reachable = await (async () => {
    if (!DB_URL) return false;
    const client = db();
    if (!client) return false;
    try {
      await client.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  })();

  if (!reachable) {
    console.log("SKIP  no reachable CORNER_DATABASE_URL, so what a failed send does to");
    console.log("      the row is untested — and that is the half that matters. Run:");
    console.log("      CORNER_DATABASE_URL=postgres://... npm test giftSend");
  } else {
    const client = db()!;
    await client.query(`DROP TABLE IF EXISTS ${SCHEMA}.gift_deliveries`);

    // ⚠️ A send that failed leaves the card owed. Resend down for ten minutes
    // must not turn into a present that never arrives.
    reset();
    transportOk = false;
    await recordGiftDelivery(card({ id: "owed-1" }));
    const held = await deliverGiftCard(card({ id: "owed-1" }));
    ok("a failed send is reported as failed", held.sent === false, JSON.stringify(held));
    const stillOwed = await pendingGiftDeliveries("2026-08-20");
    ok("⚠️ and the card is still owed rather than written off",
       stillOwed.some((row) => row.id === "owed-1"),
       JSON.stringify(stillOwed.map((row) => row.id)));
    const attempt = await client.query(
      `SELECT attempts, last_error, sent_at FROM ${SCHEMA}.gift_deliveries WHERE id = 'owed-1'`,
    );
    ok("with the attempt counted", Number(attempt.rows[0]?.attempts) === 1,
       String(attempt.rows[0]?.attempts));
    ok("the reason kept", String(attempt.rows[0]?.last_error ?? "").length > 0,
       String(attempt.rows[0]?.last_error));
    ok("and nothing marked as sent", attempt.rows[0]?.sent_at === null,
       String(attempt.rows[0]?.sent_at));

    // And when the transport comes back, the same row goes.
    reset();
    const later = await deliverGiftCard(card({ id: "owed-1" }));
    ok("the next run sends it", later.sent === true, JSON.stringify(later));
    ok("and it stops being owed",
       !(await pendingGiftDeliveries("2026-08-20")).some((row) => row.id === "owed-1"));

    // ⚠️ A card that could not be read from Square must not be closed either.
    // "Square was down" and "this card does not exist" look the same from here,
    // and only one of them is safe to write off — so neither is.
    reset();
    const broken = card({ id: "owed-2", squareGiftCardId: "gc-dead" });
    dead.add("gc-dead");
    await recordGiftDelivery(broken);
    await deliverGiftCard(broken);
    ok("a card Square would not hand over stays owed",
       (await pendingGiftDeliveries("2026-08-20")).some((row) => row.id === "owed-2"));

    // ⚠️ And a card that came back PENDING. Not sent, obviously — but also not
    // closed, and the reason recorded, because "Square says this card is not
    // loaded" is something a person has to go and look at.
    reset();
    squareCard = { state: "PENDING", gan: GAN };
    await recordGiftDelivery(card({ id: "owed-3" }));
    await deliverGiftCard(card({ id: "owed-3" }));
    const notLoaded = await client.query(
      `SELECT attempts, last_error, sent_at FROM ${SCHEMA}.gift_deliveries WHERE id = 'owed-3'`,
    );
    ok("a card that is not loaded stays owed",
       notLoaded.rows[0]?.sent_at === null, String(notLoaded.rows[0]?.sent_at));
    ok("with the attempt counted", Number(notLoaded.rows[0]?.attempts) === 1,
       String(notLoaded.rows[0]?.attempts));
    ok("and the state recorded, so somebody can go and look",
       /PENDING/.test(String(notLoaded.rows[0]?.last_error)),
       String(notLoaded.rows[0]?.last_error));
    // Out of the way of the backlog run below, which counts rows.
    await client.query(`DELETE FROM ${SCHEMA}.gift_deliveries WHERE id = 'owed-3'`);

    // ——— A run over a real backlog ———
    //
    // ⚠️ owed-2 is still in the queue and its card still cannot be read. One
    // recipient with a dead row must not hold up everybody else's birthday, so
    // the run has to get past it and keep going.
    // Everything back to healthy except gc-dead, which stays unreadable so the
    // run has a bad row in it. Put back explicitly rather than left over: the
    // reset() above clears it, and a run that quietly had nothing to fail on
    // would pass the two assertions below while proving neither.
    calls = [];
    squareCard = { state: "ACTIVE", gan: GAN };
    transportOk = true;
    dead.add("gc-dead");
    await recordGiftDelivery(card({ id: "bulk-1" }));
    await recordGiftDelivery(card({ id: "bulk-2" }));
    const run = await sendDueGiftCards("2026-08-20");
    ok("a run drains what is due", run.sent === 2, JSON.stringify(run));
    ok("and the one card it cannot send does not stop the rest",
       run.failed === 1 && run.considered === 3, JSON.stringify(run));
    ok("with the broken one still owed afterwards",
       (await pendingGiftDeliveries("2026-08-20")).map((row) => row.id).join() === "owed-2",
       JSON.stringify((await pendingGiftDeliveries("2026-08-20")).map((row) => row.id)));

    await client.query(`DROP TABLE IF EXISTS ${SCHEMA}.gift_deliveries`);
    await client.end();
  }

  globalThis.fetch = realFetch;
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
