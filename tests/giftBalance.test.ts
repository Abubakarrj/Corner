// Reading what is left on a gift card.
//
// ——— Why an eighty-line endpoint gets this much suite ———
//
// A gift account number is a bearer instrument, and an endpoint that says "yes,
// that is a card, and it has $50 on it" is a machine for finding other people's
// money by guessing. Everything standing between it and that is in one file, so
// everything standing between it and that is asserted here:
//
//   · every failure reads the same, so a near miss is not confirmed as one
//   · it is throttled, and the throttle is not decorative
//   · the number is in no log line, on any path
//   · the answer carries a balance and nothing else about somebody's purchase

import { POST } from "../app/api/gift-balance/route";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

process.env.SQUARE_ACCESS_TOKEN = "token";
process.env.SQUARE_LOCATION_ID = "L-default";
delete process.env.SQUARE_ENV;

const GAN = "7783320000001234";

let calls: { url: string; body: string }[] = [];
/** What Square answers: a card, or a status code with no card. */
let answer: { status: number; card: unknown } = {
  status: 200,
  card: { id: "gc-1", state: "ACTIVE", balance_money: { amount: 4250 } },
};

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  calls.push({ url: String(input), body: String(init?.body ?? "") });
  return new Response(
    JSON.stringify(answer.card === null ? { errors: [{ code: "NOT_FOUND" }] } : { gift_card: answer.card }),
    { status: answer.status },
  );
}) as typeof fetch;

/** A fresh address per call, so the throttle does not colour a test that is
 *  not about the throttle. */
