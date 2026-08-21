// The notes this browser wrote, and the secrets that take them down again.
//
// ——— ⚠️ What is in here, and what is deliberately not ———
//
// One entry per note this device posted: the id, and the token the endpoint
// handed back once. Nothing else — not the words, not the name, not when. The
// wall already has all of that and is the place to read it from; a second copy
// in local storage would be a record of what somebody wrote sitting on their
// device for no reason, on a shop's website, and there is nothing it would let
// the page do that it cannot do already.
//
// ⚠️ It is a bearer credential store, small as it is. See app/noteOwner.ts for
// what a token authorises and how narrow that is. The practical consequences of
// keeping it here rather than server-side:
//
//   clearing site data loses it, and the note stays up. That is the trade for
//   not asking anybody to make an account, and the privacy policy's "write to
//   us" is still the answer for somebody in that position;
//
//   it does not follow you to another device;
//
//   and it is readable by anything that can run script on this origin, which
//   is the same set of things that could take the note down directly.
//
// ——— Everything here survives storage being unavailable ———
//
// Private windows, a browser set to block site data, and an embedded webview
// with storage disabled all throw on access rather than returning null. Every
// read and write below is wrapped, and the failure mode is that no card offers
// an unpin control — which is a wall that works and cannot take notes down,
// rather than a wall that will not render.

import { MAX_NOTES_REMEMBERED, NOTES_STORAGE_KEY } from "../../cornerNotesShape";

type Mine = Record<string, string>;

// ——— ⚠️ A cached snapshot, because this is read during render ———
//
// The unpin control asks "is this note mine" through useSyncExternalStore,
// which calls its snapshot function on every render and compares the result
// with the last one. Two things follow. It must be cheap: a wall is a hundred
// cards, and a hundred JSON.parses of localStorage per render is a hundred too
// many. And it must be *stable* — returning a fresh object each time would
// never compare equal and React would re-render forever.
//
// So the parsed map is held here and rebuilt only when something writes. The
// listeners are what let a card disappear the moment its note is forgotten,
// rather than at the next navigation.
let snapshot: Mine | null = null;
const listeners = new Set<() => void>();

function current(): Mine {
  snapshot ??= read();
  return snapshot;
}

function changed(): void {
  snapshot = null;
  for (const listener of listeners) listener();
}

/** Subscribe to this browser's own notes changing. The store lives in one tab;
 *  another tab writing is not watched, because a note written in one tab is not
 *  on the wall in the other until it reloads anyway. */
export function subscribeMine(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(): Mine {
  try {
    const raw = window.localStorage.getItem(NOTES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    // ⚠️ Checked rather than cast. This is a string somebody else's code could
    // have written — another script on the origin, an older version of this
    // app, a person with the console open — and it is read on the render path
    // of a public page. A shape that is not what we expect is treated as no
    // notes rather than trusted into a component.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const clean: Mine = {};
    for (const [id, token] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof token === "string" && token.length > 0) clean[id] = token;
    }
    return clean;
  } catch {
    return {};
  }
}

function write(mine: Mine): void {
  try {
    // ⚠️ Trimmed to the most recent, because this only ever grows. Object key
    // order in JavaScript is insertion order for string keys, so the oldest
    // entries are at the front and the tail is what somebody might still want
    // to take down. Fifty notes from one browser is already far more than the
    // six-an-hour limit expects of anybody.
    const entries = Object.entries(mine);
    const kept = entries.slice(Math.max(0, entries.length - MAX_NOTES_REMEMBERED));
    window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(Object.fromEntries(kept)));
    changed();
  } catch {
    // ⚠️ The snapshot is dropped even when the write failed, so what is served
    // next is whatever storage actually holds rather than what we hoped it
    // would.
    changed();
    // A browser that will not store is a browser whose notes cannot be
    // unpinned from here. The note is still on the wall, which is what the
    // person actually asked for.
  }
}

/** Remember that this browser wrote this note. */
export function rememberNote(id: string, token: string): void {
  if (!id || !token) return;
  write({ ...read(), [id]: token });
}

/** The token for a note this browser wrote, or null.
 *
 *  ⚠️ Null on the server, because there is no localStorage there — and the
 *  caller has to hand that same null to React as its *server* snapshot, or the
 *  markup built on the server and the markup built in the browser disagree.
 *  That is a hydration error, and on a page that renders a hundred cards it is
 *  a hundred of them. See UnpinNote.tsx. */
export function tokenFor(id: string): string | null {
  if (typeof window === "undefined") return null;
  return current()[id] ?? null;
}

/** Forget one, once it is down. Keeps the store from filling with tokens for
 *  notes that are no longer on the wall. */
export function forgetNote(id: string): void {
  const mine = read();
  if (!(id in mine)) return;
  delete mine[id];
  write(mine);
}
