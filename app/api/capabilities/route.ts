import { isAuthConfigured } from "../../auth/auth0";
import { isToastConfigured } from "../../toast";

// What's actually switched on, decided at request time.
//
// The app's copy follows this rather than hardcoding "coming soon" anywhere:
// when the credentials are in the environment the screens say and do the live
// thing, and when they aren't they say so. That means switching a capability
// on is adding an env var and restarting, not editing components — and it
// means the app can never claim to take payment it isn't taking.
//
// Read at request time, not at build: these are set when the thing is
// deployed, and a value baked into a prerendered page at build time would be
// wrong for exactly the deploy that turns it on.
//
// Booleans only. Nothing here reveals a key, a host, or whether a given
// address has an account.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    auth: isAuthConfigured(),
    payments: isToastConfigured(),
    chat: Boolean(process.env.ANTHROPIC_API_KEY),
    // The one non-boolean here, and it is not a secret: a shop's phone number
    // is on its window. It is null until a real one is set, because
    // shopFacts falls back to a placeholder for the courier's benefit and
    // offering a customer a Call button that rings +1 213 555 1234 is worse
    // than offering no Call button at all.
    phone: process.env.SHOP_PHONE?.trim() || null,
  });
}
