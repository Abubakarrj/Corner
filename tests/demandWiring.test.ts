// The refusal actually reaches the counter, through a real route handler.
//
// ——— Why this exists separately from demandMisses.test.ts ———
//
// That suite proves the store is right. This proves anything ever calls it.
// The wiring is three one-line call sites at three refusal points, and the way
// they fail is silent: a condition inverted, a unit confused, or a call that
// records when the address was *in* range. None of those would show up in a
// typecheck and none would show up to a customer.
//
// Google is stubbed — a geocoder that returns the point it was asked about and
// a matrix that answers in straight-line miles — and the route handler is
// imported and called directly. Nothing here tests Google.
//
// ⚠️ Needs a scratch database and drops its own table.

import { SCHEMA, db, isDatabaseConfigured } from "../app/db";
import { milesBetween } from "../app/(marketing)/locations/locations";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

process.env.GOOGLE_MAPS_API_KEY = "test-key";

// Whatever address is asked for, answer with the point encoded in it. That
// keeps the test's intent in the call rather than in a lookup table.
let answerAt: [number, number] = [0, 0];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes("/maps/api/geocode/json")) {
    return Response.json({
      status: "OK",
      results: [{
        place_id: "test",
        formatted_address: "A Street, Los Angeles, CA",
        types: ["street_address"],
        geometry: { location: { lat: answerAt[0], lng: answerAt[1] }, location_type: "ROOFTOP" },
        address_components: [],
      }],
    });
  }
  if (url.includes("computeRouteMatrix")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const pt = (w: { waypoint: { location: { latLng: { latitude: number; longitude: number } } } }):
      [number, number] => [w.waypoint.location.latLng.latitude, w.waypoint.location.latLng.longitude];
    const origins = body.origins.map(pt);
    const dests = body.destinations.map(pt);
    const out: unknown[] = [];
    origins.forEach((o: [number, number], oi: number) => {
      dests.forEach((d: [number, number], di: number) => {
        out.push({
          ...(oi === 0 ? {} : { originIndex: oi }),
          ...(di === 0 ? {} : { destinationIndex: di }),
          distanceMeters: Math.round(milesBetween(o, d) * 1609.344),
          duration: "600s",
          condition: "ROUTE_EXISTS",
        });
      });
    });
    return Response.json(out);
  }
  return realFetch(input as never, init as never);
}) as typeof fetch;

