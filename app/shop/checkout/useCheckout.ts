"use client";

import { useEffect, useState } from "react";
import { useServerText, useT } from "../../i18n";
import { useCart, useCartRows } from "../CartContext";
import { getProduct, lineKey } from "../products";
import { totalsFor, type OrderTotals } from "../money";
import {
  describeFulfillment,
  peekFulfillment,
  useFulfillment,
  type Fulfillment,
} from "../../fulfillment";
import { useOpening } from "../../useOpening";
import { pushOrder, recordOrder, type PlacedOrder } from "../../account";
import { useCard, type CardEntry } from "./useCard";
import { BRAND_LABEL } from "./card";
import { completed, refused } from "../../haptics";
import { closeFunnel } from "../../navigationDepth";
import type { Tender } from "./PaymentSection";
import type { CartRow } from "../CartContext";

// Everything checkout *is*, with none of what it looks like.
//
// This exists because there are two of them now: the page at /shop/checkout
// and the sheet inside the chat panel. They are the same transaction — the
// same courier quote, the same validation, the same submit, the same order
// record — and the one thing that must never happen is the two drifting so
// that ordering through Riley charges a different total, skips the
// closing-time check, or records an order the page wouldn't have.
//
// So the rule is: nothing about money, validity or submission lives in a
// component. A surface renders this hook's state and calls its `submit`. If a
// rule needs changing it gets changed once, here, and both surfaces get it.
//
// ⚠️ The model is not in this file, and that is deliberate. Riley can fill the
// basket and open the sheet; she cannot place an order. What talks to
// /api/shop-order is this, plain code, so "your order is in" is only ever said
// because an endpoint returned 200 — never because a language model inferred
// it. If that ever needs revisiting, revisit it here rather than by giving her
// a tool that posts.

// ——— A phone, not an email ———
//
// A food order needs a way to reach the person, and for this shop that is a
// phone: the kitchen rings when something has sold out from under an order,
// and a courier standing outside a locked lobby rings before he gives up. An
// email does neither of those in the ten minutes either of them matters.
//
// It was an email, required, and nothing was ever sent to it. The only message
// this app puts through Resend is a job application; there is no order receipt
// and no confirmation mail. So the checkout demanded an address, used it as an
// identity key, and never wrote to it — while the phone number that delivery
// actually depends on was optional.
//
// Email is still how somebody signs in and how an account is named. It is just
// not something to ask a stranger for in order to sell them a bagel.
//
// Deliberately loose. A phone number is typed with brackets, spaces, dots and
// dashes, in this neighbourhood often with a +82 or +52 in front, and a strict
// pattern rejects a real number far more often than it catches a fake one. Ten
// digits after the punctuation is what a US number has; anything longer is
// somebody who typed a country code, and that is not an error either.
const PHONE_DIGITS = /\d/g;
function phoneOk(value: string): boolean {
  return (value.match(PHONE_DIGITS) ?? []).length >= 10;
}

export type CheckoutStatus = "idle" | "sending" | "placed";

// Checkout in two steps, as in the reference: who you are, then how you're
// paying.
//
// It isn't only cosmetic. A payment sheet is the one screen where somebody
// should be looking at a total and a single button, and the old single column
// put the tip, the kerbside checkbox and the order note between the fields and
// the money. Splitting it also means the contact details are validated before
// anything payment-shaped appears, so nobody reaches a card field and then
// gets sent back up for a missing phone number.
export type CheckoutStep = "details" | "payment";

export type DeliveryQuote = {
  quoteId: string;
  feeCents: number;
  etaMinutes: number | null;
  /** Road miles from the counter, for the fee explainer. Null when Routes
   *  could not answer — see the note in /api/delivery/quote. */
  miles?: number | null;
};

/** How the bag changes hands. Uber's courier is told which, in the dropoff
 *  notes, so it is a real instruction rather than a preference we record and
 *  forget. */
export type Handoff = "hand" | "door";

