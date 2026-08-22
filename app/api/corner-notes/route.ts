import { after } from "next/server";
import { cookies } from "next/headers";
import {
  NOTE_DEVICE_COOKIE,
  NOTE_DEVICE_MAX_AGE,
  hashDeviceToken,
  isDeviceToken,
  mintDeviceToken,
} from "../../noteDevice";
import {
  MAX_NAME,
  MAX_NEIGHBORHOOD,
  MAX_NOTE,
  addNote,
  countNotes,
  listNotes,
  readField,
  setPhotoState,
} from "../../cornerNotes";
import { cleanDrawing } from "../../drawing";
import { PHOTO_MAX_BYTES, readPhoto } from "../../notePhoto";
import { isOffensive } from "../../offensive";
import { reviewPhoto } from "../../photoReview";
import { clientIp, throttle } from "../../rateLimit";

// The visitor's log: reading the wall, and adding to it.
//
// ——— ⚠️ The one endpoint here that publishes to strangers ———
//
// Everything else the public can POST to this app is addressed: an order goes
// to a kitchen, an application to an inbox. This one puts what somebody typed
// on a page every future visitor sees, which changes what has to be true of it.
//
// What protects the wall is not a filter on words — that is a game nobody wins
// — but the shape of what can be stored. Text is text and is escaped where it
// renders; the drawing is bounded integers this app turns into a path itself,
// so there is no field in a note that can carry markup or a link. See
// app/drawing.ts.
//
// ——— ⚠️ And then there is the word filter, which is not that ———
//
// app/offensive.ts refuses a note carrying a slur. It is a courtesy and not a
// defence, and the distinction matters when reading the two together: the
// paragraph above is why this endpoint is safe to expose, and the filter is
// why the wall is pleasant to look at. Anybody determined to be vile will
// spell around it, and the answer to that is still the `hidden` column in
// app/cornerNotes.ts, which is the only real moderation this has.
//
// ⚠️ All three text fields go through it, not only the note. A name and a
// neighbourhood are printed on the card in the same typeface as the message —
// a wall that checks the sentence and prints whatever somebody typed in the
// name box has checked the wrong field.
//
// ——— ⚠️ And then there is the photograph, which is neither of those things ———
//
// A camera is the one thing here that can carry something this endpoint cannot
// read. Words go through a regex; a drawing is rebuilt from integers; a JPEG is
// a picture of anything at all, up to and including a stranger's face or a QR
// code pointing anywhere. So a photo takes a different path from every other
// field on this route: stored immediately, published by nobody, and looked at
// afterwards by app/photoReview.ts before the wall will hand it out.
//
// The note itself does not wait. It goes up with an empty frame that is
// visibly developing, which is both honest and what a polaroid does anyway.

/** ⚠️ Notes per address per hour.
 *
 *  Six is a person who wrote one, drew a second, and came back later; it is
 *  nowhere near a script. The window is long on purpose — a wall is only worth
 *  reading if no single visitor is most of it, and the failure this guards
 *  against is not a burst but somebody spending a quiet afternoon.
 *
 *  In memory, per instance, and holding addresses for an hour and nothing
 *  longer. No address is ever written next to a note. */
const posts = throttle({ windowMs: 60 * 60 * 1000, max: 6 });

/** ⚠️ Requests to this endpoint, refused ones included — a different question
 *  from the one above.
 *
 *  `posts` counts notes that went up. This counts asking. They were the same
 *  number until the wording check landed, and then they stopped being: a note
 *  refused for a word is a person about to type a different word and try again,
 *  and spending one of their six on each attempt means the filter's own
 *  mistakes are what locks somebody out. Six unlucky tries and a shop they were
 *  being nice to has stopped speaking to them for an hour.
 *
 *  So the budget is spent on what happened, and this bounds what was asked. It
 *  is much looser because the work behind a refusal is a regex, not a write. */
const attempts = throttle({ windowMs: 60 * 60 * 1000, max: 40 });

/** Reads, which are cheap but not free — every one is a database round trip
 *  and the page behind it is public. Generous enough that scrolling the wall
 *  never trips it. */
