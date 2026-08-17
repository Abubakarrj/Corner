import { isAuthConfigured } from "../../auth/auth0";
import { isDatabaseConfigured } from "../../db";
import { pushProblem } from "../../push/send";
import { SHOP_PHONE, openPreview } from "../../shopFacts";
import { isUberConfigured } from "../../uberDirect";

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

// ——— ⚠️ Whether the checkout offers a card at all ———
//
// This used to return true whenever Toast was configured, and that was wrong
// in the way that costs a shop money.
//
// Toast being configured means orders reach the kitchen. It does not mean
// anybody can pay. Read the note at the top of app/toast.ts: the order is
// created *unpaid*, and what settles it is either the counter or a Toast
// payment token applied to the check. No token is ever made. app/shop/
// checkout/card.ts is equally explicit — the number never leaves the browser,
// describeCard() returns a brand and four digits, and there is no code path
// that sends a card anywhere.
//
// So with Toast configured, the checkout offered a card, and choosing it
// showed "Your card is charged when the shop confirms the order" on the
// checkout and again on the confirmation. Nothing charged it. A customer
// selects card, is told they have paid, collects breakfast, and the shop is
// never paid. The tender defaults to the counter, so it took a deliberate
// tap — which narrows how many people it happened to and does nothing about
// what happened to them.
//
// A card can be offered when there is something to take it with. There isn't
// yet, so this is false in production, full stop. What turns it on is not an
// environment variable: it is mounting Toast's hosted payment element, taking
// back a token, and applying that token to the check. card.ts describes the
// shape of that work at the bottom of its header.
//
// Still true in development and under PAYMENTS_PREVIEW, because the card
// screen is the most designed part of the checkout and the only way to review
// it otherwise was to go live with it.
//
// ⚠️ PAYMENTS_PREVIEW is for looking, never for a deploy real customers use.
// It makes the checkout claim a charge that cannot happen.
function paymentsEnabled(): boolean {
  if (process.env.PAYMENTS_PREVIEW === "1") return true;
  return process.env.NODE_ENV !== "production";
}

// Which of the three Uber variables the environment actually has.
//
// Delivery is all-or-nothing — one missing name and the finder says delivery
// is unavailable, with no way from the outside to tell which one. That is the
// same shape of problem CAREERS_INBOX had: a correct-looking configuration, a
// feature quietly off, and nothing to read.
//
// Logged rather than returned. The response stays booleans-only, because this
// endpoint is public and which secrets a deployment holds is not something to
// publish; the log is in front of whoever is doing the configuring.
function reportUberGap(): void {
  const missing = [
    ["UBER_DIRECT_CUSTOMER_ID", process.env.UBER_DIRECT_CUSTOMER_ID],
    ["UBER_DIRECT_CLIENT_ID", process.env.UBER_DIRECT_CLIENT_ID],
    ["UBER_DIRECT_CLIENT_SECRET", process.env.UBER_DIRECT_CLIENT_SECRET],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  console.warn(
    `[capabilities] delivery is OFF. Missing: ${missing.join(", ")}.` +
      " All three are required, spelled exactly as above, and Render needs a" +
      " redeploy after they are added.",
  );
}

// ——— Whether a phone will actually buzz ———
//
// Push has three legs and they fail in three different places, so each of them
// looked fine from where its own code sits while the feature as a whole did
// nothing.
//
// The VAPID keys are validated properly already, in send.ts. The other two are
// not:
//
//   the database   holds the subscriptions. Without it a device can be granted
//                  permission, register happily, and be findable by nobody:
//                  subscriptionsForProvider returns an empty list and announce
//                  returns early. Nothing errors on either side. See the note
//                  at the top of push/store.ts — this is the exact failure it
//                  warns about, and until now nothing said it out loud.
//
//   the webhook    is what makes a notification arrive while the app is shut.
//                  Without UBER_WEBHOOK_SECRET the endpoint refuses Uber's
//                  messages, so the only thing that ever calls refresh() is a
//                  tracker somebody is already looking at — and a notification
//                  to a screen in front of you is not the feature.
//
// Same shape as the delivery report below it: named in the log, where whoever
// is doing the configuring can read it, and a plain boolean in the response.
function pushGap(): string[] {
  const gaps: string[] = [];
  const keys = pushProblem();
  if (keys) gaps.push(`VAPID: ${keys}`);
  if (!isDatabaseConfigured()) {
    gaps.push(
      "CORNER_DATABASE_URL is not set, so there is nowhere to keep a" +
        " subscription. Devices will register and never be sent anything",
    );
  }
  if (!process.env.UBER_WEBHOOK_SECRET) {
    gaps.push(
      "UBER_WEBHOOK_SECRET is not set, so Uber's delivery events are refused" +
        " and nothing can reach a phone unless the tracker is open on it",
    );
  }
  return gaps;
}

export function GET() {
  const delivery = isUberConfigured();
  if (!delivery) reportUberGap();

  const gaps = pushGap();
  const push = gaps.length === 0;
  if (!push) {
    console.warn(
      `[capabilities] push is INCOMPLETE. ${gaps.join(". ")}.` +
        " Render needs a redeploy after any of these are added.",
    );
  }

  return Response.json({
    auth: isAuthConfigured(),
    payments: paymentsEnabled(),
    chat: Boolean(process.env.ANTHROPIC_API_KEY),
    // Whether a courier can actually be booked. This belonged here from the
    // start and was the one integration left out, which had a cost: the
    // finder offered Delivery whatever the environment said, so somebody
    // chose it, typed their address, waited for a quote, and only then got
    // told delivery was down. The dead end was at the end.
    //
    // Three variables turn it on — UBER_DIRECT_CUSTOMER_ID, CLIENT_ID and
    // CLIENT_SECRET — and nothing else does. There is no flag, and no code
    // change: the whole delivery path is built and waiting on them.
    delivery,
    // Whether a notification would actually land on a phone: keys, a place to
    // keep the subscription, and the webhook that fires while the app is shut.
    // Reported so a shop can tell "nobody has turned notifications on" from
    // "notifications cannot work here", which read identically from outside.
    push,
    // The one non-boolean here, and it is not a secret: a shop's phone number
    // is on its window.
    //
    // Read from shopFacts rather than straight from the environment, which is
    // the whole change. It used to come from process.env and fall back to
    // null, because shopFacts held a placeholder for the courier's benefit and
    // a Call button that rings +1 213 555 1234 is worse than no Call button.
    // There is a real line now, so the guard has nothing left to guard.
    phone: SHOP_PHONE,
    // ⚠️ True only when SHOP_OPEN_PREVIEW is set, which must never be a
    // deploy real customers use. Reported so the screens agree with the
    // server rather than showing "closed" over an endpoint that accepts.
    openPreview: openPreview(),
  });
}