export type Checkout = {
  // ——— What's being bought ———
  rows: CartRow[];
  itemCount: number;
  subtotalCents: number;
  totals: OrderTotals;
  /** Rows that never got their choices made; the endpoint refuses these. */
  incomplete: CartRow[];
  /** Rows that sold out after the basket was filled, as far as this browser
   *  knows. */
  unavailable: CartRow[];
  /** Items the endpoint refused as sold out, already removed from the basket.
   *  Empty until that happens; cleared by dismissing the notice. */
  soldOutNow: string[];
  dismissSoldOut: () => void;

  // ——— Where it's going ———
  fulfillment: Fulfillment | null;
  where: { mode: ReturnType<typeof describeFulfillment>["mode"]; where: string } | null;
  isDelivery: boolean;
  quote: DeliveryQuote | null;
  quoteError: string | null;
  /** True while the courier is still pricing a delivery. */
  quoting: boolean;

  // ——— The delivery itself ———
  //
  // These three exist because a courier needs different things from a kitchen,
  // and the checkout used to hand him the kitchen's note. "No onions" is not
  // useful to a driver and "gate code 4432" is not useful to a baker, and both
  // were going to both.
  /** Apartment, suite or floor. The geocoder resolves a building; this is the
   *  part of an address it cannot know and a driver cannot guess. */
  deliveryDetail: string;
  setDeliveryDetail: (value: string) => void;
  handoff: Handoff;
  setHandoff: (value: Handoff) => void;
  /** For the driver: the gate, the door, where to leave it. */
  courierNote: string;
  setCourierNote: (value: string) => void;

  // ——— Who's buying ———
  firstName: string;
  setFirstName: (value: string) => void;
  lastName: string;
  setLastName: (value: string) => void;
  phone: string;
  setPhone: (value: string) => void;
  firstNameError: string | undefined;
  phoneError: string | undefined;

  // ——— The extras ———
  curbside: boolean;
  setCurbside: (value: boolean) => void;
  utensils: boolean;
  setUtensils: (value: boolean) => void;
  note: string;
  setNote: (value: string) => void;
  tipCents: number;
  setTipCents: (value: number) => void;
  tender: Tender;
  setTender: (value: Tender) => void;
  /** The card fields. Nothing on this object reaches the network but its
      brand and last four — see the note at the top of card.ts. */
  card: CardEntry;

  // ——— The two steps ———
  step: CheckoutStep;
  /** Enough to move on: a name and a phone number that could be one. */
  detailsValid: boolean;
  /** Marks the fields tried and advances if they pass. */
  continueToPayment: () => void;
  backToDetails: () => void;

  // ——— Placing it ———
  valid: boolean;
  status: CheckoutStatus;
  error: string | null;
  placed: PlacedOrder | null;
  /** Whether the visitor has pressed the button once, which is what un-hides
      the field errors. Nothing is marked wrong before somebody tries. */
  tried: boolean;
  submit: () => Promise<void>;
};

