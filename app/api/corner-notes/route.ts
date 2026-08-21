import {
  MAX_NAME,
  MAX_NEIGHBORHOOD,
  MAX_NOTE,
  addNote,
  countNotes,
  listNotes,
  readField,
} from "../../cornerNotes";
import { cleanDrawing } from "../../drawing";
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
// app/drawing.ts. What is left is somebody being rude in a bagel shop's
// guestbook, which is a moderation problem, and app/cornerNotes.ts keeps the
// `hidden` column for it.

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
  if (posts.exceeded(clientIp(request))) {
    return Response.json({ error: "notes.tooMany" }, { status: 429 });
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

  // ⚠️ A note has to say something. Not a validation nicety: without it the
  // wall fills with blank cards from anybody who taps submit twice, and every
  // one of them pushes a real note further down.
  if (note.length === 0 && drawing.length === 0) {
    return Response.json({ error: "notes.empty" }, { status: 400 });
  }

  const id = await addNote({ name, neighborhood, note, drawing });
  if (!id) {
    return Response.json({ error: "notes.unavailable" }, { status: 503 });
  }

  return Response.json({ ok: true, id }, { status: 201 });
}
