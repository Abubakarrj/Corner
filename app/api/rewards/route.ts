import { cookies } from "next/headers";
import QRCode from "qrcode";
import { SESSION_COOKIE, readSession } from "../../auth/auth0";
import { isDatabaseConfigured } from "../../db";
import { POINTS_PER_DOLLAR, joinRewards, memberOf } from "../../rewards";

// Corner Rewards, for the signed-in customer.
//
//   GET   this account's membership, balance and code
//   POST  join
//
// ——— Whose ———
//
// The session cookie's, same rule as /api/orders: the email comes from a
// signed JWT and there is no account parameter, so there is no way to read
// somebody else's balance or mint a code against their address.
//
// Signed out is 204 rather than 401, for the same reason as there: not being
// signed in is the ordinary state of most people using this shop, and a 401
// in a console reads like a fault.
//
// ——— The code is rendered here ———
//
// The QR is encoded server-side and sent as an SVG string. A counter needs to
// scan it in a hurry under whatever lighting a bagel shop has, so it wants to
// be crisp at any size — and encoding it here keeps a QR library out of the
// browser bundle entirely, on a screen most visitors never open.
//
// It is black on white and stays black on white. See the colour note below.
//
// What the code *contains* is the member code and nothing else. Not the
// email, not a token that authorises anything: a screen photographed by
// whoever is behind the counter should name an account without exposing one,
// and a code that could be used to act on an account would be a credential
// people hold up in public.

export const dynamic = "force-dynamic";

async function currentEmail(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await readSession(token);
  return session?.email ?? null;
}

async function withCode(member: Awaited<ReturnType<typeof memberOf>>) {
  if (!member) return null;
  const svg = await QRCode.toString(member.code, {
    type: "svg",
    // The quiet zone, and it is not decoration. A QR with no margin sitting
    // against a card is a code a reader has to find the edges of; the spec
    // asks for four modules of blank on every side and scanners built to it
    // give up without them. Four, in the SVG rather than in CSS padding, so
    // it scales with the code instead of with the layout.
    margin: 4,
    errorCorrectionLevel: "M",
    // Black on white, in both themes, and deliberately not the theme's own
    // colours. The first cut left the fill to the page so the code could
    // follow dark mode, which produced a black code on a near-black card —
    // invisible, and unscannable even where it wasn't, because readers expect
    // dark modules on a light field and many will not try the inverse.
    color: { dark: "#000000", light: "#ffffff" },
  }).catch(() => null);
  return { ...member, svg };
}

export async function GET() {
  if (!isDatabaseConfigured()) return new Response(null, { status: 204 });
  const email = await currentEmail();
  if (!email) return new Response(null, { status: 204 });

  const member = await withCode(await memberOf(email));
  // `member: null` is "not joined", which is a real answer and the join
  // screen's cue — distinct from the 204 above, which is "we cannot say".
  return Response.json({ member, pointsPerDollar: POINTS_PER_DOLLAR });
}

export async function POST() {
  if (!isDatabaseConfigured()) return new Response(null, { status: 204 });
  const email = await currentEmail();
  if (!email) return new Response(null, { status: 204 });

  const member = await withCode(await joinRewards(email));
  if (!member) {
    return Response.json({ error: "api.somethingWentWrong" }, { status: 503 });
  }
  return Response.json({ member, pointsPerDollar: POINTS_PER_DOLLAR });
}
