import { LOCATIONS } from "../../../(marketing)/locations/locations";
import { recordDemand } from "../../../demand";
import { clientIp, throttle } from "../../../rateLimit";

// Somebody opening the catering sheet.
//
// ——— Why catering needs an endpoint at all ———
//
// A catering order does not pass through this app. The sheet hands over a
// pre-addressed email and the conversation happens in the shop's inbox, which
// is the right design for a request that involves a headcount and a date — but
// it means the app has no idea how much catering is being asked for, and a
// daily digest that reported nothing under Catering would read as "nobody
// wants it" rather than "we cannot see it".
//
// So this counts the one thing the app can honestly observe: somebody reached
// the catering sheet for a particular counter and took the action that starts
// the conversation. That is interest, not an order, and the digest labels it
// that way. Turning it into a number the shop can act on properly means giving
// catering a real form that posts here — which is a bigger change than this,
// and worth doing if the interest numbers say it is.
//
// ——— Public, so throttled ———
//
// There is nobody to authenticate: this fires from a marketing page before any
// account exists. A public counter is a public counter, and one that could be
// driven up by anybody would put a neighbourhood on a map that never asked for
// anything. Ten an hour from one address is far above what a person browsing
// does and far below what would move a weekly total.
const TAPS = throttle({ windowMs: 60 * 60_000, max: 10 });

export async function POST(request: Request) {
  if (TAPS.exceeded(clientIp(request))) {
    // Quietly. Nothing on the page is waiting on this, and telling a script it
    // has been throttled is telling it to slow down rather than stop.
    return new Response(null, { status: 204 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }

  const id = (payload as { locationId?: unknown } | null)?.locationId;
  const store = typeof id === "string" ? LOCATIONS.find((l) => l.id === id) : undefined;
  // A counter we do not have, or one that does not cater. Either way there is
  // nothing true to count, and 204 rather than an error because the page has
  // no use for the difference.
  if (!store || store.catering !== true) return new Response(null, { status: 204 });

  await recordDemand({
    mode: "catering",
    outcome: "interest",
    channel: "catering",
    // The counter's own coordinates. Nobody has told us where the tray is
    // going — that is in the email they are about to write — so the honest
    // location of this is the shop it was asked of.
    at: store.position,
    counter: store.id,
  });

  return new Response(null, { status: 204 });
}
