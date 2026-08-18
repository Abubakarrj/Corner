"use client";

import { useEffect, useState } from "react";
import Modal from "../../ui/Modal";
import { useT } from "../../i18n";
import { PALETTE } from "../shopControls";
import { OUTLET_CHIP } from "../shopControls";
import { clockLabel } from "../../shopFacts";
import { isOpenNow } from "../../shopFacts";
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

// Choosing a counter without leaving the checkout.
//
// ——— Why this exists ———
//
// "Switch to pickup" was a link to /locations. That is the right screen for
// somebody who has not decided anything yet: a map, a search field, the whole
// country. It is the wrong screen for somebody standing in a filled-in
// checkout who has just decided they would rather walk. They lose the form
// they were halfway through and land on a map of the United States, to answer
// a question with two possible answers.
//
// Two counters, half a mile apart. That is a list, not a map.
//
// ——— Distance, and where it comes from ———
//
// Distance is the whole reason to show a list rather than two names: "Western
// Ave" and "Wilshire Blvd" mean nothing to somebody who does not know the
// neighbourhood, and "0.4 mi" means something to everybody.
//
// It needs a position, and asking for one is a permission prompt — so it is
// asked for once, when this opens, and refusing costs nothing: the rows are
// the same rows, minus a number. Nobody is blocked from choosing a shop
// because they would not say where they are.
//
// The fix is used at its face value with no precision test, deliberately.
// This is picking between two addresses 0.68 miles apart to sort two rows; a
// kilometre of doubt cannot reorder that list in a way that misleads anybody,
// and the delivery pin's refusal of a coarse fix is about naming a doorway,
// which this is not.

type Row = {
  store: StoreLocation;
  miles: number | null;
  open: boolean;
  /** Items in the basket this counter cannot make. Named, because "you will
   *  lose the sandwich" is the one thing that would make somebody choose the
   *  other shop, and finding out after the switch is finding out too late. */
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

/** Mounted only while it is open — see the note on `locating` below. */
export default function PickupPicker({
  slugs,
  onClose,
}: {
  /** What is in the basket, so a row can say what this counter cannot make. */
  slugs: readonly string[];
  onClose: () => void;
}) {
  const t = useT();
  const [at, setAt] = useState<[number, number] | null>(null);
  // No "finding you" state. The sheet used to announce that it was looking
  // and then announce that it had finished, which is two sentences for
  // something that resolves in about a second and shows its own result: the
  // distances appear on the rows, or they do not. Asking is the only part
  // that needs code.
  //
  // Mounted only while open, so this runs once per opening. Somebody who
  // declined, walked a block and opened it again is asked again — the browser
  // remembers a refusal and will not re-prompt, so that costs nothing when
  // the answer is still no.
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
  // Whether any counter falls short of the basket, which decides both the
  // line under the heading and the marker on the row.
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

  function choose(store: StoreLocation) {
    setFulfillment({
      mode: "pickup",
      locationId: store.id,
      label: store.name,
      detail: t("finder.pickup"),
    });
    onClose();
  }

  return (
    <Modal open onClose={onClose} label={t("checkout.choosePickup")}>
      <div className="pe-10">
        <h2
          className="m-0 text-[22px] font-medium leading-[1.2] tracking-[-0.01em]"
          style={{ color: ink }}
        >
          {t("checkout.choosePickup")}
        </h2>
        {/* One line, and only when it is telling somebody something.
            It said "Nearest first", which the distances on the rows already
            say, and "Finding you…", which resolves in a second and leaves a
            sentence behind. A subtitle that describes the list is furniture.
            This one is the only fact here somebody might not know: that part
            of their basket cannot be collected everywhere. */}
        {anyMissing ? (
          <p className="m-0 mt-1.5 text-[14px] leading-[1.5]" style={{ color: muted }}>
            {t("checkout.someNotEligible")}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {rows.map(({ store, miles, open: isOpen, missing }) => (
          <button
            key={store.id}
            type="button"
            onClick={() => choose(store)}
            className="cb-press w-full cursor-pointer rounded-xl border p-4 text-start transition-colors hover:bg-raise"
            style={{ borderColor: controlBorder }}
          >
            <span className="flex items-center gap-2">
              <span
                className="min-w-0 truncate text-[16px] font-medium"
                style={{ color: ink }}
              >
                {store.name}
              </span>
              {store.outlet ? (
                <span className={`shrink-0 ${OUTLET_CHIP}`}>{t("finder.outlet")}</span>
              ) : null}
              {/* The number this sheet exists for, pushed to the far end so
                  the eye can run down a column of them rather than hunting
                  for each one after a name of a different length. */}
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

            {/* Shut, and when it opens. A row that can be tapped and then
                cannot take the order is worse than a row that says so: the
                counter is a perfectly good choice for later, and this is the
                screen where "later" is still a decision somebody can make. */}
            {isOpen ? null : (
              <span className="mt-1.5 block text-[12px]" style={{ color: muted }}>
                {t("checkout.opensAt", { time: clockLabel(opensAt(store)) })}
              </span>
            )}

            {/* Which counter, not which items. The line under the heading
                has already said that something in the basket is affected;
                spelling the names out again per row turned two short rows
                into a paragraph, and the basket is one tap away for anybody
                who wants to know which. */}
            {missing.length > 0 ? (
              <span className="mt-1.5 block text-[12px] text-brand-red">
                {t("checkout.notMadeHere")}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </Modal>
  );
}
