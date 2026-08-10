import "server-only";

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { StaffIdentity, StaffRole } from "./staff";

// The staff session: a signed JWT in an httpOnly cookie, exactly like the
// customer one in app/auth/auth0.ts, and deliberately not the same cookie.
//
// Different name, different secret, different lifetime. Nothing signed by one
// verifies under the other, so there is no code path — including one somebody
// writes next year — where a customer session is mistaken for a staff session.
// That is a guarantee from the cryptography rather than from a check anybody
// has to remember.
//
// ——— Twelve hours ———
//
// A shift. The customer session runs thirty days because the cost of
// re-authenticating is an email and the risk is somebody seeing their own
// order history. This one can place purchase orders against the shop's
// suppliers from a tablet on a counter, and a tablet on a counter is a device
// other people can pick up. It expires by the end of the day it started.

const COOKIE = "cb_staff";
const HOURS = 12;
const MAX_AGE = HOURS * 60 * 60;

function secret(): Uint8Array | null {
  const value = process.env.STAFF_SESSION_SECRET;
  // No fallback, and no reuse of AUTH0_SESSION_SECRET. A default secret is a
  // published secret, and sharing one with the customer session would undo the
  // separation this file exists for.
  if (!value || value.length < 32) return null;
  return new TextEncoder().encode(value);
}

export function isStaffSessionConfigured(): boolean {
  return secret() !== null;
}

export async function mintStaffSession(identity: StaffIdentity): Promise<string> {
  const key = secret();
  if (!key) throw new Error("mintStaffSession without STAFF_SESSION_SECRET");
  return new SignJWT({
    name: identity.name,
    role: identity.role,
    loc: identity.locationId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(identity.email)
    .setIssuedAt()
    .setExpirationTime(`${HOURS}h`)
    .sign(key);
}

async function read(token: string | undefined): Promise<StaffIdentity | null> {
  const key = secret();
  if (!key || !token) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    const role = payload.role;
    if (
      typeof payload.sub !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.loc !== "string" ||
      (role !== "admin" && role !== "member")
    ) {
      return null;
    }
    return {
      email: payload.sub,
      name: payload.name,
      role: role as StaffRole,
      locationId: payload.loc,
    };
  } catch {
    // Expired, or signed with something else. Either way there is no session.
    return null;
  }
}

/** Who is signed in, from the request's cookies. Null when nobody is.
 *
 *  The role and the location come out of the token rather than being looked up
 *  again, which means a change to somebody's role or shop takes effect when
 *  their session expires rather than immediately. At twelve hours that is a
 *  shift's delay, and the alternative — re-reading the account on every request
 *  — would make the env the hot path for every page load. Removing somebody
 *  urgently means rotating STAFF_SESSION_SECRET, which signs everyone out at
 *  once; that is the emergency lever and it is worth knowing about. */
export async function currentStaff(): Promise<StaffIdentity | null> {
  const jar = await cookies();
  return read(jar.get(COOKIE)?.value);
}

export function sessionCookie(token: string) {
  return {
    name: COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  };
}

export function clearedCookie() {
  return { ...sessionCookie(""), maxAge: 0 };
}
