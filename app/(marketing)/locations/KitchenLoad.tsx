"use client";

import { useEffect, useState } from "react";
import { useT } from "../../i18n";

// How busy the counter is, under the Order button.
//
// ——— Why it says "online orders" every single time ———
//
// Because that is what it counts. This app can see the orders it sent to the
// kitchen; it cannot see the four people standing at the counter at 8:15. A
// line reading "3 ahead of you" when the real answer is eleven is worse than
// no line at all — somebody reads twelve minutes, walks over, finds a queue
// out the door, and every future estimate on this site has lost its credit.
//
// The wording is therefore never trimmed to fit. When Toast is connected this
// can count the walk-ins too, because Toast is the till; until then the number
// is a floor and says so.
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

type Load = { known: true; ahead: number; prepMinutes: number } | { known: false };

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
      {/* The prep estimate appears only when nothing is waiting, because that
          is the only case it is true for. PREP_MINUTES is how long one order
          takes; six orders deep it is not six times that and it is not twelve
          either, and this app has no idea which. Printing "about 12 minutes"
          under "6 orders ahead" would be two facts that argue with each
          other, so past zero the count stands on its own. */}
      {load.ahead === 0
        ? t("kitchen.clear", { minutes: load.prepMinutes })
        : t(load.ahead === 1 ? "kitchen.aheadOne" : "kitchen.ahead", {
            count: load.ahead,
          })}
      <br />
      <span className="text-quiet">{t("kitchen.walkInsNote")}</span>
    </p>
  );
}
