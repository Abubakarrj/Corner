"use client";

import { useState } from "react";
import { useT } from "../../i18n";
import Modal from "../../ui/Modal";
import { PALETTE } from "../shopControls";
import { setFulfillment } from "../../fulfillment";
import { DELIVERY_ORIGIN } from "../../(marketing)/locations/locations";
import PinPicker, { type PinResult } from "../../(marketing)/locations/PinPicker";

const { ink, muted } = PALETTE;

// Switching a pickup to a delivery without leaving the checkout.
//
// ——— Why this one is a map and the other is a list ———
//
// Going the other way is a choice between two counters, so PickupPicker is a
// list of two. Coming this way is the opposite kind of question: a delivery
// needs a street, a building and a door, and there is no list of those.
//
// So it is the pin step, which already contains a search field over its map —
// type a street, watch the pin land, nudge it, confirm. That is the whole
// flow, and it is the same component the finder uses for exactly this, so the
// checkout cannot end up with a second, subtly different idea of what a
// confirmed delivery address is.
//
// It opens over the shop rather than over nothing. A map has to start
// somewhere and a blank one cannot be dragged toward an answer; the counter
// they were collecting from is the one place on the map they have already
// told us is relevant to them, and the search field is right above it for
// anybody whose address is elsewhere.
export default function DeliverSwitch({ onClose }: { onClose: () => void }) {
  const t = useT();

  function confirm(result: PinResult) {
    // No fallback address here, unlike the adjust flow. That one is
    // correcting a delivery that already has a label and can keep it if the
    // pin lands somewhere unnamed; this one is creating the delivery, so an
    // empty label would be a delivery with no address on the ticket. The
    // picker only enables its confirm once it has named the point.
    setFulfillment({
      mode: "delivery",
      address: result.address,
      lat: result.point[0],
      lng: result.point[1],
      ...(result.placeId ? { placeId: result.placeId } : {}),
      ...(result.unit ? { unit: result.unit } : {}),
      ...(result.instructions ? { instructions: result.instructions } : {}),
    });
    onClose();
  }

  return (
    <Modal open onClose={onClose} label={t("checkout.switchToDeliveryTitle")}>
      <div className="pe-10">
        <h2
          className="m-0 text-[22px] font-medium leading-[1.2] tracking-[-0.01em]"
          style={{ color: ink }}
        >
          {t("checkout.switchToDeliveryTitle")}
        </h2>
        <p className="m-0 mt-1.5 text-[14px] leading-[1.5]" style={{ color: muted }}>
          {t("pin.lead")}
        </p>
      </div>

      {/* Same height as the adjust sheet, for the same reason — see the note
          in AdjustPinModal. */}
      <div className="mt-4 flex h-[66dvh] flex-col">
        <PinPicker start={DELIVERY_ORIGIN.position} onConfirm={confirm} onCancel={onClose} />
      </div>
    </Modal>
  );
}

/** The link's state and the sheet, so a section only has to render one thing. */
export function useDeliverSwitch() {
  const [open, setOpen] = useState(false);
  return {
    open: () => setOpen(true),
    sheet: open ? <DeliverSwitch onClose={() => setOpen(false)} /> : null,
  };
}
