"use client";

import { useEffect, useState } from "react";
import { useT } from "../../i18n";

// Where this order sits in the line, on the screen you land on after paying.
//
// ——— Why a place and not a count ———
//
// The map already shows how busy the counter is, under the Order button. That
// number answers "do I have time to walk over", which is a question you ask
// before ordering. Once you have ordered you are in the line, and the useful
// number is your own place in it — the one that goes down while you watch.
//
// They are not the same number offset by one: orders placed after yours are
// ahead of nobody. app/kitchenQueue.ts counts them separately for that reason.
//
// ——— Why it moves ———
//
// A static "3 orders ahead" is a fact. A "3" that becomes a "2" while you are
// looking at it is the reason this exists at all, and it is what the reference
// this is modelled on gets right. So it polls, on the same 20 seconds as the
// order tracker, and stops once the answer is that yours is next.
//
// ——— Silence is a valid state ———
//
// No database, a refused query, or an order the queue has no record of all
// come back as `known: false` and render nothing. Zero means "yours is next"
// and is the one number here that must never be assembled out of a failure —
// it is the sentence that gets somebody out of a chair.
//
// No spinner and no skeleton, for the same reason as the map's line: a
// placeholder reserves space for a sentence that may never arrive, on a screen
// whose first frame is confetti.

const POLL_MS = 20_000;

type Place = { known: true; ahead: number } | { known: false };

export default function QueuePlace({ queueId }: { queueId: string | undefined }) {
  const t = useT();
  const [place, setPlace] = useState<Place | null>(null);

  useEffect(() => {
    if (!queueId) return;
    let live = true;

    let timer: number | null = null;
    const stop = () => {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    };

    const ask = async () => {
      let body: Place;
      try {
        const response = await fetch(
          `/api/kitchen-load?id=${encodeURIComponent(queueId)}`,
          { cache: "no-store" },
        );
        body = response.ok ? await response.json() : { known: false };
      } catch {
        // A queue line that fails is a queue line that isn't there. It must
        // never turn into an error on the screen that says the order worked.
        body = { known: false };
      }
      if (!live) return;
      setPlace(body);
      // Nothing left to count down. Stopping beats letting the interval run:
      // a confirmation left open on a counter should not still be asking the
      // database about a finished order an hour later.
      if (body.known && body.ahead === 0) stop();
    };

    // Interval first, then the request. The other order has a hole in it — a
    // first answer of zero would call stop() before there was a timer to stop,
    // and the interval set immediately afterwards would then run forever.
    timer = window.setInterval(() => void ask(), POLL_MS);
    void ask();

    return () => {
      live = false;
      stop();
    };
  }, [queueId]);

  if (!place || !place.known) return null;

  return (
    <p className="m-0 mt-4 flex items-center justify-center gap-2 text-[13px] text-ink">
      {/* The same pulsing dot as the live-order bar. One idiom for "this is
          happening now", so a customer who has seen the bar knows what the
          dot means here without being told. */}
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky opacity-70 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-sky" />
      </span>
      {place.ahead === 0
        ? t("queue.next")
        : t(place.ahead === 1 ? "queue.aheadOne" : "queue.ahead", { count: place.ahead })}
    </p>
  );
}
