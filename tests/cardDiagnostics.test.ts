// Two ways of finding out why the card field is missing.
//
// ——— What this is repairing ———
//
// A checkout showed an empty box where a card field belongs, across several
// days and several deploys, and nothing anywhere said why. The reason was in a
// browser console — and this shop is configured and tested from a phone, which
// has no console to open. The server logs, which *are* read, said nothing,
// because from the server's side nothing had happened.
//
// So two things now speak. One catches the likeliest cause before a browser is
// involved at all; the other lets the browser file the reason when it is
// something else.

import { applicationIdMismatch, isSquarePaymentsConfigured } from "../app/squarePayments";
import { POST } from "../app/api/client-error/route";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

process.env.SQUARE_ACCESS_TOKEN = "token";
process.env.SQUARE_LOCATION_ID = "L-ours";

// ——— The pairing ———
//
// ⚠️ Square publishes two application ids per application and they authenticate
// against two different SDK scripts. Pair them wrongly and payments() throws:
// no field, an error blaming the customer's card, and nothing to read. Both ids
// sit on the same dashboard page.
delete process.env.SQUARE_ENV;
process.env.SQUARE_APPLICATION_ID = "sandbox-sq0idb-abc";
ok("a sandbox id with no SQUARE_ENV is the right pair",
   applicationIdMismatch() === null, String(applicationIdMismatch()));
ok("and card payment is on", isSquarePaymentsConfigured() === true);

process.env.SQUARE_APPLICATION_ID = "sq0idp-abc";
const wrongWay = applicationIdMismatch();
ok("a production id against the sandbox SDK is caught", wrongWay !== null);
ok("and the message says which id to use instead",
   wrongWay !== null && /Sandbox Application ID/.test(wrongWay), String(wrongWay));
// The whole point: an option that cannot work must not be offered. A customer
// picking it types nothing into an empty box and is told their card failed.
ok("and card payment is off rather than broken",
   isSquarePaymentsConfigured() === false);

process.env.SQUARE_ENV = "production";
ok("that same id is right once SQUARE_ENV says production",
   applicationIdMismatch() === null, String(applicationIdMismatch()));

process.env.SQUARE_APPLICATION_ID = "sandbox-sq0idb-abc";
const otherWay = applicationIdMismatch();
ok("and a sandbox id on a production deployment is caught too", otherWay !== null);
ok("named as a sandbox id rather than generically",
   otherWay !== null && /sandbox/.test(otherWay), String(otherWay));

delete process.env.SQUARE_ENV;
process.env.SQUARE_APPLICATION_ID = "sandbox-sq0idb-abc";

// ——— The browser's report ———
const said: string[] = [];
const realError = console.error;
const realWarn = console.warn;
console.error = (...args: unknown[]) => said.push(args.join(" "));
console.warn = (...args: unknown[]) => said.push(args.join(" "));

const report = (body: unknown) =>
  POST(new Request("https://shop/api/client-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));

async function main() {
  said.length = 0;
  let response = await report({ where: "square-card-mount", message: "Invalid application ID" });
  ok("a mount failure reaches the log", said.some((l) => /Invalid application ID/.test(l)),
     JSON.stringify(said));
  ok("and the browser is told nothing it could use", response.status === 204,
     String(response.status));

  // ⚠️ Unauthenticated and it writes to a log, so everything below is about
  // what it refuses. A log anybody can fill is a log nobody can read, which is
  // the exact problem this was built to fix.
  said.length = 0;
  await report({ where: "anything-else", message: "hello" });
  ok("an unknown label is ignored", said.length === 0, JSON.stringify(said));

  said.length = 0;
  await report("not json at all");
  ok("an unparseable body is ignored", said.length === 0, JSON.stringify(said));

  said.length = 0;
  await report({ where: "square-card-mount" });
  ok("a report with no message still logs, saying so",
     said.some((l) => /no message/.test(l)), JSON.stringify(said));

  said.length = 0;
  await report({ where: "square-card-mount", message: "x".repeat(5000) });
  const long = said.find((l) => /square-card-mount/.test(l)) ?? "";
  ok("a very long message is truncated", long.length < 400, String(long.length));

  // The flood. Twenty is enough for a genuinely broken deploy reporting from
  // several browsers; the twenty-first is dropped and said so once.
  said.length = 0;
  for (let i = 0; i < 40; i += 1) {
    await report({ where: "square-card-mount", message: `attempt ${i}` });
  }
  const logged = said.filter((l) => /square-card-mount:/.test(l)).length;
  ok("a flood is capped rather than filling the log", logged <= 20, `${logged} lines`);
  ok("and the cap announces itself once",
     said.filter((l) => /rate limit reached/.test(l)).length === 1,
     JSON.stringify(said.filter((l) => /rate limit/.test(l))));

  console.error = realError;
  console.warn = realWarn;
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
