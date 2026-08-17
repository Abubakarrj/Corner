import { cookies } from "next/headers";
import { SESSION_COOKIE, canSignIn, readSession } from "../../../auth/auth0";

// Who the session says you are. The client store calls this once on load,
// because the cookie is httpOnly and script can't read it — which is the point.
export async function GET() {
  // canSignIn, not isAuthConfigured. On a deploy with no Auth0 tenant but a
  // test login set up, sign-in genuinely works — and reporting `configured:
  // false` here makes the client hide the sign-in screen the bypass exists to
  // reach, which is the whole feature turned off by its own status check.
  if (!canSignIn()) {
    return Response.json({ user: null, configured: false }, { status: 200 });
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await readSession(token);
  return Response.json(
    { user: user ? { email: user.email, name: user.name } : null, configured: true },
    { status: 200 },
  );
}
