import { cookies } from "next/headers";
import { clearedCookie } from "../../../staff/session";

// Signing out. POST, not GET: a link somebody can be tricked into following
// should not be able to end a shift's session mid-order.
export async function POST() {
  const jar = await cookies();
  jar.set(clearedCookie());
  return Response.json({ ok: true });
}
