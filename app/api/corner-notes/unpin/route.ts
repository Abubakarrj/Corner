import { cookies } from "next/headers";
import { takeDownNote, unpinNote } from "../../../cornerNotes";
import { KEEPER_COOKIE, keeperIsValid } from "../../../shopKeeper";
import { NOTE_DEVICE_COOKIE, hashDeviceToken, isDeviceToken } from "../../../noteDevice";
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
// ——— Two proofs, either of which is enough ———
//
// The token this browser was handed when it wrote the note, and the device
// cookie the server set at the same moment. A note from before the cookie
// existed has only the first. A browser whose localStorage Safari has since
// cleared — seven days without a visit is all it takes — has only the second,
// and before the cookie it had nothing, which is the bug this pair exists to
// close. See app/noteDevice.ts.
//
// ——— What this cannot do ———
//
// It cannot restore a note. That limit is in app/noteOwner.ts, along with the
// rest of what a device-held claim can and cannot say.
//
// ——— ⚠️ And the one caller that is not a device ———
//
// It *can* now take down a note posted from another browser, for exactly one
// requester: the shop, holding the keeper cookie. That is the takedown the
// privacy policy promises, which until now was the `hidden` column reached by
// hand — see app/shopKeeper.ts for what the cookie is and why it is not the
// key itself.
//
// ⚠️ The keeper path is checked first and returns on its own, which means the
// timing reasoning above does not apply to it and does not need to: a request
// carrying a valid keeper cookie has already proved who it is, and there is
// nothing left to learn from how long the answer takes. What must stay true is
// the other direction — an *invalid* keeper cookie has to fall through to the
// ordinary path and be answered exactly like no cookie at all, rather than
// being refused in a way that says "that was a keeper cookie, and it was
// wrong". It does, because keeperIsValid is total and returns false.

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
  const jar = await cookies();
  const cookie = jar.get(NOTE_DEVICE_COOKIE)?.value;
  const device = isDeviceToken(cookie) ? hashDeviceToken(cookie) : null;

  // ——— ⚠️ The shop, which needs no note of its own ———
  //
  // Before the shape check, deliberately. A keeper is taking down somebody
  // else's note, so it carries neither the token nor that note's device
  // cookie, and the check below would refuse it as malformed.
  if (keeperIsValid(jar.get(KEEPER_COOKIE)?.value)) {
    if (!id) return Response.json({ error: "api.badRequest" }, { status: 400 });
    return Response.json({ ok: await takeDownNote(id) });
  }

  // ⚠️ The shape check passes on a missing token, which it did not always. A
  // browser that has the device cookie and no token is the ordinary case after
  // Safari has cleared localStorage, and refusing it with a 400 would be this
  // endpoint telling somebody their own note is not theirs.
  //
  // What is still refused loudly is a request carrying *neither*: our own
  // client sends at least one, so that is a malformed request rather than a
  // failed claim, and it never reaches the database.
  const shapedToken = isUnpinToken(token) ? token : "";
  if (!id || (!shapedToken && !device)) {
    return Response.json({ error: "api.badRequest" }, { status: 400 });
  }

  return Response.json({ ok: await unpinNote(id, shapedToken, device) });
}
