// Sending a text message.
//
// ——— Why this is tested at all, for eighty lines of transport ———
//
// A text costs money per send, lands on a stranger's phone, and cannot be
// unsent. The two failures worth catching here are asymmetric:
//
//   · a number that parses wrong sends somebody else's gift card to whoever
//     owns the digits that were left over
//   · a number that fails to parse and is *guessed at* rather than refused is
//     the same failure with the blame moved
//
// So the parser is exercised on what people actually type, and the transport is
// checked for the two things Twilio is strict about — basic auth and a form
// body, not JSON — plus that its own error text survives, because "sent" and
// "silently filtered by 10DLC" look identical from here otherwise.
//
// The transport is stubbed. This proves what the app sends, not that Twilio
// accepts it.

import { toE164, sendSms, isSmsConfigured, missingSmsConfig } from "../app/sms";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

/** What a failed send said, or "" when it did not fail. Only so an assertion
 *  about the reason reads as one line rather than three narrowing clauses. */
const why = (result: Awaited<ReturnType<typeof sendSms>>): string =>
  result.sent === false && result.reason === "failed" ? result.detail : "";

// ——— The number ———
//
// The gift form takes what somebody types, because refusing a real number over
// its punctuation is worse than accepting one that fails later.
ok("ten digits is a US number", toE164("2135551234") === "+12135551234", String(toE164("2135551234")));
ok("as typed, with brackets and dashes",
   toE164("(213) 555-1234") === "+12135551234", String(toE164("(213) 555-1234")));
ok("with dots", toE164("213.555.1234") === "+12135551234", String(toE164("213.555.1234")));
ok("with a leading 1", toE164("1 213 555 1234") === "+12135551234",
   String(toE164("1 213 555 1234")));
ok("already E.164 comes back unchanged",
   toE164("+12135551234") === "+12135551234", String(toE164("+12135551234")));
ok("and surrounding space does not matter",
   toE164("  2135551234  ") === "+12135551234", String(toE164("  2135551234  ")));
// A number that is not in North America still has to be sendable — the shop is
// in a neighbourhood where half the phones have a country code on them.
ok("a foreign number keeps its own country code",
   toE164("+44 20 7946 0958") === "+442079460958", String(toE164("+44 20 7946 0958")));

// ⚠️ Null rather than a guess, every time. Each of these is a card going to a
// stranger if the parser tries to be helpful.
ok("nine digits is refused", toE164("213555123") === null, String(toE164("213555123")));
ok("eleven digits not starting 1 is refused",
   toE164("22135551234") === null, String(toE164("22135551234")));
ok("twelve digits is refused", toE164("213555123456") === null,
   String(toE164("213555123456")));
ok("an empty string is refused", toE164("") === null, String(toE164("")));
ok("a word is refused", toE164("call me") === null, String(toE164("call me")));
ok("a plus with nothing after it is refused", toE164("+") === null, String(toE164("+")));
// E.164 caps at fifteen digits; longer is somebody pasting an order id.
ok("a plus with sixteen digits is refused",
   toE164("+1234567890123456") === null, String(toE164("+1234567890123456")));

// ——— What is missing ———
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;
delete process.env.TWILIO_FROM;
ok("with nothing set, SMS is off", isSmsConfigured() === false);
ok("and all three are named", missingSmsConfig().length === 3, JSON.stringify(missingSmsConfig()));

process.env.TWILIO_ACCOUNT_SID = "AC-test";
process.env.TWILIO_AUTH_TOKEN = "secret";
// ⚠️ Two of three is the dangerous state: it reads like a configured feature
// and sends nothing. The gap has to be nameable or nobody knows which line to
// add.
ok("two of three is still off", isSmsConfigured() === false);
ok("and says which one is missing",
   JSON.stringify(missingSmsConfig()) === JSON.stringify(["TWILIO_FROM"]),
   JSON.stringify(missingSmsConfig()));
// Whitespace is what a copied-and-pasted dashboard value looks like.
process.env.TWILIO_FROM = "   ";
ok("a blank value counts as missing", isSmsConfigured() === false);
ok("and is named", missingSmsConfig().includes("TWILIO_FROM"), JSON.stringify(missingSmsConfig()));
process.env.TWILIO_FROM = "+13235550000";
ok("all three, and it is on", isSmsConfigured() === true);

type Sent = { url: string; method: string; headers: Record<string, string>; body: string };
let sent: Sent | null = null;
let calls = 0;
let reply: { status: number; body: string } = { status: 201, body: "{}" };

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  calls += 1;
  sent = {
    url: String(input),
    method: String(init?.method ?? "GET"),
    headers: Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>),
    ),
    body: String(init?.body ?? ""),
  };
  return new Response(reply.body, { status: reply.status });
}) as typeof fetch;

const reset = (body: string, status = 201) => {
  sent = null; calls = 0; reply = { status, body };
};
const form = () => new URLSearchParams((sent as Sent | null)?.body ?? "");

