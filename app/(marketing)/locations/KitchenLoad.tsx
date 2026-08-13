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

type Load = { known: true; ahead: number } | { known: false };

export default function KitchenLoad() {
  const t = useT();
  const [load, setLoad] = useState<Load | null>(null);

  useEffect(() => {
    let live = true;
    void fetch("/api/kitchen-load")
      .then((response) => (response.ok ? response.json() : { known: false }))
      .then((body: Load) => {
        if (live) setLoad(body);
      })
      // A busyness line that fails is a busyness line that isn't there. It
      // must never become an error in front of somebody trying to buy a bagel.
      .catch(() => {
        if (live) setLoad({ known: false });
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