let caller = 0;
const check = async (gan: unknown, from?: string) => {
  calls = [];
  caller += 1;
  const response = await POST(
    new Request("https://thecornerbagel.com/api/gift-balance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": from ?? `10.0.0.${caller}`,
      },
      body: JSON.stringify({ gan }),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};

async function main() {
  // ——— A card somebody has ———
  const found = await check(GAN);
  ok("a balance comes back", found.status === 200 && found.body.balanceCents === 4250,
     JSON.stringify(found));
  ok("looked up by number, at Square",
     calls[0]?.url.endsWith("/v2/gift-cards/from-gan") === true, calls[0]?.url ?? "");
  // ⚠️ A balance and nothing else. Square's id for the card, when it was
  // issued, who bought it — none of that is a stranger's business, and the id
  // is what everything else about the card is reached by.
  ok("and nothing else about it comes back",
     Object.keys(found.body).length === 1 && "balanceCents" in found.body,
     JSON.stringify(found.body));

  // The message it arrived in groups the number in fours, so somebody will type
  // it that way. Refusing that would be refusing the format we chose.
  const spaced = await check("7783 3200 0000 1234");
  ok("a number typed with spaces works", spaced.status === 200, JSON.stringify(spaced));
  ok("and reaches Square without them",
     calls[0]?.body.includes(GAN) === true, calls[0]?.body ?? "");
  const dashed = await check("7783-3200-0000-1234");
  ok("and so does one with dashes", dashed.status === 200, JSON.stringify(dashed));

  // ——— ⚠️ Every miss reads the same ———
  //
  // This is the whole security property. If "no such card" and "that card is
  // deactivated" and "Square is down" answer differently, a guesser learns
  // which of their guesses was a real number — and a real number is money.
  const misses: [string, () => void, unknown][] = [
    ["a number nobody has", () => { answer = { status: 404, card: null }; }, GAN],
    ["an answer with no card in it", () => { answer = { status: 200, card: {} }; }, GAN],
    ["a card that is not ACTIVE",
      () => { answer = { status: 200, card: { id: "gc-1", state: "DEACTIVATED", balance_money: { amount: 5000 } } }; }, GAN],
    ["Square refusing the call",
      () => { answer = { status: 500, card: null }; }, GAN],
    ["a number far too short", () => { answer = { status: 200, card: { id: "gc-1", state: "ACTIVE", balance_money: { amount: 1 } } }; }, "77"],
    ["a number far too long", () => { answer = { status: 200, card: { id: "gc-1", state: "ACTIVE", balance_money: { amount: 1 } } }; }, "7".repeat(40)],
    ["no number at all", () => {}, undefined],
    ["a number that is not a string", () => {}, 7783320000001234],
  ];
  const answers = new Set<string>();
  for (const [what, arrange, input] of misses) {
    arrange();
    const miss = await check(input);
    answers.add(`${miss.status} ${JSON.stringify(miss.body)}`);
    ok(`${what} is refused`, miss.status === 404, JSON.stringify(miss));
    ok(`and nothing about a balance comes back for ${what}`,
       !("balanceCents" in miss.body), JSON.stringify(miss.body));
  }
  ok("⚠️ and every one of them is word for word the same answer",
     answers.size === 1, JSON.stringify([...answers]));

  // A length no card has is not worth a call to Square — and a caller who can
  // tell "we asked" from "we did not" has learned something about lengths.
  answer = { status: 200, card: { id: "gc-1", state: "ACTIVE", balance_money: { amount: 1 } } };
  await check("77");
  ok("an impossible length is answered without asking Square",
     calls.length === 0, JSON.stringify(calls.map((c) => c.url)));

  // ——— ⚠️ Nothing logs the number ———
  //
  // Not on the way in, not on a miss, not when the throttle fires. A log line
  // with a card number in it is money in a file.
  const said: string[] = [];
  const realWarn = console.warn;
  const realError = console.error;
  const realInfo = console.info;
  console.warn = (...args: unknown[]) => { said.push(args.join(" ")); };
  console.error = (...args: unknown[]) => { said.push(args.join(" ")); };
  console.info = (...args: unknown[]) => { said.push(args.join(" ")); };

  answer = { status: 200, card: { id: "gc-1", state: "ACTIVE", balance_money: { amount: 4250 } } };
  await check(GAN);
  answer = { status: 500, card: null };
  await check(GAN);
  // And the throttle path, which is the one most likely to want to say what was
  // being tried.
  answer = { status: 404, card: null };
  let throttled = 0;
  for (let i = 0; i < 14; i += 1) {
    const attempt = await check(GAN, "10.7.7.7");
    if (attempt.status === 429) throttled += 1;
  }
  console.warn = realWarn;
  console.error = realError;
  console.info = realInfo;

  ok("⚠️ the card number is in no log line, on any path",
     !said.some((line) => line.includes(GAN)), said.join(" | "));
  ok("and Square's own refusal is logged, since that one is ours to fix",
     said.some((line) => /500|refused/.test(line)), said.join(" | "));

  // ——— The throttle ———
  //
  // ⚠️ Sixteen digits at ten an hour is hopeless, which is the point. Somebody
  // who actually holds a card looks it up once.
  ok("an address cannot sit and guess", throttled > 0, `${throttled} of 14 refused`);
  ok("and is told to wait rather than told nothing",
     (await check(GAN, "10.7.7.7")).status === 429);
  // A different address is a different person until proven otherwise.
  ok("while somebody else is not caught by it",
     (await check(GAN, "10.8.8.8")).status !== 429);

  // ⚠️ Counted before the number is looked at. Otherwise a guesser gets a free
  // pass by sending rubbish, and the endpoint that refuses is also the endpoint
  // that has not counted the attempt.
  answer = { status: 404, card: null };
  let junkRefused = 0;
  for (let i = 0; i < 14; i += 1) {
    if ((await check("7", "10.6.6.6")).status === 429) junkRefused += 1;
  }
  ok("and rubbish is counted against the allowance too",
     junkRefused > 0, `${junkRefused} of 14 refused`);

  // ——— Without Square ———
  delete process.env.SQUARE_ACCESS_TOKEN;
  calls = [];
  const off = await check(GAN, "10.5.5.5");
  ok("with no Square there is no lookup", off.status === 503, JSON.stringify(off));
  // ⚠️ And it does not read as "that card does not exist", which would tell
  // somebody their real card had been spent.
  ok("and it says the shop cannot check rather than that the card is missing",
     off.body.error === "gift.balanceUnavailable", String(off.body.error));
  ok("and nothing went to Square", calls.length === 0);
  process.env.SQUARE_ACCESS_TOKEN = "token";

  globalThis.fetch = realFetch;
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
