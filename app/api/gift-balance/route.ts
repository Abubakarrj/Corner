import { giftCardBalance, isGiftCardsConfigured } from "../../squareGiftCards";
import { clientIp, throttle } from "../../rateLimit";

// What is left on a gift card.
//
// ——— ⚠️ This endpoint is an oracle, and that is what shapes all of it ———
//
// A gift account number is a bearer instrument: whoever knows it can spend it.
// An endpoint that answers "yes, that is a card, and it has $50 on it" is
// therefore a machine for finding other people's money by guessing, and the
// only things standing between it and that are on this page.
//
// So:
//
//   · it is throttled hard, per address, on a long window. Ten guesses an hour
//     is more balance checks than any human makes and useless for a search.
//
//   · "no such card" and "wrong number" answer identically. Distinguishing them
//     tells a guesser their guess was close, which is the whole game.
//
//   · a card that exists but is not ACTIVE also answers not-found. Whether a
//     number belongs to a deactivated card is not something a stranger should
//     be able to learn.
//
//   · ⚠️ the number is never logged. Not on success, not on failure, not in a
//     warning about the throttle. A log line with a GAN in it is money sitting
//     in a file that anybody with log access can read.
//
//   · POST, not GET, so the number stays out of URLs — and therefore out of
//     access logs, referer headers, and the customer's own browser history.
//
// ——— What this cannot do ———
//
// Read only. Nothing here spends anything. Redeeming happens at the counter,
// through Square's own till, or at the checkout — see /api/shop-order.

export const dynamic = "force-dynamic";

/** ⚠️ Ten an hour, per address. Deliberately mean.
 *
 *  A gift account number is sixteen digits, so guessing one at ten an hour is
 *  hopeless, which is the point. Somebody who has actually been given a card
 *  looks it up once or twice.
 *
 *  In-memory and per-instance — see rateLimit.ts about exactly what that is
 *  worth. It is a ceiling that resets on deploy, which is still a ceiling. */
const lookups = throttle({ windowMs: 60 * 60 * 1000, max: 10 });

export async function POST(request: Request) {
  if (!isGiftCardsConfigured()) {
    return Response.json({ error: "gift.balanceUnavailable" }, { status: 503 });
  }

  if (lookups.exceeded(clientIp(request))) {
    // ⚠️ No number in this line. The address is enough to know somebody is
    // hammering it, and the number is the thing worth stealing.
    console.warn(`[gift-balance] throttled ${clientIp(request)}`);
    return Response.json({ error: "api.tooManyAttempts" }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "api.badJson" }, { status: 400 });
  }

  const raw = (payload as { gan?: unknown })?.gan;
  // Digits only, whatever spacing the card was written with — the message this
  // number arrived in groups it in fours, so somebody will type it that way.
  const gan = typeof raw === "string" ? raw.replace(/\D/g, "") : "";

  // Answered without asking Square. A length no card has is not a lookup worth
  // spending, and it is the same answer as a wrong number either way.
  if (gan.length < 8 || gan.length > 20) {
    return Response.json({ error: "gift.cardNotFound" }, { status: 404 });
  }

  const card = await giftCardBalance(gan);
  if (!card.ok) {
    // ⚠️ One answer for every way this can go wrong that involves the number.
    // "not-found" and a Square error read the same to the caller; the log is
    // where the difference lives, and it names no number.
    if (card.reason !== "not-found") {
      console.error(`[gift-balance] Square refused a lookup: ${card.reason}`);
    }
    return Response.json({ error: "gift.cardNotFound" }, { status: 404 });
  }

  // ⚠️ Same answer for a card that exists and is not usable. Whether a given
  // number belongs to a deactivated card is not a stranger's business.
  if (card.state !== "ACTIVE") {
    return Response.json({ error: "gift.cardNotFound" }, { status: 404 });
  }

  // The balance, and nothing else. Not Square's id for the card, not when it
  // was issued, not who bought it — a balance is what somebody holding a card
  // needs and the rest is a description of a stranger's purchase.
  return Response.json({ balanceCents: card.balanceCents }, { status: 200 });
}