async function main() {
  if (!isDatabaseConfigured()) {
    console.log("SKIP  no CORNER_DATABASE_URL, so the wiring is untested.");
    console.log("      CORNER_DATABASE_URL=postgres://... npm test demandWiring");
    process.exit(0);
  }
  const client = db();
  if (!client) { console.log("\nno database"); process.exit(1); }
  // Both tables, because the digest's once-a-day claim is a row that outlives
  // a test run exactly as it is meant to outlive a cron retry. Leaving it
  // behind made this suite pass on a fresh database and fail on the second
  // run, which is the worst kind of test.
  await client.query(
    `CREATE SCHEMA IF NOT EXISTS ${SCHEMA};
     DROP TABLE IF EXISTS ${SCHEMA}.demand_daily;
     DROP TABLE IF EXISTS ${SCHEMA}.digest_sent`,
  );

  // Create the table before anything reads it. ready() makes it lazily on
  // first use, and the first thing this test does is count rows.
  const { demandMap } = await import("../app/demand");
  await demandMap();

  const { POST } = await import("../app/api/delivery-area/route");
  const ask = (address: string) =>
    POST(new Request("http://localhost/api/delivery-area", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    }));
  const counted = async () => {
    const { rows } = await client.query<{ n: string; miles: string }>(
      `SELECT coalesce(sum(n),0)::text AS n,
              coalesce(sum(sum_miles),0)::text AS miles
         FROM ${SCHEMA}.demand_daily WHERE outcome = 'refused'`,
    );
    return { n: Number(rows[0].n), miles: Number(rows[0].miles) };
  };

  // ——— In range: answered, and nothing written ———
  //
  // The failure this catches is the condition inverted, which would turn the
  // table into a record of everybody who ordered rather than everybody who
  // could not.
  answerAt = [34.0617, -118.3006]; // the Wilshire counter itself
  const near = await ask("3450 Wilshire Blvd");
  const nearBody = await near.json();
  ok("an address at the counter is in range", nearBody.inRange === true,
     JSON.stringify(nearBody));
  ok("and nothing is counted", (await counted()).n === 0, String((await counted()).n));

  // ——— Out of range: answered, and counted once ———
  // ⚠️ Long Beach, not Santa Monica. This was Santa Monica, and the counter in
  // Westwood put it four miles inside the rule — so the address chosen to be
  // refused started being accepted, and a suite about recording refusals had
  // nothing to record. Twenty miles out is out under any radius this shop
  // would plausibly set.
  answerAt = [33.7701, -118.1937]; // Long Beach
  const far = await ask("Somewhere in Long Beach");
  const farBody = await far.json();
  ok("a Long Beach address is out of range", farBody.inRange === false,
     JSON.stringify(farBody));
  const after = await counted();
  ok("and it is counted once", after.n === 1, String(after.n));
  ok("with the distance that was measured",
     Math.abs(after.miles - farBody.miles) < 0.2, `${after.miles} vs ${farBody.miles}`);

  // ——— The cell, not the address ———
  const { rows: cells } = await client.query<{ cell_lat: string; cell_lng: string; channel: string }>(
    `SELECT cell_lat::text, cell_lng::text, channel FROM ${SCHEMA}.demand_daily
      WHERE outcome = 'refused'`,
  );
  ok("stored as a rounded cell", cells[0].cell_lat === "33.77" && cells[0].cell_lng === "-118.19",
     `${cells[0].cell_lat},${cells[0].cell_lng}`);
  ok("tagged as the area check", cells[0].channel === "area", cells[0].channel);

  // A second refusal on the same block increments rather than adding a row —
  // which is what makes the table a tally and not a log of visits.
  // The neighbour has to be on the same block as the refusal above, so it
  // moved to Long Beach with it. It rounds into the same cell.
  answerAt = [33.7705, -118.194];
  await ask("Another door on the same block");
  const { rows: still } = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ${SCHEMA}.demand_daily WHERE outcome = 'refused'`,
  );
  ok("a neighbour increments the same row rather than adding one", still[0].n === "1",
     still[0].n);
  ok("and the count is two", (await counted()).n === 2, String((await counted()).n));

  // ——— The read endpoint is gated ———
  const { GET } = await import("../app/api/demand/route");
  const open = await GET(new Request("http://localhost/api/demand"));
  ok("the demand map is not public", open.status === 404, String(open.status));
  process.env.KITCHEN_TOKEN = "secret";
  const wrong = await GET(new Request("http://localhost/api/demand", {
    headers: { authorization: "Bearer nope" },
  }));
  ok("a wrong token is the same 404", wrong.status === 404, String(wrong.status));
  const right = await GET(new Request("http://localhost/api/demand", {
    headers: { authorization: "Bearer secret" },
  }));
  ok("the right token reads it", right.status === 200, String(right.status));
  const body = await right.json();
  ok("and the cell is below the threshold, so it is not shown",
     body.known === true && body.cells.length === 0, JSON.stringify(body).slice(0, 160));

  // ——— Catering interest, the one thing that flow can be seen doing ———
  //
  // A catering order leaves through a mailto and never comes back, so this
  // endpoint counting the button press is the entire catering signal. If it
  // stops firing, the digest reports nothing under Catering and reads as a
  // dead market rather than a blind spot.
  const interest = await import("../app/api/demand/interest/route");
  const tap = (locationId: unknown) =>
    interest.POST(new Request("http://localhost/api/demand/interest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body: JSON.stringify({ locationId }),
    }));
  await tap("glendon");
  const { rows: cater } = await client.query<{ n: string; mode: string; outcome: string }>(
    `SELECT n::text, mode, outcome FROM ${SCHEMA}.demand_daily WHERE mode = 'catering'`,
  );
  ok("a catering tap is counted", cater[0]?.n === "1", JSON.stringify(cater));
  ok("as interest, never as an order", cater[0]?.outcome === "interest", cater[0]?.outcome);
  // A counter we do not have, or one that does not cater, counts nothing —
  // otherwise the number is whatever a script feels like sending.
  await tap("not-a-shop");
  const { rows: caterAfter } = await client.query<{ n: string }>(
    `SELECT coalesce(sum(n),0)::text AS n FROM ${SCHEMA}.demand_daily WHERE mode = 'catering'`,
  );
  ok("an unknown counter counts nothing", caterAfter[0].n === "1", caterAfter[0].n);

  // ——— The digest is sent once ———
  //
  // A cron that retries, two instances waking together, somebody curling it to
  // see what it looks like: all three send a second copy of the same morning
  // unless the claim holds. A duplicate daily report is how a daily report
  // stops being read.
  process.env.KITCHEN_TOKEN = "secret";
  const digest = await import("../app/api/digest/route");
  const fire = () =>
    digest.POST(new Request("http://localhost/api/digest", {
      method: "POST",
      headers: { authorization: "Bearer secret" },
    }));
  const first = await fire();
  const firstBody = await first.json();
  const second = await fire();
  const secondBody = await second.json();
  // RESEND_API_KEY is unset here, so the send reports not-configured rather
  // than mailing anybody. What is being tested is the claim, not the mail.
  ok("the first call takes the day", firstBody.reason !== "already-sent",
     JSON.stringify(firstBody));
  ok("and the second is refused as already sent", secondBody.reason === "already-sent",
     JSON.stringify(secondBody));
  ok("both name the same day", firstBody.day === secondBody.day,
     `${firstBody.day} vs ${secondBody.day}`);
  // An explicit day is a deliberate resend and skips the claim, which is how a
  // digest lost to a failed send gets recovered.
  const again = await digest.POST(new Request(
    `http://localhost/api/digest?day=${firstBody.day}`,
    { method: "POST", headers: { authorization: "Bearer secret" } },
  ));
  ok("an explicit ?day= can resend", (await again.json()).reason !== "already-sent");
  const unauthed = await digest.POST(
    new Request("http://localhost/api/digest", { method: "POST" }),
  );
  ok("and the digest endpoint is not public", unauthed.status === 404,
     String(unauthed.status));

  await client.end();
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
