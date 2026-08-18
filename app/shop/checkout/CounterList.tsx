"use client";

import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { OUTLET_CHIP, PALETTE } from "../shopControls";
import { clockLabel, isOpenNow } from "../../shopFacts";
import { locateMe } from "../../geolocate";
import { setFulfillment } from "../../fulfillment";
import {
  milesBetween,
  opensAt,
  pickupStores,
  type StoreLocation,
} from "../../(marketing)/locations/locations";
import { servesProduct } from "../storeMenu";
import { getProduct } from "../products";

const { ink, muted, controlBorder } = PALETTE;

// The counters, as a list you pick from.
//
// ——— Distance, and where it comes from ———
//
// Distance is the whole reason this is a list rather than two names: "Western
// Ave" and "Wilshire Blvd" mean nothing to somebody who does not know the
// neighbourhood, and "0.4 mi" means something to everybody.
//
// It needs a position, so one is asked for when this mounts, and refusing
// costs nothing: the same rows, minus a number. Nobody is kept from choosing
// a shop because they would not say where they are.
//
// The fix is used at face value with no precision test, deliberately. This is
// sorting two addresses two thirds of a mile apart; a kilometre of doubt
// cannot reorder that in a way that misleads anybody, and the delivery pin's
// refusal of a coarse fix is about naming a doorway, which this is not.
//
// No "finding you" state. It resolves in about a second and shows its own
// result — the distances appear, or they do not.

type Row = {
  store: StoreLocation;
  miles: number | null;
  open: boolean;
  /** Items in the basket this counter cannot make. */
  missing: string[];
};

function sortRows(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    // A counter that cannot make the basket goes last however near it is.
    // Sorting purely by distance would put the outlet on top for somebody
    // holding a sandwich, which is a recommendation to lose it.
    if (a.missing.length !== b.missing.length) {
      return a.missing.length - b.missing.length;
    }
    // Then open before shut, for the same reason: near and dark is not near.
    if (a.open !== b.open) return a.open ? -1 : 1;
    if (a.miles === null || b.miles === null) return 0;
    return a.miles - b.miles;
  });
}

export default function CounterList({
  slugs,
  onChosen,
  onEligibility,
}: {
  /** What is in the basket, so a row can mark what it cannot make. */
  slugs: readonly string[];
  onChosen: () => void;
  /** Told whether anything in the basket is affected, so the sheet above can
   *  say so once rather than every row saying it again. */
  onEligibility?: (anyMissing: boolean) => void;
}) {
  const t = useT();
  const [at, setAt] = useState<[number, number] | null>(null);

  useEffect(() => {
    let live = true;
    void locateMe().then((result) => {
      if (live && result.ok) setAt(result.fix.point);
    });
    return () => {
      live = false;
    };
  }, []);

  const now = new Date();
  const rows = sortRows(
    pickupStores().map((store) => ({
      store,
      miles: at ? milesBetween(at, store.position) : null,
      open: isOpenNow(now, opensAt(store)),
      missing: slugs
        .map((slug) => getProduct(slug))
        .filter((product) => product && !servesProduct(store.id, product))
        .map((product) => product!.name),
    })),
  );

  const anyMissing = rows.some((row) => row.missing.length > 0);
  useEffect(() => {
    onEligibility?.(anyMissing);
  }, [anyMissing, onEligibility]);

  function choose(store: StoreLocation) {
    setFulfillment({
      mode: "pickup",
      locationId: store.id,
      label: store.name,
      detail: t("finder.pickup"),
    });
    onChosen();
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map(({ store, miles, open: isOpen, missing }) => (
        <button
          key={store.id}
          type="button"
          onClick={() => choose(store)}
          className="cb-press w-full cursor-pointer rounded-xl border p-4 text-start transition-colors hover:bg-raise"
          style={{ borderColor: controlBorder }}
        >
          <span className="flex items-center gap-2">
            <span className="min-w-0 truncate text-[16px] font-medium" style={{ color: ink }}>
              {store.name}
            </span>
            {store.outlet ? (
              <span className={`shrink-0 ${OUTLET_CHIP}`}>{t("finder.outlet")}</span>
            ) : null}
            {/* Pushed to the far end so the eye can run down a column of them
                rather than hunting for each one after a name of a different
                length. */}
            {miles === null ? null : (
              <span
                className="ms-auto shrink-0 text-[13px] tabular-nums"
                style={{ color: muted }}
              >
                {t("checkout.milesAway", { miles: miles.toFixed(1) })}
              </span>
            )}
          </span>

          <span className="mt-1 block text-[13px]" style={{ color: muted }}>
            {store.address}
          </span>

          {/* Shut, and when it opens. A row that can be tapped and then cannot
              take the order is worse than a row that says so: the counter is a
              perfectly good choice for later, and this is the screen where
              "later" is still a decision somebody can make. */}
          {isOpen ? null : (
            <span className="mt-1.5 block text-[12px]" style={{ color: muted }}>
              {t("checkout.opensAt", { time: clockLabel(opensAt(store)) })}
            </span>
          )}

          {/* Which counter, not which items. The line above the list has
              already said something in the basket is affected. */}
          {missing.length > 0 ? (
            <span className="mt-1.5 block text-[12px] text-brand-red">
              {t("checkout.notMadeHere")}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
