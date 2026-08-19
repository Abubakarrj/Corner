import "server-only";

import * as square from "./square";
import * as toast from "./toast";

// The till, whichever one it is.
//
// ——— Why this file exists ———
//
// Everything above it — the checkout, the money, the routing, the scheduler,
// the tracker — asks the same five questions of a point-of-sale system: are you
// there, take this order, what happened to it, how busy are you, and can I
// reach you. None of those questions has a Toast-shaped answer or a
// Square-shaped one; only the wire format differs.
//
// So the five questions live here and the wire lives in square.ts and toast.ts.
// Swapping tills is then a change of environment variables rather than a change
// of code, which is also what makes it possible to run one in a sandbox while
// the other serves customers.
//
// ——— Which one is chosen ———
//
// Square if it is configured, Toast otherwise. Not a preference: the shop is
// moving to Square, and an explicit order means a half-configured Square never
// silently falls back to Toast and sends real orders to the wrong till. If both
// are set the log says which one won, once, because "why did that order go
// there" is a question somebody will eventually ask at speed.
//
// ——— On the name `toastGuid` ———
//
// It survives, in app/account.ts, app/kitchenQueue.ts and the order tracker,
// and it now means "the till's id for this order" whatever the till is. That is
// a worse name than it was. It is kept because it is a *persisted* name — a
// column, a localStorage field, a query parameter in links people already have
// — and renaming those to read better is how a customer's saved order stops
// resolving. Worth doing as its own change with a migration; not worth doing as
// a side effect of this one.

export type PosOrderDraft = {
  customer: { firstName: string; lastName: string; email: string; phone: string };
  diningOption: "pickup" | "delivery" | "curbside";
  deliveryAddress?: string;
  items: {
    slug: string;
    name: string;
    quantity: number;
    unitCents: number;
    modifiers: string[];
    /** The till's own id for this item, when the catalog knows it. Without one
     *  the line goes up as an ad-hoc item carrying our name and our price,
     *  which is what happens today — see the note in square.ts. */
    posItemId?: string;
  }[];
  subtotalCents: number;
  tipCents: number;
  utensils: boolean;
  note?: string;
  /** When a scheduled order is due. Absent on an ordinary one, which the till
   *  times itself. */
  promisedAt?: Date;
  /** Which counter, as our own location id. The adapter maps it to whatever
   *  the till calls that shop. */
  counter?: string;
  /** Our handle for this order, written onto the till's copy so a ticket can be
   *  traced back here without a fourth identifier to keep in step. */
  reference?: string;
  /** Who is carrying the bag, when it is not the shop itself.
   *
   *  A till records a delivery somebody else arranged; it does not arrange one.
   *  Naming the courier here is what puts a provider and a number to call on
   *  the counter's screen, instead of a delivery the till believes staff are
   *  driving themselves. Absent on pickup, and absent when no courier is
   *  configured. */
  courier?: { provider: string; supportPhone: string };
};

export type PosOrderResult =
  /** `readyAt` is the till's own estimate as epoch ms, when it gave one. */
  | { ok: true; orderId: string; readyAt?: number }
  // `reason` is for the log, not the customer. A failure here means the
  // kitchen never heard about the order, so the caller has to say so plainly
  // rather than showing a confirmation.
  | { ok: false; reason: string };

export type PosOrderState = {
  id: string;
  /** Whether it is paid, in the till's words. Passed through rather than
   *  interpreted. */
  status: string | null;
  /** Where the kitchen has got to, in the till's words. Mapped onto our own
   *  stages in app/orderStages.ts, in one place, for both tills. */
  fulfillment: string | null;
};

export type PosName = "square" | "toast";

/** Which till is switched on, or null for neither. */
export function posName(): PosName | null {
  if (square.isSquareConfigured()) return "square";
  if (toast.isToastConfigured()) return "toast";
  return null;
}

export function isPosConfigured(): boolean {
  return posName() !== null;
}

let announced = false;
function chosen(): PosName | null {
  const name = posName();
  if (!announced) {
    announced = true;
    if (name === "square" && toast.isToastConfigured()) {
      console.warn(
        "[pos] both Square and Toast are configured. Orders are going to" +
          " Square. Unset the Toast variables to remove the ambiguity.",
      );
    } else if (name) {
      console.info(`[pos] orders are going to ${name}.`);
    }
  }
  return name;
}

export async function createPosOrder(draft: PosOrderDraft): Promise<PosOrderResult> {
  switch (chosen()) {
    case "square":
      return square.createSquareOrder(draft);
    case "toast":
      return toast.createToastOrder(draft);
    default:
      return { ok: false, reason: "not-configured" };
  }
}

export async function fetchPosOrder(id: string): Promise<PosOrderState | null> {
  switch (chosen()) {
    case "square":
      return square.fetchSquareOrder(id);
    case "toast":
      return toast.fetchToastOrder(id);
    default:
      return null;
  }
}

/** How many orders the kitchen has open, or null when we cannot say.
 *
 *  Null is a real answer and must not collapse to zero — see the note in
 *  app/kitchenQueue.ts about why a confident zero is the dangerous one. */
export async function countOpenPosOrders(): Promise<number | null> {
  switch (chosen()) {
    case "square":
      return square.countOpenSquareOrders();
    case "toast":
      return toast.countOpenOrders();
    default:
      return null;
  }
}

export async function posReachable(): Promise<{ ok: true } | { ok: false; why: string }> {
  switch (chosen()) {
    case "square":
      return square.squareReachable();
    case "toast":
      return toast.toastReachable();
    default:
      return { ok: false, why: "No point-of-sale system is configured." };
  }
}