export function useCheckout(): Checkout {
  const t = useT();
  const st = useServerText();
  const { lines, removeItem, subtotalCents, clear } = useCart();
  const rows = useCartRows();
  const fulfillment = useFulfillment();
  const opening = useOpening();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [curbside, setCurbside] = useState(false);
  const [utensils, setUtensils] = useState(false);
  const [note, setNote] = useState("");
  // Seeded from the destination, not blank.
  //
  // The unit and the courier note were captured while the customer was looking
  // at a map of their own building (see PinPicker), which is the moment they
  // are actually in mind. Asking again here — three screens later, next to a
  // card form — is how "Apt 4B" ends up missing from the order that needed it.
  //
  // A lazy initialiser, so this is the value at mount and editable from then
  // on. Syncing it to the fulfillment on every change would overwrite what
  // somebody typed on this screen with what they typed on the last one.
  //
  // ⚠️ peekFulfillment, not the `fulfillment` above. The hook reports null for
  // one render after hydration — deliberately, so the server's markup and the
  // client's first pass agree — and a lazy initialiser runs exactly once, in
  // that render. Reading the hook here would seed both fields from null every
  // time and silently drop the unit on every delivery. Same trap FulfillmentGate
  // documents, in a different disguise.
  const [deliveryDetail, setDeliveryDetail] = useState(() => {
    const known = peekFulfillment();
    return known?.mode === "delivery" ? (known.unit ?? "") : "";
  });
  // Handed over in person by default. "Leave at door" is the choice somebody
  // makes deliberately; defaulting to it would leave bags on doorsteps for
  // people who never asked.
  const [handoff, setHandoff] = useState<Handoff>("hand");
  const [courierNote, setCourierNote] = useState(() => {
    const known = peekFulfillment();
    return known?.mode === "delivery" ? (known.instructions ?? "") : "";
  });
  const [tipCents, setTipCents] = useState(0);
  const [tender, setTender] = useState<Tender>("counter");
  const [step, setStep] = useState<CheckoutStep>("details");
  const [status, setStatus] = useState<CheckoutStatus>("idle");
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  // Names of items the endpoint refused as sold out and this hook has already
  // taken out of the basket. Rendered as a notice, then dismissed.
  //
  // Distinct from `unavailable` below, which is what the *browser* already
  // knows is off the board. The browser polls /api/sold-out and is at worst
  // half a minute behind, which is exactly long enough for the last lox to go
  // while somebody is filling in their name. The server is the only one that
  // can say at the moment it matters.
  const [soldOutNow, setSoldOutNow] = useState<string[]>([]);

  // The card fields, in their own hook so the number has no route into the
  // request body below. `tried` is passed in for the same reason the name and
  // phone errors read it: nothing is marked wrong before somebody tries.
  const card = useCard(tried);

  const where = fulfillment ? describeFulfillment(fulfillment) : null;
  const isDelivery = fulfillment?.mode === "delivery";
  const deliveryAddress = fulfillment?.mode === "delivery" ? fulfillment.address : null;
  // The point the customer dropped a pin on, when there is one. Sent with the
  // address so the quote is priced to the doorway they chose rather than to
  // whatever the geocoder makes of the words — see PinPicker.tsx.
  //
  // Absent on a delivery saved before the picker existed; the endpoint
  // geocodes in that case, which is what it always did.
  const deliveryLat = fulfillment?.mode === "delivery" ? fulfillment.lat : undefined;
  const deliveryLng = fulfillment?.mode === "delivery" ? fulfillment.lng : undefined;

  // What the courier charges to take this order to this address, from Uber
  // Direct via /api/delivery/quote. Fetched rather than assumed: a flat
  // delivery fee is a bet that every address costs the same, and the shop
  // covers the difference on the far ones.
  //
  // `null` while it's in flight, which is why the total is held back until it
  // lands — showing a subtotal-only total on a delivery order and then adding
  // six dollars at the last step is the oldest trick in online food, and it's
  // not one this shop is going to do.
  //
  // Tagged with the address it belongs to and read back only when that still
  // matches, the same pattern the address search uses. Switching fulfillment
  // mid-checkout would otherwise leave the previous address's fee on screen
  // while the new one is still in flight.
  //
  // `failed` and `message` rather than one error string, because the string
  // has to be translated and the effect must not depend on the translator: `t`
  // is a new closure every render, so putting it in the dependency array would
  // re-quote the delivery on every keystroke in the form. The effect records
  // *that* it failed and whatever the server said; the sentence is chosen at
  // render, where the language is already known.
  const [quoted, setQuoted] = useState<{
    forAddress: string;
    quote: DeliveryQuote | null;
    failed: boolean;
    message: string | null;
  } | null>(null);

  const current = quoted?.forAddress === deliveryAddress ? quoted : null;
  const quote = current?.quote ?? null;
  const quoteError = current?.failed
    ? (st(current.message) || t("checkout.couldNotPrice"))
    : null;

  useEffect(() => {
    if (!deliveryAddress) return;
    let live = true;
    void fetch("/api/delivery/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: deliveryAddress,
        lat: deliveryLat,
        lng: deliveryLng,
      }),
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!live) return;
        setQuoted({
          forAddress: deliveryAddress,
          quote: response.ok ? body : null,
          failed: !response.ok,
          message: response.ok ? null : (body?.error ?? null),
        });
      })
      .catch(() => {
        if (!live) return;
        setQuoted({ forAddress: deliveryAddress, quote: null, failed: true, message: null });
      });
    return () => {
      live = false;
    };
    // The pin is part of the destination, so moving it has to re-quote even
    // when the words are unchanged — the same street address on the other side
    // of a block is a different drive.
  }, [deliveryAddress, deliveryLat, deliveryLng]);

  // A row that never got its bagel chosen can't be made, and the endpoint
  // refuses it — so the button refuses first, and says where to fix it.
  const incomplete = rows.filter((row) => !row.complete);
  // Sold out since the basket was filled. A basket outlives the morning, so
  // this is ordinary rather than exceptional — it just can't be ordered.
  const unavailable = rows.filter((row) => row.gone);

  const totals = totalsFor({
    subtotalCents,
    tipCents,
    deliveryCents: quote?.feeCents ?? 0,
  });

  const phoneError = tried && !phoneOk(phone) ? t("checkout.validPhone") : undefined;
  const firstNameError = tried && firstName.trim().length === 0 ? t("checkout.required") : undefined;

  // Everything the first step is responsible for. Kept apart from `valid` so
  // the Continue button can refuse for its own reasons and the Place order
  // button can refuse for the rest — a delivery that hasn't been priced yet
  // shouldn't grey out a Continue button that has nothing to do with it.
  const detailsValid = firstName.trim().length > 0 && phoneOk(phone);

  function continueToPayment() {
    setTried(true);
    if (detailsValid) setStep("payment");
  }

  function backToDetails() {
    setStep("details");
  }

  const valid =
    detailsValid &&
    rows.length > 0 &&
    incomplete.length === 0 &&
    unavailable.length === 0 &&
    // Nothing gets made outside opening hours, so nothing gets ordered. The
    // app used to take the order at 3am on a Monday and promise it for
    // 3:12am, which sends somebody to a locked window.
    opening.acceptingOrders &&
    // A delivery order can't be placed until a courier has priced it. Placing
    // it anyway would mean promising a delivery nobody has agreed to make.
    (!isDelivery || quote !== null) &&
    // Paying by card means there has to be a card. Checked here rather than in
    // the component so both surfaces get it, and so the rule sits next to the
    // other five reasons an order can't go.
    (tender !== "card" || card.complete);

  async function submit() {
    setTried(true);
    // A press that refuses is the case worth marking: the button doesn't move,
    // the errors appear somewhere above the fold, and on a long form that is
    // easy to miss entirely. Android only; see app/haptics.ts.
    if (!valid || status !== "idle") {
      if (status === "idle") refused();
      return;
    }

    setStatus("sending");
    setError(null);

    try {
      const response = await fetch("/api/shop-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          // No email. It used to ride along here and the server keyed the
          // rewards ledger off it, which meant the address that earned the
          // points was a free-text field in a request body — anybody could
          // post an order and credit somebody else's account. The server
          // reads the session cookie for that now. See /api/shop-order.
          phone,
          fulfillment,
          // Uber's quote, so the courier booked on the far side is booked at
          // the price shown here. The server re-quotes and compares rather
          // than believing the fee — see /api/shop-order.
          deliveryQuoteId: quote?.quoteId ?? null,
          deliveryFeeCents: quote?.feeCents ?? 0,
          curbside: curbside && !isDelivery,
          utensils,
          note,
          // Only on a delivery, and kept apart from `note` above. The kitchen
          // reads one and the driver reads the other; sending both to both is
          // what this replaced.
          ...(isDelivery
            ? { deliveryDetail: deliveryDetail.trim(), handoff, courierNote: courierNote.trim() }
            : {}),
          // The tip is sent, and repriced server-side like everything else.
          // A client-supplied money value is a suggestion, never a fact.
          tipCents,
          items: rows.map(({ line, product, unitCents }) => ({
            slug: product.slug,
            name: product.name,
            quantity: line.quantity,
            options: line.options,
            priceCents: unitCents,
          })),
          subtotalCents,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        // ——— Sold out between filling the basket and paying ———
        //
        // The only refusal the customer cannot act on from an error message
        // alone. Every other one is "fix this field"; this one is "something
        // in your basket no longer exists", and leaving it there means Pay
        // fails again on the next press, forever.
        //
        // So the lines go, and the screen names what went. Removing them
        // silently would be worse than the loop: somebody would pay for a
        // shorter order than the one they read.
        const gone = Array.isArray(result?.soldOut)
          ? (result.soldOut as unknown[]).filter(
              (slug): slug is string => typeof slug === "string",
            )
          : [];
        if (gone.length > 0) {
          const names = gone
            .map((slug) => getProduct(slug)?.name)
            .filter((name): name is string => Boolean(name));
          for (const line of lines) {
            if (gone.includes(line.slug)) removeItem(lineKey(line.slug, line.options));
          }
          setSoldOutNow(names);
          setStatus("idle");
          return;
        }
        throw new Error(st(result?.error) || t("checkout.somethingWentWrong"));
      }

      // Read once, here, so the two lines below can't describe two different
      // cards — and so the whole of what this transaction knows about the card
      // is a single object with two harmless fields in it.
      const paid = tender === "card" ? card.summary() : null;

      // The account page's history and its usuals list are built from this.
      // Recorded after the endpoint accepts, so a rejected order doesn't show
      // up as one that happened, and on this device only — there's no
      // server-side order history to read back.
      const record = recordOrder({
        items: rows.map(({ line, product, unitCents, chosen }) => ({
          slug: product.slug,
          name: product.name,
          quantity: line.quantity,
          unitCents,
          options: line.options,
          optionsLabel: chosen.join(" · "),
        })),
        subtotalCents,
        // Snapshotted so the tracker and the account history show what was
        // actually owed, rather than re-deriving a number that leaves the tip
        // out and calls the subtotal a total.
        taxCents: totals.taxCents,
        deliveryCents: totals.deliveryCents,
        deliveryQuotedCents: totals.deliveryQuotedCents,
        tipCents: totals.tipCents,
        totalCents: totals.totalCents,
        // The mode itself, not the string key that names it: this record is
        // read back by progressFor() to decide whether an order is a delivery,
        // and it outlives any one language. The tracker translates it at
        // render through fulfillmentModeKey().
        fulfillmentMode: fulfillment?.mode ?? "pickup",
        fulfillmentWhere: where?.where ?? "Corner Bagel",
        // Uber's live view of the courier, when one was booked. The tracker
        // links to it rather than pretending to know where the driver is.
        ...(typeof result?.trackingUrl === "string"
          ? { trackingUrl: result.trackingUrl }
          : {}),
        // Toast's id for the order and Toast's own estimate of when it will
        // be ready. The endpoint has been returning the guid all along and
        // this is the first thing to keep it: without it there is no handle
        // to ask about this order later, and the tracker's clock is the only
        // thing it has to go on.
        ...(typeof result?.orderGuid === "string" ? { toastGuid: result.orderGuid } : {}),
        // The handle for "how many are ahead of mine". Its own field rather
        // than reusing toastGuid, because the queue is keyed by the guid on
        // one path and by an id the endpoint invents on the other, and the
        // screen asking should not have to know which shop it is standing in.
        ...(typeof result?.queueId === "string" ? { queueId: result.queueId } : {}),
        ...(typeof result?.readyAt === "number" ? { readyAt: result.readyAt } : {}),
        ...(typeof result?.deliveryId === "string" ? { deliveryId: result.deliveryId } : {}),
        // The card, as a receipt describes one. Brand and four digits, on this
        // device only — `summary()` is structurally incapable of handing over
        // the number, which is the point of it.
        ...(paid ? { cardBrand: BRAND_LABEL[paid.brand], cardLast4: paid.last4 } : {}),
      });
      // Up to the account, when there is one. Deliberately not awaited: the
      // order is placed, the kitchen has it, and this device has its own copy
      // — a history write must never be able to hold up or fail a checkout.
      // Signed out, /api/orders answers 204 and nothing happens.
      void pushOrder(record);

      setPlaced(record);
      setStatus("placed");
      // ——— The way back stops here ———
      //
      // Everything behind this point is the funnel that produced the order,
      // and the app has just emptied the basket those screens were about.
      // Without this, tracking an order and pressing back landed in the
      // checkout you had already completed, one press from a cart with
      // nothing in it. See navigationDepth.
      closeFunnel();
      // The once-a-visit one. Kept for this and nothing else, so it keeps
      // meaning "that worked" rather than becoming background noise.
      completed();
      clear();
    } catch (submitError) {
      setStatus("idle");
      setError(
        submitError instanceof Error ? submitError.message : t("checkout.somethingWentWrong"),
      );
    }
  }

  return {
    rows,
    itemCount: rows.reduce((sum, row) => sum + row.line.quantity, 0),
    subtotalCents,
    totals,
    incomplete,
    unavailable,
    soldOutNow,
    dismissSoldOut: () => setSoldOutNow([]),

    fulfillment,
    where,
    isDelivery,
    quote,
    quoteError,
    quoting: isDelivery && quote === null && !quoteError,

    deliveryDetail,
    setDeliveryDetail,
    handoff,
    setHandoff,
    courierNote,
    setCourierNote,

    firstName,
    setFirstName,
    lastName,
    setLastName,
    phone,
    setPhone,
    firstNameError,
    phoneError,

    curbside,
    setCurbside,
    utensils,
    setUtensils,
    note,
    setNote,
    tipCents,
    setTipCents,
    tender,
    setTender,
    card,

    step,
    detailsValid,
    continueToPayment,
    backToDetails,

    valid,
    status,
    error,
    placed,
    tried,
    submit,
  };
}
