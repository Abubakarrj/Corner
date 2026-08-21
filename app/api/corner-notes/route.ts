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
import { isOffensive } from "../../offensive";
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

  const id = await addNote({ name, neighborhood, note, drawing });
  if (!id) {
    // ⚠️ Not counted. A database that was asleep is not a note somebody wrote,
    // and charging them for it means an outage quietly eats the allowance of
    // everybody who tried during it.
    return Response.json({ error: "notes.unavailable" }, { status: 503 });
  }

  // Spent here and nowhere else: there is a note on the wall, so one of the six
  // is gone.
  posts.record(ip);
  return Response.json({ ok: true, id }, { status: 201 });
}
