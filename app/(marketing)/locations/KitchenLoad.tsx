"use client";

import { useEffect, useState } from "react";
import { useT } from "../../i18n";

// How busy the counter is, under the Order button.
//
// ——— Why it can say "orders ahead of you" flatly ———
//
// Because the shop takes no counter orders. There is no room to queue in it,
// so every ticket came through this app and this is the whole line rather than
// a slice of it.
//
// The first version hedged. It said "online orders" and carried a second line
// saying walk-ins were not counted, on the reasoning that a number which
// undercounts a queue sends people to a shop with a line out the door. Sound
// reasoning about a shop that does not exist: there are no walk-ins here, and
// a caveat describing a gap that isn't there costs a reader the same attention
// as a true one while making the real number sound less trustworthy than it
// is.
//
// What replaced it is the fact somebody standing outside actually needs, which
// the old line was accidentally implying the opposite of: you cannot order at
// the counter, so ordering here is the way in.
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
      <span className="text-quiet">{t("kitchen.onlineOnly")}</span>
    </p>
  );
}