const reads = throttle({ windowMs: 60 * 1000, max: 60 });

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (reads.exceeded(clientIp(request))) {
    return Response.json({ error: "notes.tooFast" }, { status: 429 });
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "60");
  const offset = Number(url.searchParams.get("offset") ?? "0");

  const notes = await listNotes(
    Number.isFinite(limit) ? limit : 60,
    Number.isFinite(offset) ? offset : 0,
  );
  if (notes === null) {
    // ⚠️ Not an empty wall. "Nobody has written yet" and "we cannot reach the
    // wall" are different sentences and the page says different things about
    // them; answering [] here would tell a visitor the shop has no notes
    // because a database is asleep.
    return Response.json({ error: "notes.unavailable" }, { status: 503 });
  }

  return Response.json({ notes, total: await countNotes() });
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  // Raw volume first, so a script cannot sit on the refusal path for free.
  if (attempts.exceeded(ip)) {
    return Response.json({ error: "notes.tooMany" }, { status: 429 });
  }
  // Then the real allowance, checked without spending it. It is spent below,
  // once there is a note on the wall.
  if (posts.remaining(ip) === 0) {
    return Response.json({ error: "notes.tooMany" }, { status: 429 });
  }

  // ⚠️ Before the body is read, not after. A note is a few hundred bytes and a
  // photo is under a megabyte, so anything past this cap is not a note that got
  // long — and the point of refusing here is that request.json() has not yet
  // been asked to buffer and parse it. Twice the photo cap leaves room for
  // base64's third, the JSON around it, and a browser that rounded up.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > PHOTO_MAX_BYTES * 2) {
    return Response.json({ error: "notes.tooBig" }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "api.badJson" }, { status: 400 });
  }

  const body = payload as Record<string, unknown> | null;
  const name = readField(body?.name, MAX_NAME);
  const neighborhood = readField(body?.neighborhood, MAX_NEIGHBORHOOD);
  const note = readField(body?.note, MAX_NOTE);
  // Cleaned here as well as inside addNote, so the emptiness check below is
  // asking about the drawing that would actually be stored rather than about
  // whatever arrived.
  const drawing = cleanDrawing(body?.drawing);

  const photo = readPhoto(body?.photo);
  // ⚠️ "There was no photo" and "there was a photo and it was not one" are
  // different answers, and readPhoto collapses them into null on purpose — it
  // is a reader, not a validator. Separating them again here is what stops a
  // camera failing silently: without it, a browser that sent a PNG, or four
  // megabytes, or something that was never an image, gets a cheerful 201 and a
  // note with no picture on it, and nobody ever finds out why.
  if (typeof body?.photo === "string" && body.photo.length > 0 && photo === null) {
    return Response.json({ error: "notes.photoBad" }, { status: 400 });
  }

  // ⚠️ A note has to say something. Not a validation nicety: without it the
  // wall fills with blank cards from anybody who taps submit twice, and every
  // one of them pushes a real note further down.
  if (note.length === 0 && drawing.length === 0 && photo === null) {
    return Response.json({ error: "notes.empty" }, { status: 400 });
  }

  // ⚠️ One answer for all three fields, and it never says which one or which
  // word. Naming the field narrows the search to a third; naming the word turns
  // a rejected note into a lookup against the list. The person who tripped this
  // by accident is told plainly enough to fix it, and the person probing it
  // learns one bit.
  //
  // 422 rather than 400: the request is well formed and the server understood
  // it. It will not act on it, which is what the code is for.
  if (isOffensive(name) || isOffensive(neighborhood) || isOffensive(note)) {
    return Response.json({ error: "notes.language" }, { status: 422 });
  }

  // ——— ⚠️ The device cookie, minted here if this browser has none ———
  //
  // Read before the write so the note can be stored against it, and set on the
  // way out so the next visit is recognised. See app/noteDevice.ts for what a
  // device claim is worth, which is one verb: hiding a note somebody wrote.
  const jar = await cookies();
  const existing = jar.get(NOTE_DEVICE_COOKIE)?.value;
  const device = isDeviceToken(existing) ? existing : mintDeviceToken();
  const saved = await addNote({
    name,
    neighborhood,
    note,
    drawing,
    photo,
    deviceHash: hashDeviceToken(device),
  });
  if (!saved) {
    // ⚠️ Not counted. A database that was asleep is not a note somebody wrote,
    // and charging them for it means an outage quietly eats the allowance of
    // everybody who tried during it.
    return Response.json({ error: "notes.unavailable" }, { status: 503 });
  }

  // Spent here and nowhere else: there is a note on the wall, so one of the six
  // is gone.
  posts.record(ip);

  // ——— ⚠️ The review, after the answer has gone ———
  //
  // `after` rather than an await, because the person who took the picture is
  // holding a phone waiting for a card to appear and the review is a vision
  // call that can take several seconds. Their note is already saved and already
  // on the wall; what is outstanding is whether the frame fills in, and that is
  // a question the page can answer on its next visit.
  //
  // Nothing here can lose the note or unwrite it. The worst outcome is a state
  // that stays pending — a card that keeps developing — which is the same
  // outcome as the API being down, and is the direction this whole feature
  // fails in on purpose. See app/photoReview.ts.
  if (photo) {
    after(async () => {
      const verdict = await reviewPhoto(photo);
      await setPhotoState(saved.id, verdict);
    });
  }

  // ⚠️ The token, once, here, and in no other response this app makes. It is
  // what lets the browser that wrote this note take it down again, and it is
  // the only proof of authorship a wall with no accounts can have. See
  // app/noteOwner.ts.
  // ⚠️ Set on every successful write, not only when it is new. A cookie that is
  // only ever set once expires a year after the first note rather than a year
  // after the last one, and somebody who leaves a note every month would find
  // the whole run of them orphaned on the same afternoon.
  //
  // httpOnly, so no script on the page can read it and no XSS can carry it off;
  // lax, so it rides an ordinary navigation but not a cross-site POST; secure
  // everywhere but a local http dev server, matching the session cookie.
  jar.set(NOTE_DEVICE_COOKIE, device, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: NOTE_DEVICE_MAX_AGE,
  });

  return Response.json({ ok: true, id: saved.id, unpin: saved.token }, { status: 201 });
}
