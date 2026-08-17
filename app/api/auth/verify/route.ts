import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  isAuthConfigured,
  mintSession,
  verifyEmailCode,
} from "../../../auth/auth0";
import { checkTestCode, testUser } from "../../../auth/testLogin";

// One helper for the cookie, because there are two ways to earn it now and a
// session minted with different flags depending on which one you came through
// is a bug waiting for whichever branch somebody forgets to update.
async function setSession(user: { sub: string; email: string; name: string }) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await mintSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

// Step two: the code comes back, and if Auth0 agrees, a session cookie goes
// out. httpOnly so no script can read it, sameSite=lax so it survives an
// ordinary navigation but doesn't ride along on a cross-site POST, and secure
// everywhere except a local http dev server.
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "api.badJson" }, { status: 400 });
  }

  const body = payload as { email?: unknown; code?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!email || !/^\d{4,8}$/.test(code)) {
    return Response.json({ error: "api.enterCode" }, { status: 400 });
  }

  // ——— The debug pair, before Auth0 is consulted or required ———
  //
  // Ahead of the configured check for the same reason /start is: on a deploy
  // with no tenant this is the only way past, and behind the 503 it would never
  // run. It answers only for the one configured address and falls straight
  // through for every other, so nothing about the ordinary path changes.
  //
  // Its own rate limit lives in testLogin.ts. The real codes are watched by
  // Auth0's attack protection and this path never reaches Auth0, so without one
  // there would be nothing at all between eight digits and a session.
  const test = checkTestCode(email, code);
  if (test.ok) {
    await setSession(testUser(test.email));
    const user = testUser(test.email);
    return Response.json(
      { ok: true, user: { email: user.email, name: user.name } },
      { status: 200 },
    );
  }
  if (test.rateLimited) {
    return Response.json({ error: "api.codeRateLimit" }, { status: 429 });
  }

  if (!isAuthConfigured()) {
    return Response.json({ error: "api.signInUnavailable" }, { status: 503 });
  }

  const result = await verifyEmailCode(email, code);
  if (!result.ok) {
    if (result.wrongCode) {
      return Response.json(
        { error: "api.codeWrong" },
        { status: 401 },
      );
    }
    console.error(`[auth] verify failed: ${result.error}`);
    return Response.json({ error: "api.codeCheckFailed" }, { status: 502 });
  }

  await setSession(result.user);

  return Response.json(
    { ok: true, user: { email: result.user.email, name: result.user.name } },
    { status: 200 },
  );
}
