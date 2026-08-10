import { cookies } from "next/headers";
import { isStaffConfigured, signIn } from "../../../staff/staff";
import {
  isStaffSessionConfigured,
  mintStaffSession,
  sessionCookie,
} from "../../../staff/session";

// Staff sign-in. Email and password in, a session cookie out.
//
// Node rather than the edge: scrypt is node:crypto.
export const runtime = "nodejs";

// ——— Throttling ———
//
// Per address, in memory, with the same caveats as every other limiter in this
// app: it resets on deploy and does not span instances. That is worth having
// anyway. A password this short-lived a codebase can protect is one nobody can
// take a thousand guesses at from one machine, and five attempts in fifteen
// minutes is far more than a person mistyping and far less than a script.
//
// Keyed by address rather than by IP, deliberately. Everybody at the shop is
// behind the same router, so an IP limit would mean one person fat-fingering
// their password locks out the whole counter. Somebody attacking one account
// is slowed either way.
const ATTEMPTS = new Map<string, number[]>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

function tooMany(email: string): boolean {
  const now = Date.now();
  const recent = (ATTEMPTS.get(email) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  ATTEMPTS.set(email, recent);
  if (ATTEMPTS.size > 2000) {
    for (const [key, times] of ATTEMPTS) {
      if (times.every((at) => now - at >= WINDOW_MS)) ATTEMPTS.delete(key);
    }
  }
  return recent.length > MAX_ATTEMPTS;
}

export async function POST(request: Request) {
  if (!isStaffConfigured() || !isStaffSessionConfigured()) {
    // Said plainly rather than as a wrong-password message. Nobody can fix this
    // by typing more carefully, and a team member staring at "that didn't work"
    // when the truth is "nobody set STAFF_ACCOUNTS" is an hour wasted.
    return Response.json({ error: "Staff sign-in isn't set up yet." }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  const body = (payload ?? {}) as { email?: unknown; password?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (email === "" || password === "") {
    return Response.json({ error: "Email and password, please." }, { status: 400 });
  }

  if (tooMany(email)) {
    return Response.json(
      { error: "Too many attempts. Try again in fifteen minutes." },
      { status: 429 },
    );
  }

  const identity = signIn(email, password);
  if (!identity) {
    // One message for a wrong password and for an address that isn't staff at
    // all. The alternative tells anybody who asks which addresses work here.
    return Response.json({ error: "That email and password don't match." }, { status: 401 });
  }

  const jar = await cookies();
  jar.set(sessionCookie(await mintStaffSession(identity)));
  return Response.json({ ok: true, staff: identity });
}
