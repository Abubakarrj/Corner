import { authorized, notFound } from "../../diagnostics";
import { db, explainDbError, isDatabaseConfigured } from "../../db";
import { isAuthConfigured } from "../../auth/auth0";
import { isEmailConfigured } from "../../email";
import { googleMapsKey } from "../../googleMaps";
import { pushProblem } from "../../push/send";
import { isToastConfigured, toastReachable } from "../../toast";
import { isUberConfigured } from "../../uberDirect";

// What is actually switched on, in one request.
//
// ——— Why this exists ———
//
// "Do we have a Postgres set up?" is a question I could not answer, and had
// been answering anyway from a to-do list rather than from evidence. Nothing
// in this repository can see a hosting dashboard, and every integration here
// fails softly by design — no database means the queue says it does not know,
// no Toast means orders are logged, no Resend means an application is written
// to a log. All correct, and all invisible from outside.
//
// So the deployment gets to answer for itself.
//
// ——— Two kinds of answer, and the difference matters ———
//
//   checked      something was actually asked. Postgres was queried, Toast was
//                asked for a token. `on` means it answered.
//   configured   the environment variables are present and nothing was tried.
//                `on` means somebody set it, not that it works.
//
// The Google keys taught this the hard way: they were set, they looked right,
// and Routes had been refusing every call for weeks. So the two are labelled
// differently rather than lumped into one green tick, and anything reading
// `configured` should be treated as "not yet disproved".
//
// Nothing here reveals a key, a host, a connection string, or a length.

export const dynamic = "force-dynamic";

type Check = {
  on: boolean;
  how: "checked" | "configured";
  /** What is lost while it is off. Present only when it is off. */
  without?: string;
};

async function databaseCheck(): Promise<Check> {
  if (!isDatabaseConfigured()) {
    return {
      on: false,
      how: "checked",
      without:
        "DATABASE_URL is not set. Push notifications cannot be stored, and the" +
        " queue line under the Order button renders nothing.",
    };
  }
  const client = db();
  if (!client) return { on: false, how: "checked", without: "no pool" };
  try {
    // The only honest way to answer "do we have a Postgres". A connection
    // string in the environment is not a database that answers.
    await client.query("SELECT 1");
    return { on: true, how: "checked" };
  } catch (error) {
    return {
      on: false,
      how: "checked",
      without: `DATABASE_URL is set but the server refused: ${explainDbError(error)}`,
    };
  }
}

async function toastCheck(): Promise<Check> {
  if (!isToastConfigured()) {
    return {
      on: false,
      how: "checked",
      without:
        "Orders are logged on the server and never reach the kitchen, and the" +
        " queue falls back to counting what this app placed.",
    };
  }
  const reachable = await toastReachable();
  return reachable.ok
    ? { on: true, how: "checked" }
    : { on: false, how: "checked", without: reachable.why };
}

export async function GET(request: Request) {
  if (!authorized(request)) return notFound();

  const push = pushProblem();
  const [database, toast] = await Promise.all([databaseCheck(), toastCheck()]);

  const checks: Record<string, Check> = {
    database,
    toast,
    uber: {
      on: isUberConfigured(),
      how: "configured",
      ...(isUberConfigured() ? {} : { without: "Delivery is unavailable; pickup still works." }),
    },
    googleMaps: {
      on: googleMapsKey() !== null,
      how: "configured",
      ...(googleMapsKey()
        ? {}
        : { without: "No map, no address search, no delivery radius." }),
    },
    push: {
      on: push === null,
      how: "configured",
      ...(push === null ? {} : { without: push }),
    },
    email: {
      on: isEmailConfigured(),
      how: "configured",
      ...(isEmailConfigured()
        ? {}
        : { without: "Job applications are logged rather than sent." }),
    },
    auth: {
      on: isAuthConfigured(),
      how: "configured",
      ...(isAuthConfigured() ? {} : { without: "Nobody can sign in." }),
    },
    riley: {
      on: Boolean(process.env.ANTHROPIC_API_KEY),
      how: "configured",
      ...(process.env.ANTHROPIC_API_KEY
        ? {}
        : { without: "The chat says it cannot answer and points at the shop's email." }),
    },
  };

  const off = Object.entries(checks)
    .filter(([, check]) => !check.on)
    .map(([name]) => name);

  return Response.json({
    ok: off.length === 0,
    summary: off.length === 0 ? "Everything is on." : `Off: ${off.join(", ")}.`,
    // Said plainly, because "configured" is the weaker of the two words and
    // the one somebody is most likely to read as "working".
    note:
      "`checked` was asked and answered. `configured` means the variables are" +
      " set and nothing was tried — for Google specifically, /api/maps-check" +
      " actually calls the three APIs.",
    checks,
  });
}
