import { cookies } from "next/headers";
import { SESSION_COOKIE } from "../../../auth/auth0";

// POST rather than GET: a link somebody else can put on a page shouldn't be
// able to sign you out.
export async function POST() {
  (await cookies()).set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return Response.json({ ok: true }, { status: 200 });
}