async function main() {
  // ——— A message going out ———
  reset(JSON.stringify({ sid: "SM1", status: "queued" }));
  const first = await sendSms("(213) 555-1234", "Your gift card is here.");
  ok("a text sends", first.sent === true, JSON.stringify(first));
  ok("to the account's own messages endpoint",
     sent!.url === "https://api.twilio.com/2010-04-01/Accounts/AC-test/Messages.json",
     sent!.url);
  ok("as a POST", sent!.method === "POST", sent!.method);
  // ⚠️ Twilio takes a form body. JSON is accepted by the HTTP layer and then
  // ignored, so this would look like a working send with no message.
  ok("form-encoded, not JSON",
     sent!.headers["Content-Type"] === "application/x-www-form-urlencoded",
     JSON.stringify(sent!.headers["Content-Type"]));
  ok("with the number normalised on the way out",
     form().get("To") === "+12135551234", String(form().get("To")));
  ok("from the shop's one number",
     form().get("From") === "+13235550000", String(form().get("From")));
  ok("and the message itself",
     form().get("Body") === "Your gift card is here.", String(form().get("Body")));

  // Basic auth, and the token is the password — sending it as a bearer gets a
  // 401 that reads like bad credentials rather than a wrong scheme.
  const auth = sent!.headers.Authorization ?? "";
  ok("authenticated with basic auth", auth.startsWith("Basic "), auth.slice(0, 12));
  ok("with the sid and token as user and password",
     Buffer.from(auth.slice(6), "base64").toString() === "AC-test:secret",
     Buffer.from(auth.slice(6), "base64").toString().replace("secret", "…"));

  // A gift card message carries a number somebody can spend. It must survive
  // the encoding intact — a form body that mangles a newline or a plus is a
  // card the recipient cannot type in.
  reset(JSON.stringify({ sid: "SM2" }));
  await sendSms("+12135551234", "Code: 7783 3200 0000 0000\nSpend it at 100 W 5th.");
  ok("a multi-line body with a card number survives encoding",
     form().get("Body") === "Code: 7783 3200 0000 0000\nSpend it at 100 W 5th.",
     JSON.stringify(form().get("Body")));

  // ——— A number this could not read ———
  //
  // ⚠️ Refused here, before the request. The alternative is Twilio deciding
  // what "2135" means, and it costs money either way.
  reset("{}");
  const bad = await sendSms("2135", "hello");
  ok("an unusable number does not send", bad.sent === false, JSON.stringify(bad));
  ok("and does not reach Twilio at all", calls === 0, String(calls));
  ok("and says what it could not read", /2135/.test(why(bad)), JSON.stringify(bad));

  // ——— Twilio saying no ———
  //
  // ⚠️ The code is the whole point. 21610 is a phone that replied STOP; 21408 is
  // a region the account is not enabled for; 30034 is an unregistered 10DLC
  // campaign. Same status, three different people to go and talk to.
  reset(JSON.stringify({ code: 21610, message: "Attempt to send to unsubscribed recipient" }), 400);
  const stopped = await sendSms("2135551234", "hi");
  ok("a refusal is a failure", stopped.sent === false, JSON.stringify(stopped));
  ok("carrying Twilio's own code", /21610/.test(why(stopped)), JSON.stringify(stopped));
  ok("and Twilio's own words", /unsubscribed/.test(why(stopped)), JSON.stringify(stopped));

  // Not everything that fails is JSON — a proxy or a gateway answers in HTML,
  // and losing that leaves a blank reason on a card that did not arrive.
  reset("<html>502 Bad Gateway</html>", 502);
  const gateway = await sendSms("2135551234", "hi");
  ok("a non-JSON failure keeps its text",
     /Bad Gateway/.test(why(gateway)), JSON.stringify(gateway));

  // ——— The network being out ———
  reset("{}");
  globalThis.fetch = (async () => { throw new Error("ECONNREFUSED"); }) as typeof fetch;
  const down = await sendSms("2135551234", "hi");
  ok("a network failure is a failure, not a throw",
     down.sent === false && down.reason === "failed", JSON.stringify(down));
  ok("and says so", /ECONNREFUSED/.test(why(down)), JSON.stringify(down));

  // ——— No credentials ———
  //
  // ⚠️ `not-configured` is distinct from `failed` on purpose: the gift queue
  // treats a card as still owed either way, but only one of them is somebody's
  // laptop rather than a production outage.
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("{}", { status: 201 });
  }) as typeof fetch;
  delete process.env.TWILIO_AUTH_TOKEN;
  reset("{}");
  const off = await sendSms("2135551234", "hi");
  ok("without credentials nothing sends",
     off.sent === false && off.reason === "not-configured", JSON.stringify(off));
  ok("and no request goes out", calls === 0, String(calls));
  process.env.TWILIO_AUTH_TOKEN = "secret";

  globalThis.fetch = realFetch;
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
