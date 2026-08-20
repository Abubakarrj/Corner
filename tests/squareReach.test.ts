// Is the configured Square location actually usable?
//
// ——— The round trip this exists to prevent ———
//
// The reachability check used to stop at "Square replied, so Square is fine".
// That passed happily on a deployment where every single checkout failed with
//
//   BAD_REQUEST: Not authorized to take payments with location_id=…
//
// because taking cards is a property of the *location*, not of the connection.
// A Square location only processes cards when its capabilities include
// CREDIT_CARD_PROCESSING, and one created by hand usually does not have it. The
// token was right, the API was reachable, the id existed, and the money still
// could not move — and the only place that showed up was a customer's card.
//
// So the status page has to be able to say it, before anybody's card is
// involved. These are the four ways a location that exists is still the wrong
// one to have configured.

import { squareReachable, countOpenSquareOrders, squareLocationFor } from "../app/square";
import { countOpenPosOrders } from "../app/pos";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

process.env.SQUARE_ACCESS_TOKEN = "token";
process.env.SQUARE_LOCATION_ID = "L-ours";
delete process.env.SQUARE_ENV;

let reply: { status: number; body: unknown } = { status: 200, body: {} };
const realFetch = globalThis.fetch;
globalThis.fetch = (async () =>
  new Response(JSON.stringify(reply.body), {
    status: reply.status,
    headers: { "Content-Type": "application/json" },
  })) as typeof fetch;

const location = (over: Record<string, unknown> = {}) => ({
  id: "L-ours",
  name: "Wilshire Blvd",
  status: "ACTIVE",
  currency: "USD",
  capabilities: ["CREDIT_CARD_PROCESSING", "AUTOMATIC_TRANSFERS"],
  ...over,
});

const set = (body: unknown, status = 200) => {
  reply = { status, body };
};

