"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useT } from "../../i18n";
import { forgetNote, subscribeMine, tokenFor } from "./mine";

// The control that takes your own note back off the wall.
//
// ——— ⚠️ It renders nothing on the server, and that is not a nicety ———
//
// Whether this card is yours lives in localStorage, which does not exist on the
// server. Reading it during render would make the server's markup and the
// browser's first markup disagree — React calls that a hydration error, and on
// a page of a hundred cards it is a hundred of them.
//
// useSyncExternalStore is the tool built for exactly this shape: it takes a
// separate server snapshot, so React knows the two are *meant* to differ and
// fills the difference in after hydration rather than complaining about it. The
// visible cost is that the control appears a frame late on your own cards.
//
// An earlier version set state from an effect instead. It worked and the lint
// rule is right to refuse it: a synchronous setState in an effect is a second
// render pass for every card on the wall, and here it was buying what the
// server snapshot gives for free.
//
// ——— Two taps, because there is no undo on this side ———
//
// Unpinning sets `hidden` on the row, so the words are not lost and the shop
// can put a card back. From here it is one-way: the token is forgotten with the
// note, so a second tap cannot restore it. A single tap next to somebody's own
// handwriting is too easy to make by accident on a phone, so it asks.
//
// ——— What it cannot do ———
//
// It is on the card the *device* wrote. Not the person — there are no accounts
// here, and app/noteOwner.ts sets out exactly how far a device claim reaches
// and where it stops. Somebody who cleared their site data, or wrote from a
// phone and is now on a laptop, will not see this and has to ask the shop.
//
// ——— ⚠️ And the third way it appears: the shop ———
//
// `keeper` is the server saying this browser holds the shop's key, and it puts
// the control on *every* card rather than on one. That is the takedown the
// privacy policy promises, and until it existed the answer was a person editing
// a `hidden` column by hand — which is not a promise anybody can keep at speed.
//
// ⚠️ It says something different, because it is a different act. Unpinning your
// own note is housekeeping and the word for it is "Unpin". Taking down
// somebody else's is moderation, and a control that used the same word would
// let whoever is holding the shop's phone clear a wall while believing they
// were tidying their own. See notes.takeDown in app/i18n/en.ts.

export default function UnpinNote({
  id,
  mine = false,
  keeper = false,
}: {
  id: string;
  mine?: boolean;
  /** ⚠️ The server's answer, never the browser's. Decided from the keeper
   *  cookie, which is httpOnly and unreadable from the page on purpose — so it
   *  arrives as a prop or not at all. A page that could set this for itself
   *  would be a page where the control is one devtools edit away, and while the
   *  endpoint would still refuse the request, offering a stranger a button that
   *  says "take it down" on somebody's note is its own small harm. */
  keeper?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  // ⚠️ The snapshot has to be stable across renders or React loops. tokenFor
  // reads a cached map and returns a string, which compares by value, so it is
  // — see the note in mine.ts about why the cache exists.
  const token = useSyncExternalStore(
    subscribeMine,
    useCallback(() => tokenFor(id), [id]),
    () => null,
  );

  const unpin = useCallback(async () => {
    if (sending) return;
    setSending(true);
    setFailed(false);
    try {
      const response = await fetch("/api/corner-notes/unpin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ⚠️ The token may be null, and the endpoint accepts that: the device
        // cookie rides along on its own and is enough by itself. It is sent
        // when there is one because a note written before device cookies
        // existed has no device_hash to match, and the token is the only thing
        // that can take it down.
        body: JSON.stringify({ id, token }),
      });
      const answer = (await response.json().catch(() => null)) as { ok?: boolean } | null;
      if (!response.ok || answer?.ok !== true) {
        setFailed(true);
        return;
      }
      // Forgotten before the refresh, so the card cannot come back offering to
      // unpin a note that is already down.
      forgetNote(id);
      // The page re-reads itself and the card is gone, rather than this
      // component hiding it locally — the same reasoning as the composer's
      // refresh. A wall that removes a card in the browser while the server
      // still serves it is a wall that reappears on the next visit.
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  }, [id, router, sending, token]);

  // ⚠️ Any of the three shows the control. `mine` is the server's answer,
  // rendered into the markup and therefore right on the first paint and
  // unaffected by anything Safari does to storage. The token is what a note
  // written before the cookie existed has, and what the wall — a client
  // component with no server to ask — has for everything. `keeper` is the shop,
  // and it is the only one of the three that appears on a card this browser did
  // not write.
  if (!mine && !token && !keeper) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      {asking ? (
        <>
          {/* ⚠️ Paper's ink, like the rest of this card: the palette's would
              print cream on a sheet that stays light. See --cb-paper. */}
          <span className="text-[11px]" style={{ color: "var(--cb-paper-quiet)" }}>
            {t(keeper && !mine ? "notes.takeDownAsk" : "notes.unpinAsk")}
          </span>
          <button
            type="button"
            onClick={() => void unpin()}
            disabled={sending}
            className="cb-tap cursor-pointer text-[11px] underline disabled:opacity-50"
            style={{ color: "var(--cb-paper-red)" }}
          >
            {t("notes.unpinYes")}
          </button>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="cb-tap cursor-pointer text-[11px] underline"
            style={{ color: "var(--cb-paper-faint)" }}
          >
            {t("notes.unpinNo")}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="cb-tap cursor-pointer text-[11px] underline"
          style={{ color: "var(--cb-paper-faint)" }}
        >
          {/* ⚠️ "Take down", not "Unpin", when this is the shop on a card it
              did not write. Same control, different act — see the note at the
              top. `mine` wins when both are true: the shop taking down its own
              note is still just unpinning it. */}
          {t(keeper && !mine ? "notes.takeDown" : "notes.unpin")}
        </button>
      )}
      {failed ? (
        <span role="alert" className="text-[11px]" style={{ color: "var(--cb-paper-red)" }}>
          {t("notes.unpinFailed")}
        </span>
      ) : null}
    </div>
  );
}
