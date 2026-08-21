import { unpinNote } from "../../../cornerNotes";
import { isUnpinToken } from "../../../noteOwner";
import { clientIp, throttle } from "../../../rateLimit";

// Taking your own note back off the wall.
//
// ——— ⚠️ The one thing on this endpoint that is not obvious ———
//
// It answers the same way whatever went wrong. A note that does not exist, a
// token that is wrong, somebody else's note, a note already down: 200 and
// `{ ok: true }` for the one case that worked, 200 and `{ ok: false }` for
// every case that did not, with no reason.
//
// That is not politeness, it is the whole security property. The only thing
// standing between a stranger and somebody's note is a secret held in one
// browser, and anything this route says about *why* a request failed is a
// measurement an attacker can take. "No such note" tells them which ids are
// real. "Wrong token" tells them the id was right and only the secret is
// missing. Neither is worth a better error message for the only person who
// will ever legitimately see one — and that person's browser has the token, so
// they will not see one.
//
// ⚠️ 200 rather than 403 or 404 for the same reason: the status code is a
// message too. See app/api/auth/start, which answers identically for a known
// and an unknown address on the same reasoning.
//
// ——— What this cannot do ———
//
// It cannot restore a note, and it cannot take down a note posted from another
// device. Both are in app/noteOwner.ts, which is where the limits of a
// device-held claim are written out. The shop's own takedown — the one the
// privacy policy promises — is still the `hidden` column reached by hand.

/** ⚠️ Unpin attempts per address per hour.
 *
 *  Twenty is far more than a person who wants a card down, and it is the number
 *  that makes guessing pointless: the token is 256 bits, so an attacker needs
 *  something on the order of 2^255 tries and this allows twenty. The limit is
 *  not really what stops them — the token length is — but a route that hashes a
 *  string on every request should not be free to hammer either. */
const attempts = throttle({ windowMs: 60 * 60 * 1000, max: 20 });

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (attempts.exceeded(clientIp(request))) {
    return Response.json({ error: "notes.tooMany" }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "api.badJson" }, { status: 400 });
  }

  const body = payload as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const token = body?.token;
  // The shape check is the one thing worth refusing loudly, because it is the
  // one thing that cannot be a real attempt: our own client always sends a
  // token of the right length, so anything else is a malformed request rather
  // than a failed claim.
  if (!id || !isUnpinToken(token)) {
    return Response.json({ error: "api.badRequest" }, { status: 400 });
  }

  return Response.json({ ok: await unpinNote(id, token) });
}
