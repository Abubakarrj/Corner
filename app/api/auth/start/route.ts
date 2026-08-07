import { isAuthConfigured, startEmailCode } from "../../../auth/auth0";

// Step one: mail a code to an address.
//
// Rate-limited by address, in memory. That is not a real rate limiter — it
// doesn't survive a restart and doesn't span instances — but it is the
// difference between "somebody can use our Auth0 tenant to send a stranger a
// hundred emails" and "they can send three". A shared store (Redis, or Auth0's
// own attack protection, which should also be on) is the real answer.
const RECENT = new Map<string, number[]>();
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 3;

function tooMany(email: string): boolean {
  const now = Date.now();
  const hits = (RECENT.get(email) ?? []).filter((at) => now - at < WINDOW_MS);
  hits.push(now);
  RECENT.set(email, hits);
  // Keep the map from growing without bound on a long-lived instance.
  if (RECENT.size > 5000) {
    for (const [key, times] of RECENT) {
      if (times.every((at) => now - at >= WINDOW_MS)) RECENT.delete(key);
    }
  }
  return hits.length > MAX_PER_WINDOW;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return Response.json(
      { error: "api.signInUnavailable" },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "api.badJson" }, { status: 400 });
  }

  const email = (payload as { email?: unknown })?.email;
  if (typeof email !== "string" || !EMAIL.test(email.trim())) {
    return Response.json({ error: "checkout.validEmail" }, { status: 400 });
  }
  const address = email.trim().toLowerCase();

  if (tooMany(address)) {
    return Response.json(
      { error: "api.codeRateLimit" },
      { status: 429 },
    );
  }

  const result = await startEmailCode(address);
  if (!result.ok) {
    console.error(`[auth] passwordless start failed: ${result.error}`);
    return Response.json(
      { error: "api.codeSendFailed" },
      { status: 502 },
    );
  }

  // Always the same answer, whether or not that address has an account —
  // otherwise this endpoint tells a stranger who is a customer here.
  return Response.json({ ok: true }, { status: 200 });
}
