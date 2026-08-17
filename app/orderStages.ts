// The words this app uses for where an order is, and the two translations
// from the providers' vocabularies into them.
//
// Its own file, with no imports, because both sides need it: the server store
// in orderStatus.ts writes these, and the tracker in account.ts reads them.
// Putting them in orderStatus.ts would have pulled the Toast and Uber clients
// — process.env, secrets, fetch — into the browser bundle through account.ts,
// which every shop page imports.

/** Where the food is. Our words, not Toast's — mapped once, here, so the rest
    of the app never has to know Toast's vocabulary. */
export type FoodStage = "received" | "cooking" | "ready" | "done" | "voided";

/** Where the courier is, on a delivery. */
export type CourierStage =
  | "assigned"
  | "collecting"
  | "collected"
  | "delivering"
  | "delivered"
  | "canceled";

export type LiveStatus = {
  food?: FoodStage;
  courier?: CourierStage;
  /** When the courier is expected, epoch ms — Uber's number, not ours.
   *
   *  The tracker's own arrival time is placed-at plus a constant, which is
   *  the same answer at 6am and in a downpour. This one is watching the
   *  traffic and the courier. Where it exists it wins; where it doesn't the
   *  estimate carries on exactly as before. */
  etaAt?: number;
  /** Who has the bag. Absent until Uber assigns somebody. */
  courierName?: string;
  courierVehicle?: string;
  /** Uber says the courier is about to arrive.
   *
   *  Only ever set true. Absent is "not said", and the screens read it that
   *  way — a false would invite copy that says he is *not* nearly here, which
   *  is a claim nobody made. */
  courierNear?: true;
  /** When the provider last told us, epoch ms. */
  at: number;
};

/** Toast's fulfillment vocabulary, mapped once.
 *
 *  Unknown values deliberately return undefined rather than a guess. A status
 *  we do not recognise means the tracker keeps running on its estimate, which
 *  is the behaviour it had before any of this existed. */
export function foodStageOf(toastStatus: string | null): FoodStage | undefined {
  switch (toastStatus?.toUpperCase()) {
    case "RECEIVED":
      return "received";
    case "IN_PREPARATION":
      return "cooking";
    case "READY_FOR_PICKUP":
      return "ready";
    case "CLOSED":
      return "done";
    case "VOIDED":
      return "voided";
    default:
      return undefined;
  }
}

/** Uber's delivery vocabulary, mapped once. */
export function courierStageOf(uberStatus: string | null): CourierStage | undefined {
  switch (uberStatus?.toLowerCase()) {
    case "pending":
      return "assigned";
    case "pickup":
      return "collecting";
    case "pickup_complete":
      return "collected";
    case "dropoff":
      return "delivering";
    case "delivered":
      return "delivered";
    case "canceled":
    case "cancelled":
    case "returned":
      return "canceled";
    default:
      return undefined;
  }
}

/** Whether the shop has actually handed the bag to the courier.
 *
 *  What "follow the courier" needs to be true before it means anything. Uber
 *  issues a tracking URL the moment a delivery is created, which is while the
 *  bagels are still being made — open it then and you get a page about a
 *  courier who has not been assigned, or who is somewhere else entirely
 *  finishing another job. That is a worse answer than no link.
 *
 *  Undefined, rather than false, when the courier's stage is unknown. The
 *  caller decides what to do with that, and the tracker shows the link:
 *  hiding the only route to the courier because the webhooks are not
 *  registered yet would take away something that works. */
export function handedToCourier(courier: CourierStage | undefined): boolean | undefined {
  if (courier === undefined) return undefined;
  return courier === "collected" || courier === "delivering" || courier === "delivered";
}
