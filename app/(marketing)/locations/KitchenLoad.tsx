"use client";

import { useEffect, useState } from "react";
import { useT } from "../../i18n";

// How busy the counter is, under the Order button.
//
// ——— Four words, twice cut down to them ———
//
// It started as "3 online orders on the counter ahead of you", under a second
// line explaining that walk-ins were not counted. Then, once it turned out the
// shop takes no counter orders at all, as "4 orders ahead of you" under a line
// explaining that ordering is online only.
//
// Both second lines were the same mistake: the reasoning behind the number,
// printed where the number goes. A person with their thumb over Order wants to
// know whether to leave now. "4 orders ahead" answers that. Everything else
// was answering a question about our data model that nobody asked.
//
// The count is the whole queue — see app/kitchenQueue.ts — which is what makes
// four words enough. It is also why there is no prep estimate here: checkout
// already says what time the food is ready, and repeating a number the next
// screen states properly is how a caption turns back into a paragraph.
//
// ——— And why silence is a valid state ———
//
// Three things make this render nothing: no database, a database that refused,
// and a shut shop. All three come back as `known: false` rather than zero,
// because a confident "nothing waiting" assembled out of a failed query is
// the one output here that could actually send somebody to a busy shop.
//
// It is also why there is no skeleton and no spinner. A placeholder would
// reserve space for a sentence that may never come and make the sheet jump;
// the honest shape of "we do not know yet" is nothing at all.
//
// ——— Asked before the sheet opens, not after ———
//
// Which left the other jump: the sheet came up, and a second later a line of
// text pushed in under the button. The fix is not a placeholder, it is asking
// earlier. The finder starts this the moment the map is up, so by the time
// somebody taps a shop the answer is usually already in hand and the first
// paint of the sheet has it.
//
// One request per page, cached here. The count moves slowly and every shop on
// the map shares one kitchen, so a second fetch per sheet would be the same
// answer bought twice. It goes stale after a while, which is what FRESH_FOR
// is for: a sheet opened ten minutes later asks again, and shows the cached
// number in the meantime rather than nothing.

type Load = { known: true; ahead: number } | { known: false };

/** How long a count is worth showing without asking again. */
const FRESH_FOR = 60_000;

let cached: { load: Load; at: number } | null = null;
let inFlight: Promise<Load> | null = null;

function fresh(): Load | null {
  return cached && Date.now() - cached.at < FRESH_FOR ? cached.load : null;
}

/** Ask the kitchen how busy it is, at most once per minute.
 *
 *  Exported so the finder can start it when the map appears rather than when a
 *  sheet opens. Safe to call as often as you like: a request already in the
 *  air is shared, and a fresh answer is returned without another one. */
export function warmKitchenLoad(): Promise<Load> {
  const ready = fresh();
  if (ready) return Promise.resolve(ready);
  inFlight ??= fetch("/api/kitchen-load")
    .then((response) => (response.ok ? response.json() : { known: false }))
    // A busyness line that fails is a busyness line that isn't there. It must
    // never become an error in front of somebody trying to buy a bagel.
    .catch((): Load => ({ known: false }))
    .then((load: Load) => {
      cached = { load, at: Date.now() };
      inFlight = null;
      return load;
    });
  return inFlight;
}

export default function KitchenLoad() {
  const t = useT();
  // Seeded from the cache, so a warmed answer is on the first paint instead of
  // arriving a frame later and pushing the button down.
  //
  // A function initialiser, because this runs on the server too: there it is
  // null, which matches what the client renders before hydration.
  const [load, setLoad] = useState<Load | null>(() => fresh());

  useEffect(() => {
    let live = true;
    void warmKitchenLoad().then((next) => {
      if (live) setLoad(next);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!load || !load.known) return null;

  return (
    <p className="m-0 mt-3 text-center text-[12px] leading-[1.5] text-muted">
      {load.ahead === 0
        ? t("kitchen.clear")
        : t(load.ahead === 1 ? "kitchen.aheadOne" : "kitchen.ahead", {
            count: load.ahead,
          })}
    </p>
  );
}
