import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  isAuthConfigured,
  mintSession,
  verifyEmailCode,
} from "../../../auth/auth0";

// Step two: the code comes back, and if Auth0 agrees, a session cookie goes
// out. httpOnly so no script can read it, sameSite=lax so it survives an
// ordinary navigation but doesn't ride along on a cross-site POST, and secure
// everywhere except a local http dev server.
export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return Response.json({ error: "Sign-in is unavailable right now. Try again in a moment." }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const body = payload as { email?: unknown; code?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!email || !/^\d{4,8}$/.test(code)) {
    return Response.json({ error: "Enter the code we emailed you." }, { status: 400 });
  }

  const result = await verifyEmailCode(email, code);
  if (!result.ok) {
    if (result.wrongCode) {
      return Response.json(
        { error: "That code didn't work. It may have expired — send a new one." },
        { status: 401 },
      );
    }
    console.error(`[auth] verify failed: ${result.error}`);
    return Response.json({ error: "We couldn't check that code." }, { status: 502 });
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, await mintSession(result.user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return Response.json(
    { ok: true, user: { email: result.user.email, name: result.user.name } },
    { status: 200 },
  );
}
