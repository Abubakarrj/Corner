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
// phone and is now on a laptop, will not see this and has to ask the shop, the
// way the privacy policy says.

export default function UnpinNote({ id }: { id: string }) {
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

  if (!token) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      {asking ? (
        <>
          {/* ⚠️ Fixed colours, like the rest of this card: a polaroid is white
              in both themes, so theme tokens would print cream on white in the
              dark. See the note in Polaroid.tsx. */}
          <span className="text-[11px]" style={{ color: "#6b675e" }}>
            {t("notes.unpinAsk")}
          </span>
          <button
            type="button"
            onClick={() => void unpin()}
            disabled={sending}
            className="cb-tap cursor-pointer text-[11px] underline disabled:opacity-50"
            style={{ color: "#be1923" }}
          >
            {t("notes.unpinYes")}
          </button>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="cb-tap cursor-pointer text-[11px] underline"
            style={{ color: "#8a8578" }}
          >
            {t("notes.unpinNo")}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="cb-tap cursor-pointer text-[11px] underline"
          style={{ color: "#8a8578" }}
        >
          {t("notes.unpin")}
        </button>
      )}
      {failed ? (
        <span role="alert" className="text-[11px]" style={{ color: "#be1923" }}>
          {t("notes.unpinFailed")}
        </span>
      ) : null}
    </div>
  );
}
