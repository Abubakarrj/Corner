import "server-only";

import { SignJWT, jwtVerify } from "jose";
import type { StaffRole } from "./staff";

// Inviting somebody onto the team.
//
// ——— The honest shape of this, given there is no database ———
//
// An invite normally ends with a row appearing in a users table. There is no
// users table here — accounts are a config value, for the reasons set out at
// the top of staff.ts — so the last step cannot be automatic. What this does
// instead:
//
//   1. An admin enters an address and a role. A signed invite link is mailed
//      to that address, good for seven days.
//   2. The invitee opens it and chooses their own password. Nobody else ever
//      sees it, which is already better than an admin picking one and sending
//      it over text.
//   3. The server hashes it and emails the finished STAFF_ACCOUNTS line to
//      every admin. One paste and one redeploy and they can sign in.
//
// Step three is a manual step and there is no point dressing it up. It is fine
// for the shop this serves — a handful of people, a few changes a year — and
// it stops being fine somewhere around fifteen. When it does, the fix is a
// small store behind staff.ts's parse(), and this flow's steps one and two are
// already the right shape for it: the only change is that step three writes a
// row instead of sending mail.
//
// ——— The token ———
//
// A signed JWT and nothing else. It carries the address, the role and the
// location, so none of those can be swapped by whoever opens the link — an
// invite as a "member" cannot be redeemed into an admin account by editing a
// form field. It is signed with the staff session secret but stamped with its
// own audience, so an invite is not a session and a session is not an invite,
// which is checked rather than assumed.

const AUDIENCE = "staff-invite";
const DAYS = 7;

function secret(): Uint8Array | null {
  const value = process.env.STAFF_SESSION_SECRET;
  if (!value || value.length < 32) return null;
  return new TextEncoder().encode(value);
}

export type Invite = {
  email: string;
  name: string;
  role: StaffRole;
  locationId: string;
  invitedBy: string;
};

export async function mintInvite(invite: Invite): Promise<string> {
  const key = secret();
  if (!key) throw new Error("mintInvite without STAFF_SESSION_SECRET");
  return new SignJWT({
    name: invite.name,
    role: invite.role,
    loc: invite.locationId,
    by: invite.invitedBy,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(invite.email)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${DAYS}d`)
    .sign(key);
}

export async function readInvite(token: string): Promise<Invite | null> {
  const key = secret();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { audience: AUDIENCE });
    const role = payload.role;
    if (
      typeof payload.sub !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.loc !== "string" ||
      typeof payload.by !== "string" ||
      (role !== "admin" && role !== "member")
    ) {
      return null;
    }
    return {
      email: payload.sub,
      name: payload.name,
      role,
      locationId: payload.loc,
      invitedBy: payload.by,
    };
  } catch {
    // Expired, tampered with, or a session token being tried as an invite.
    return null;
  }
}

export const INVITE_DAYS = DAYS;
