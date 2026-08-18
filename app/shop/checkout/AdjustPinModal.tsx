"use client";

import Modal from "../../ui/Modal";
import { useT } from "../../i18n";
import { PALETTE } from "../shopControls";
import { setFulfillment, type Fulfillment } from "../../fulfillment";
import PinPicker, { type PinResult } from "../../(marketing)/locations/PinPicker";

const { ink, muted } = PALETTE;

// Moving the pin without leaving the checkout.
//
// ——— Why this is not a link to /locations ———
//
// "Adjust pin" is a correction, not a decision. Somebody reading their own
// address back before paying has spotted that the point is on the wrong side
// of the building — and the fix for that was a navigation out of a half-filled
// form to the finder, which then had to be re-entered through the search and
// the mode tabs to reach the same map. The screen they wanted was two screens
// away from a link named after it.
//
// So the same picker opens over the checkout. It is the identical component
// the finder uses, not a second one: the pin step is the most consequential
// screen in the app — a wrong point is a bag on somebody else's step — and two
// implementations of it would be two chances to disagree about what a
// confirmed pin means.
//
// ——— The height ———
//
// PinPicker is `flex-1` inside a flex column: it fills whatever it is given,
// which on the finder is the rest of a full screen. A modal has no such
// height, so one is chosen here. 66dvh against the sheet's own 92dvh cap
// leaves the heading, the lead and the Confirm button visible without
// scrolling, which matters more than a large map: the pin is dragged under a
// thumb at the centre of the frame, and a frame that fills the screen puts
// that centre under the thumb's own knuckle.
export default function AdjustPinModal({
  fulfillment,
  start,
  onClose,
}: {
  /** The delivery this is correcting, and the point it opens at.
   *
   *  The point is separate from the fulfillment because a delivery's lat and
   *  lng are optional: one set up before the pin step existed has an address
   *  and no coordinates, and there is nothing for this map to open over. The
   *  caller checks that and does not render this — see DeliverySection. */
  fulfillment: Extract<Fulfillment, { mode: "delivery" }>;
  start: [number, number];
  onClose: () => void;
}) {
  const t = useT();

  function confirm(result: PinResult) {
    // The same write the finder makes, field for field. See confirmPin in
    // LocationFinder: the label falls back to the address this opened with
    // rather than to a coordinate pair, because "34.0614, -118.3079" on an
    // order ticket is not an address, it is a number nobody can read out to a
    // courier on the phone.
    //
    // And the optional three are spread only when they have a value. An
    // undefined key is absent from the stored JSON; an empty string is a
    // value that later reads as "they answered, and the answer was nothing",
    // which is how a blank field ends up wiping an apartment number somebody
    // had already given.
    setFulfillment({
      mode: "delivery",
      address: result.address || fulfillment.address || "",
      lat: result.point[0],
      lng: result.point[1],
      ...(result.placeId ? { placeId: result.placeId } : {}),
      // Written from the sheet, which now opens with these already in it. So
      // an empty one here means the customer cleared it rather than never
      // having been asked, and clearing it should stick.
      ...(result.unit ? { unit: result.unit } : {}),
      ...(result.instructions ? { instructions: result.instructions } : {}),
    });
    onClose();
  }

  return (
    <Modal open onClose={onClose} label={t("pin.title")}>
      <div className="pe-10">
        <h2
          className="m-0 text-[22px] font-medium leading-[1.2] tracking-[-0.01em]"
          style={{ color: ink }}
        >
          {t("pin.title")}
        </h2>
        <p className="m-0 mt-1.5 text-[14px] leading-[1.5]" style={{ color: muted }}>
          {t("pin.lead")}
        </p>
      </div>

      <div className="mt-4 flex h-[66dvh] flex-col">
        <PinPicker
          // Keyed on the point it opens at, for the same reason the finder
          // keys it: reopening after a move should build a fresh map rather
          // than leave the old camera parked over the previous position.
          key={`${start[0]},${start[1]}`}
          start={start}
          startAddress={fulfillment.address}
          // What the order already carries, so the sheet opens showing it.
          // Without this the fields come up blank and confirming writes the
          // blank back: setFulfillment replaces the whole object, so a key
          // left out is a key deleted. Caught by a test that filled both in
          // and adjusted the pin without touching them.
          startUnit={fulfillment.unit}
          startInstructions={fulfillment.instructions}
          onConfirm={confirm}
          onCancel={onClose}
        />
      </div>
    </Modal>
  );
}
