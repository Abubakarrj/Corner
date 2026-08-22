import type { DeliveryArea } from "./deliveryArea";
import SHAPE from "./deliveryShape.json";

// The delivery boundary, measured once and committed.
//
// ——— ⚠️ Why a checked-in file and not a measurement ———
//
// The boundary is a pure function of two things that live in source: the
// counter list in locations.ts and DELIVERY_RADIUS_MILES. Neither can change
// without a commit. Measuring it at runtime was therefore paying Google to
// re-derive a constant — 2,640 Route Matrix elements a rebuild, about $13 a
// time — and the cache meant to prevent that was a module-level variable that
// died with the process. Forty-five cold starts across a month made a $600
// bill for a shape that had not moved an inch.
//
// So it is measured deliberately, by a person, once per change:
//
//     npm run measure:delivery      (needs GOOGLE_MAPS_API_KEY)
//
// and the answer is committed beside the code that produced it. Runtime Routes
// calls for the map: none.
//
// ——— ⚠️ Keeping it honest ———
//
// A committed measurement is a cache with no expiry, and the failure mode of
// those is serving a confident answer to a question that has changed. Three
// things guard it, none of which cost anything:
//
//   · `measuredFrom` is a fingerprint of the counters and the radius. The app
//     compares it on every read — see deliveryArea().
//   · tests/deliveryShape.test.ts fails when it does not match, so a shop
//     cannot be opened and merged without the shape being remeasured.
//   · /api/maps-check reports the mismatch, for a deploy that skipped the test.
//
// ⚠️ The JSON is generated. Do not hand-edit it — a boundary somebody typed is
// a boundary nobody measured, and it decides who this shop tells it can order.

export type CommittedShape = {
  /** ⚠️ shapeFingerprint() at the moment it was measured: the counter ids and
   *  positions, and the radius. Not the quota — see the note there. */
  measuredFrom: string;
  /** When, in ISO. For a person reading the file, not for any logic: nothing
   *  expires on a clock, because the thing it describes does not change on one. */
  measuredAt: string;
  area: DeliveryArea;
};

/** The committed shape, or null when there is not one yet.
 *
 *  ⚠️ Null is a real state and it is what a fresh checkout has before anybody
 *  has run the script. The app falls through to a live measurement then, which
 *  is the expensive path — deliberately, because a first deploy with no map at
 *  all is worse than one that costs $13 once and then never again. */
export function deliveryShape(): CommittedShape | null {
  // ⚠️ Through `unknown`. TypeScript infers the *literal* shape of the checked-in
  // JSON, so an empty placeholder file types as `{ area: null }` and a real one
  // types as a giant literal — neither of which it will let you assert straight
  // onto CommittedShape. The checks below are what actually establishes the
  // type, which is the right order anyway for a file written by a script.
  const shape = SHAPE as unknown as Partial<CommittedShape>;
  // Total, because this is imported JSON: a truncated or half-written file is a
  // possibility, and a delivery map is not worth crashing a page over.
  if (!shape || typeof shape.measuredFrom !== "string" || !shape.measuredFrom) return null;
  if (!shape.area || !Array.isArray(shape.area.outline) || shape.area.outline.length === 0) {
    return null;
  }
  return shape as CommittedShape;
}
