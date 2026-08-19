// The signature on Square's order webhook.
//
// ——— Why this one is worth a suite of its own ———
//
// This endpoint is the only unauthenticated write path in the app that can
// change what a customer is told about their food. Get the check wrong in the
// permissive direction and anybody who finds the URL can move somebody's order
// to "ready" — or, more realistically, a misconfiguration makes it accept
// everything and nobody notices, because accepting everything looks exactly
// like working.
//
// The scheme is HMAC-SHA256 over `notificationUrl + rawBody`, base64. The URL
// half is the part that is easy to get wrong and impossible to notice: a
// signature computed over the body alone still looks like a signature, and a
// verifier that ignored the URL would accept it. That is the mutation this
// suite exists to catch.
//
// ⚠️ The endpoint deliberately does not believe the body it just verified. A
// valid signature proves the message came from Square; it does not prove our
// parse of a nested payload is right. So the test also checks that a verified
// message causes the app to go and *ask* Square, rather than writing whatever
// the message said.
//
// ——— One thing here is not testable and should not be claimed ———
//
// Replacing the constant-time compare with `expected === header` passes every
// assertion below, and nothing written in this style could catch it: the
// difference is how long a wrong answer takes, not what the answer is. The
// length guard in front of it *is* covered — without it the compare throws on a
// short signature and this suite crashes rather than reporting 401 — but the
// constant-time property itself rests on reading the code.

import { createHmac } from "node:crypto";
// A static import is safe here: the route reads the key and the URL inside the
// request, not at module load, so setting them below is in time.
import { POST } from "../app/api/square/order/route";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

const KEY = "signature-key";
const URL_ = "https://thecornerbagel.com/api/square/order";

process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = KEY;
process.env.SQUARE_WEBHOOK_URL = URL_;
// So the refresh that follows a verified message has somewhere to go, and the
// stub below can see it happen.
process.env.SQUARE_ACCESS_TOKEN = "token";
process.env.SQUARE_LOCATION_ID = "L-default";

const sign = (body: string, over: string = URL_ + body) =>
  createHmac("sha256", KEY).update(over).digest("base64");

let asked: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  asked.push(url);
  return new Response(JSON.stringify({ order: { id: "sq-1", state: "OPEN", fulfillments: [{ state: "PREPARED" }] } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;

function post(body: string, signature: string | null): Promise<Response> {
  asked = [];
  return POST(
    new Request(URL_, {
      method: "POST",
      body,
      ...(signature === null
        ? {}
        : { headers: { "x-square-hmacsha256-signature": signature } }),
    }),
  );
}

/** The webhook answers before it does the work — deliberately, so a slow call
 *  to Square cannot get the subscription disabled. Two turns of the microtask
 *  queue is what it takes for that floated promise to reach the stub. */
const settle = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

async function main() {
  const updated = JSON.stringify({
    type: "order.updated",
    data: { object: { order: { id: "sq-1" } } },
  });

  // ——— A real message ———
  let response = await post(updated, sign(updated));
  ok("a correctly signed message is accepted", response.status === 200, String(response.status));
  await settle();
  ok("and the app goes and asks Square itself, rather than believing the body",
     asked.some((url) => url.endsWith("/v2/orders/sq-1")), JSON.stringify(asked));

  // ——— The other event shape ———
  const fulfilled = JSON.stringify({
    type: "order.fulfillment.updated",
    data: { object: { order_fulfillment_updated: { order_id: "sq-2" } } },
  });
  response = await post(fulfilled, sign(fulfilled));
  ok("a fulfillment event is accepted too", response.status === 200, String(response.status));
  await settle();
  ok("and its order id is the one asked about",
     asked.some((url) => url.endsWith("/v2/orders/sq-2")), JSON.stringify(asked));

  // ——— Forgeries ———
  response = await post(updated, sign(updated, updated));
  ok("a signature over the body alone is refused — the URL is part of the string",
     response.status === 401, String(response.status));
  await settle();
  ok("and nothing was asked", asked.length === 0, JSON.stringify(asked));

  response = await post(
    updated,
    createHmac("sha256", "the-wrong-key").update(URL_ + updated).digest("base64"),
  );
  ok("the wrong key is refused", response.status === 401, String(response.status));

  response = await post(
    updated,
    createHmac("sha256", KEY).update("https://evil.example.com/api/square/order" + updated).digest("base64"),
  );
  ok("the right key over the wrong URL is refused", response.status === 401,
     String(response.status));

  // The body is what the signature covers. A message whose id was swapped after
  // signing is the attack this actually stops.
  const tampered = updated.replace("sq-1", "sq-9");
  response = await post(tampered, sign(updated));
  ok("a body edited after signing is refused", response.status === 401, String(response.status));
  await settle();
  ok("and no order was touched", asked.length === 0, JSON.stringify(asked));

  response = await post(updated, null);
  ok("no signature at all is refused", response.status === 401, String(response.status));

  response = await post(updated, "");
  ok("an empty signature is refused", response.status === 401, String(response.status));

  // A length mismatch is the case that throws inside timingSafeEqual, which
  // would be a 500 where a 401 belongs.
  response = await post(updated, "short");
  ok("a short signature is refused rather than crashing", response.status === 401,
     String(response.status));

  // ——— Fail closed ———
  //
  // An unverifiable endpoint that honours messages anyway is a URL anybody can
  // use to move an order to ready. Missing configuration must refuse, not wave
  // things through.
  delete process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  response = await post(updated, sign(updated));
  ok("with no signature key configured, everything is refused", response.status === 401,
     String(response.status));
  process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = KEY;

  delete process.env.SQUARE_WEBHOOK_URL;
  response = await post(updated, sign(updated));
  ok("with no notification URL configured, everything is refused", response.status === 401,
     String(response.status));
  process.env.SQUARE_WEBHOOK_URL = URL_;

  // ——— Signed, and useless ———
  //
  // 200 rather than an error status on both: Square retries a failure, and
  // retrying a message we will never be able to act on is a loop.
  response = await post("not json at all", sign("not json at all"));
  ok("a signed message that will not parse is accepted and dropped",
     response.status === 200, String(response.status));
  await settle();
  ok("with nothing asked about", asked.length === 0, JSON.stringify(asked));

  const idless = JSON.stringify({ type: "order.updated", data: { object: {} } });
  response = await post(idless, sign(idless));
  ok("a signed message with no order id is accepted and dropped",
     response.status === 200, String(response.status));
  await settle();
  ok("with nothing asked about either", asked.length === 0, JSON.stringify(asked));

  globalThis.fetch = realFetch;
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