async function main() {
  // ——— The one that works ———
  set({ locations: [location()] });
  const good = await squareReachable();
  ok("a live card-processing location in dollars is reachable", good.ok === true,
     JSON.stringify(good));

  // ——— The failure that actually happened ———
  //
  // Every field looks right. The location exists, it is active, the token can
  // see it. It simply cannot take a card.
  set({ locations: [location({ capabilities: ["AUTOMATIC_TRANSFERS"] })] });
  const noCards = await squareReachable();
  ok("a location that cannot process cards is not reachable", noCards.ok === false,
     JSON.stringify(noCards));
  ok("and the reason names the capability to look for",
     noCards.ok === false && /CREDIT_CARD_PROCESSING/.test(noCards.why),
     noCards.ok === false ? noCards.why : "");
  // The distinction a person acting on this needs: the kitchen is fine, the
  // money is not. Saying "Square is down" would send somebody to the wrong
  // place entirely.
  ok("and says orders still arrive while charges do not",
     noCards.ok === false && /kitchen/i.test(noCards.why) && /refused/i.test(noCards.why),
     noCards.ok === false ? noCards.why : "");

  // ——— Configured for a location this token cannot see ———
  //
  // The sandbox-token-with-production-location mistake, and the
  // one-account-two-applications mistake. Both land here.
  set({ locations: [location({ id: "L-somebody-else" })] });
  const unseen = await squareReachable();
  ok("a location the token cannot see is not reachable", unseen.ok === false,
     JSON.stringify(unseen));
  ok("and the reason lists what it can see, so the fix is a copy and paste",
     unseen.ok === false && /L-somebody-else/.test(unseen.why),
     unseen.ok === false ? unseen.why : "");

  set({ locations: [] });
  const none = await squareReachable();
  ok("no locations at all is not reachable", none.ok === false, JSON.stringify(none));

  // ——— Closed ———
  set({ locations: [location({ status: "INACTIVE" })] });
  const shut = await squareReachable();
  ok("an inactive location is not reachable", shut.ok === false, JSON.stringify(shut));
  ok("and is named as inactive rather than as a card problem",
     shut.ok === false && /INACTIVE/.test(shut.why), shut.ok === false ? shut.why : "");

  // ——— Keeping books in another currency ———
  //
  // We say USD in every request. A location on anything else refuses each one
  // with a message nobody would trace back to this.
  set({ locations: [location({ currency: "CAD" })] });
  const cad = await squareReachable();
  ok("a non-USD location is not reachable", cad.ok === false, JSON.stringify(cad));
  ok("and the currency is named", cad.ok === false && /CAD/.test(cad.why),
     cad.ok === false ? cad.why : "");

  // ——— A response that says nothing either way ———
  //
  // Square documents capabilities as optional. Absent is not "cannot" — a
  // status page that refused every location with a terse response would be
  // reporting a problem it invented.
  set({ locations: [{ id: "L-ours", name: "Wilshire Blvd" }] });
  const sparse = await squareReachable();
  ok("a location with no capabilities listed is not assumed broken",
     sparse.ok === true, JSON.stringify(sparse));

  // ——— The connection itself ———
  set({ errors: [{ code: "UNAUTHORIZED", detail: "Bad token." }] }, 401);
  const badToken = await squareReachable();
  ok("a rejected token is still reported as before", badToken.ok === false,
     JSON.stringify(badToken));
  ok("with Square's own words", badToken.ok === false && /UNAUTHORIZED/.test(badToken.why),
     badToken.ok === false ? badToken.why : "");

  delete process.env.SQUARE_ACCESS_TOKEN;
  const off = await squareReachable();
  ok("and an unconfigured Square says so plainly", off.ok === false, JSON.stringify(off));
  process.env.SQUARE_ACCESS_TOKEN = "token";

  // ——— A standing fault says itself once ———
  //
  // This is read three times per kitchen-load poll and on every order, so a
  // line per call is a steady drip that buries whatever else the log has to
  // say. That cost was not hypothetical: a real FORBIDDEN from Square arrived
  // among dozens of copies of a configuration note.
  const said: string[] = [];
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = (...args: unknown[]) => said.push(String(args[0]));
  console.error = (...args: unknown[]) => said.push(String(args[0]));

  process.env.SQUARE_LOCATION_ID = "L-ours";
  delete process.env.SQUARE_LOCATION_WILSHIRE;
  squareLocationFor("wilshire");
  squareLocationFor("wilshire");
  squareLocationFor("wilshire");
  const aboutWilshire = said.filter((line) => /SQUARE_LOCATION_WILSHIRE/.test(line));
  ok("an unmapped counter is mentioned once, not once per call",
     aboutWilshire.length === 1, `${aboutWilshire.length} lines`);

  // The reason is what is remembered, not the fact — so a fault that changes
  // still gets a line of its own.
  said.length = 0;
  set({ errors: [{ code: "FORBIDDEN", detail: "insufficient permissions" }] }, 403);
  await countOpenSquareOrders();
  await countOpenSquareOrders();
  const forbidden = said.filter((line) => /could not count/.test(line));
  ok("a standing count failure is reported once", forbidden.length === 1,
     `${forbidden.length} lines`);

  said.length = 0;
  set({ errors: [{ code: "RATE_LIMITED", detail: "slow down" }] }, 429);
  await countOpenSquareOrders();
  const changed = said.filter((line) => /could not count/.test(line));
  ok("and a different failure is news", changed.length === 1, `${changed.length} lines`);

  // ——— And the deployment says it on its own ———
  //
  // The reason this is here rather than only on /api/status: somebody debugging
  // a deploy is reading the deploy's log. A verdict that requires a diagnostic
  // token and a second URL is a verdict they will not see, and the failure it
  // reports is invisible from everywhere else until a customer is at the till.
  said.length = 0;
  set({ errors: [{ code: "FORBIDDEN", detail: "insufficient permissions" }] }, 403);
  await countOpenPosOrders();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const verdict = said.filter((line) => /NOT usable/.test(line));
  ok("the first use of an unusable till says so in the log",
     verdict.length === 1, JSON.stringify(said));
  ok("and says orders and charges will fail until it is fixed",
     verdict.length === 1 && /Orders and charges will fail/.test(verdict[0]),
     JSON.stringify(verdict));

  // Once per process. This runs on every order; a line per order is the noise
  // this whole pass was about removing.
  said.length = 0;
  await countOpenPosOrders();
  await new Promise((resolve) => setImmediate(resolve));
  ok("and does not repeat on the next order",
     said.filter((line) => /NOT usable/.test(line)).length === 0, JSON.stringify(said));

  console.warn = realWarn;
  console.error = realError;

  globalThis.fetch = realFetch;
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
