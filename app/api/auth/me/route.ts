import { cookies } from "next/headers";
import { SESSION_COOKIE, isAuthConfigured, readSession } from "../../../auth/auth0";

// Who the session says you are. The client store calls this once on load,
// because the cookie is httpOnly and script can't read it — which is the point.
export async function GET() {
  if (!isAuthConfigured()) {
    return Response.json({ user: null, configured: false }, { status: 200 });
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await readSession(token);
  return Response.json(
    { user: user ? { email: user.email, name: user.name } : null, configured: true },
    { status: 200 },
  );
}
