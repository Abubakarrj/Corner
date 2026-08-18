"use client";

import { useCallback, useState } from "react";
import Modal from "../../ui/Modal";
import SlidingTabs from "../../ui/SlidingTabs";
import { useT } from "../../i18n";
import { PALETTE } from "../shopControls";
import { setFulfillment, useFulfillment } from "../../fulfillment";
import { DELIVERY_ORIGIN } from "../../(marketing)/locations/locations";
import PinPicker, { type PinResult } from "../../(marketing)/locations/PinPicker";
import CounterList from "./CounterList";

const { ink, muted } = PALETTE;

// Where this order is going, changed in place.
//
// ——— One sheet, not three ———
//
// Three separate ones grew here first: a counter list for "switch to pickup",
// a map for "switch to delivery", and the banner's "Change" still leaving for
// the finder. They are one question — where is this going — asked from three
// buttons, and three components answering it is three places for the answer
// to drift.
//
// So the mode is a tab inside the sheet and the caller says which one to open
// on. Collecting is a choice between two counters, which is a list; delivering
// needs a street, a building and a door, which is the pin step. The tab is
// what makes those two the same act rather than two features.
//
// ——— Catering is not a tab ———
//
// It looks like it should be, and it is not: catering is a conversation with
// a form, a date and a headcount, not a destination you pick in a sheet. It
// keeps its own screen, and this links to it rather than pretending.

type Tab = "pickup" | "delivery";

export default function ChangeFulfillment({
  initial,
  slugs,
  onClose,
}: {
  /** Which tab to open on. The caller knows why it was tapped — the banner
   *  opens on what the order already is, "switch to pickup" on the other. */
  initial: Tab;
  /** The basket, so the counter rows can mark what they cannot make. */
  slugs: readonly string[];
  onClose: () => void;
}) {
  const t = useT();
  const fulfillment = useFulfillment();
  const [tab, setTab] = useState<Tab>(initial);
  const [anyMissing, setAnyMissing] = useState(false);

  // Where the map opens. The delivery already on the order if there is one —
  // changing an address should start at the address, not at the shop — and
  // otherwise the counter, which is the one place on the map they have
  // already told us matters to them. A map has to start somewhere, and a
  // blank one cannot be dragged toward an answer.
  const start: [number, number] =
    fulfillment?.mode === "delivery" &&
    typeof fulfillment.lat === "number" &&
    typeof fulfillment.lng === "number"
      ? [fulfillment.lat, fulfillment.lng]
      : DELIVERY_ORIGIN.position;

  function confirmDelivery(result: PinResult) {
    setFulfillment({
      mode: "delivery",
      // Falls back to the address this opened with rather than to a
      // coordinate pair: "34.0614, -118.3079" on an order ticket is not an
      // address, it is a number nobody can read out to a courier.
      address:
        result.address ||
        (fulfillment?.mode === "delivery" ? fulfillment.address : "") ||
        "",
      lat: result.point[0],
      lng: result.point[1],
      ...(result.placeId ? { placeId: result.placeId } : {}),
      ...(result.unit ? { unit: result.unit } : {}),
      ...(result.instructions ? { instructions: result.instructions } : {}),
    });
    onClose();
  }

  // Stable, so CounterList's effect does not re-run on every render of this.
  const onEligibility = useCallback((missing: boolean) => setAnyMissing(missing), []);

  return (
    <Modal open onClose={onClose} label={t("shop.change")}>
      <div className="pe-10">
        <h2
          className="m-0 text-[22px] font-medium leading-[1.2] tracking-[-0.01em]"
          style={{ color: ink }}
        >
          {t("checkout.whereIsThisGoing")}
        </h2>
      </div>

      <SlidingTabs
        className="mt-4"
        active={tab}
        onSelect={(id) => setTab(id as Tab)}
        tabs={[
          { id: "pickup", label: t("finder.pickup") },
          { id: "delivery", label: t("finder.delivery") },
        ]}
      />

      {tab === "pickup" ? (
        <div className="mt-4">
          {/* Only when it is true, and only above the list it is about. */}
          {anyMissing ? (
            <p className="m-0 mb-3 text-[14px] leading-[1.5]" style={{ color: muted }}>
              {t("checkout.someNotEligible")}
            </p>
          ) : null}
          <CounterList slugs={slugs} onChosen={onClose} onEligibility={onEligibility} />
          {/* Catering, named rather than hidden. Somebody who came here to
              arrange a tray should find out where that lives instead of
              concluding the app cannot do it. */}
          <a
            href="/locations?mode=catering"
            className="cb-press mt-3 block text-center text-[13px] underline underline-offset-2"
            style={{ color: muted }}
          >
            {t("finder.catering")}
          </a>
        </div>
      ) : (
        <div className="mt-4 flex h-[62dvh] flex-col">
          <PinPicker
            key={`${start[0]},${start[1]}`}
            start={start}
            startAddress={fulfillment?.mode === "delivery" ? fulfillment.address : undefined}
            startUnit={fulfillment?.mode === "delivery" ? fulfillment.unit : undefined}
            startInstructions={
              fulfillment?.mode === "delivery" ? fulfillment.instructions : undefined
            }
            onConfirm={confirmDelivery}
            onCancel={onClose}
          />
        </div>
      )}
    </Modal>
  );
}
