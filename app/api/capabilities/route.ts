import { isAuthConfigured } from "../../auth/auth0";
import { SHOP_PHONE } from "../../shopFacts";
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

// Whether the checkout offers a card at all.
//
// True when there's a processor configured. Also true in development, and on
// any deploy that sets PAYMENTS_PREVIEW=1 — which is for looking at the card
// screen, not for taking money. Nothing here makes a charge happen: what takes
// money is Toast, and Toast is either configured or it isn't.
//
// The exception exists because the alternative was worse in a specific way.
// Card entry is the most designed part of the checkout and it was invisible
// unless you had production credentials, so the only way to review it was to
// go live with it. A preview flag is the smaller risk, and it is opt-in.
//
// ⚠️ Don't set PAYMENTS_PREVIEW on a deploy real customers use. Without a
// processor behind it, the checkout will say the card is charged when the shop
// confirms the order, and nothing will charge it.
function paymentsEnabled(): boolean {
  if (isToastConfigured()) return true;
  if (process.env.PAYMENTS_PREVIEW === "1") return true;
  return process.env.NODE_ENV !== "production";
}

export function GET() {
  return Response.json({
    auth: isAuthConfigured(),
    payments: paymentsEnabled(),
    chat: Boolean(process.env.ANTHROPIC_API_KEY),
    // The one non-boolean here, and it is not a secret: a shop's phone number
    // is on its window.
    //
    // Read from shopFacts rather than straight from the environment, which is
    // the whole change. It used to come from process.env and fall back to
    // null, because shopFacts held a placeholder for the courier's benefit and
    // a Call button that rings +1 213 555 1234 is worse than no Call button.
    // There is a real line now, so the guard has nothing left to guard.
    phone: SHOP_PHONE,
  });
}
