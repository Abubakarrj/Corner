"use client";

import { useEffect, useState } from "react";
import { useLocale, useServerText, useT } from "../../i18n";
import { localeById } from "../../localeScript";
import { slotLabel } from "../../shopFacts";
import { usePickupSchedule, type PickupSchedule } from "./usePickupSchedule";
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
import { useSquareCard, type SquareCardEntry } from "./useSquareCard";
import { clearDraft, readDraft, writeDraft } from "./draft";
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
  /** When Uber expects the drop-off, as an instant. See the note in
   *  uberDirect.ts: the minute count ages, this does not. */
  etaAt: string | null;
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

  // ——— When it's for ———
  //
  // A pickup at a counter that is shut is not refused any more; it is given a
  // time. `scheduling` is what tells the screen to ask for one, and
  // `schedule.chosen` is the time the customer will be held to — which is why
  // it is on screen before the button says Pay rather than after.
  /** This order needs a time chosen before it can go. */
  scheduling: boolean;
  schedule: PickupSchedule;

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
  /** Square's hosted fields, when this shop charges cards. `enabled` false
   *  means the local `card` fields above are the ones on screen. */
  hosted: SquareCardEntry;

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
  const tag = localeById(useLocale()).tag;
  const { lines, removeItem, subtotalCents, clear } = useCart();
  const rows = useCartRows();
  const fulfillment = useFulfillment();
  const opening = useOpening();

  // What was typed before "Edit basket" took them to the cart, or before the
  // back button, or before the phone discarded the page. A lazy initialiser, so
  // it is read once at mount and edited freely from then on — the same shape
  // and the same reason as the delivery fields below. See draft.ts.
  const saved = useState(readDraft)[0];

  const [firstName, setFirstName] = useState(saved.firstName);
  const [lastName, setLastName] = useState(saved.lastName);
  const [phone, setPhone] = useState(saved.phone);
  const [curbside, setCurbside] = useState(saved.curbside);
  const [utensils, setUtensils] = useState(saved.utensils);
  const [note, setNote] = useState(saved.note);
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
    // The draft wins when there is one: it is what this customer typed on this
    // screen, and the fulfillment is what they typed on the last one.
    if (saved.deliveryDetail) return saved.deliveryDetail;
    const known = peekFulfillment();
    return known?.mode === "delivery" ? (known.unit ?? "") : "";
  });
  // Handed over in person by default. "Leave at door" is the choice somebody
  // makes deliberately; defaulting to it would leave bags on doorsteps for
  // people who never asked.
  const [handoff, setHandoff] = useState<Handoff>(saved.handoff);
  const [courierNote, setCourierNote] = useState(() => {
    if (saved.courierNote) return saved.courierNote;
    const known = peekFulfillment();
    return known?.mode === "delivery" ? (known.instructions ?? "") : "";
  });
  const [tipCents, setTipCents] = useState(saved.tipCents);
  const [tender, setTender] = useState<Tender>("counter");
  // ⚠️ Only back to payment when the details that gate it still hold — draft.ts
  // decides that, not this line. Landing somebody on the payment step with an
  // empty name is a worse welcome than the first step.
  const [step, setStep] = useState<CheckoutStep>(saved.onPayment ? "payment" : "details");
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

  // Square's hosted fields, when this shop charges cards. Alongside useCard
  // rather than instead of it: `hosted.enabled` is false on a deployment with
  // no Square credentials, and that deployment keeps the local fields and the
  // behaviour it has always had, which is that the money moves at the counter.
  //
  // When it is true the local fields are not rendered at all, so there is no
  // second place a card number could be typed.
  const hosted = useSquareCard();

  const where = fulfillment ? describeFulfillment(fulfillment) : null;
  const isDelivery = fulfillment?.mode === "delivery";

  // ——— Scheduling ———
  //
  // Only a pickup, and only at a counter this browser can name. A delivery is
  // still refused when the shop is shut, and deliberately: an Uber quote is
  // minutes-fresh and a courier cannot be booked for tomorrow morning, so
  // there is nothing here to schedule. See the note at the gate in
  // /api/shop-order.
  // Pickup only, not catering. A catering order is a tray for twenty arranged
  // days ahead by a person, and dropping one into a ten minute slot meant for
  // a bagel would be scheduling in name and overbooking in fact.
  const counterId = fulfillment?.mode === "pickup" ? fulfillment.locationId : null;
  const scheduling = !opening.acceptingOrders && !isDelivery && counterId !== null;
  const schedule = usePickupSchedule(counterId, scheduling);
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

  // The basket's composition as one string, which is both what the quote is
  // keyed on and what it sends. One value rather than a list beside a key:
  // a list would be a new array every render and a key that agreed with it
  // only by convention, and the two drifting is a quote that stops refreshing.
  const basketKey = [...new Set(lines.map((line) => line.slug))].sort().join(",");

  // ——— Saved as it is typed ———
  //
  // Every field the customer can fill in, written on each change, so leaving
  // for the cart and coming back costs nothing. Cheap: one small JSON write to
  // sessionStorage, and only when something actually changed.
  //
  // The card is absent because it cannot be read — it lives in Square's iframe
  // — and the tender is absent on purpose. See draft.ts.
  useEffect(() => {
    writeDraft({
      firstName,
      lastName,
      phone,
      note,
      curbside,
      utensils,
      tipCents,
      deliveryDetail,
      handoff,
      courierNote,
      onPayment: step === "payment",
    });
  }, [
    firstName,
    lastName,
    phone,
    note,
    curbside,
    utensils,
    tipCents,
    deliveryDetail,
    handoff,
    courierNote,
    step,
  ]);

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
        // So the fee is priced from the counter this order will leave from.
        // With two kitchens and one shorter menu, the nearest is not always
        // the one that can make it. See /api/delivery/quote.
        slugs: basketKey ? basketKey.split(",") : [],
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
    // And the basket, because which kitchen serves this address depends on
    // what is in it. Sorted unique slugs rather than the lines themselves:
    // changing a quantity cannot change which counter can make the order, and
    // re-quoting on every tap of a plus button is a billed call for an answer
    // that has not moved.
  }, [deliveryAddress, deliveryLat, deliveryLng, basketKey]);

  // A row that never got its bagel chosen can't be made, and the endpoint
  // refuses it — so the button refuses first, and says where to fix it.
  const incomplete = rows.filter((row) => !row.complete);
  // Sold out, or not made at the counter this order is going to. Both stop
  // the order and neither is an error the customer made, so they are one list
  // for the button and told apart on the row itself.
  const unavailable = rows.filter((row) => row.gone || row.elsewhere);

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
    // Nothing gets made outside opening hours, so nothing gets ordered *for
    // now*. The app used to take the order at 3am on a Monday and promise it
    // for 3:12am, which sends somebody to a locked window.
    //
    // A pickup at a shut counter is the one way past this, and only once a
    // time has come back from the shop. Not "the shop is shut, so pick a
    // time and we'll see" — the time on screen is a slot the server has, and
    // the order is checked against it again when it lands.
    (opening.acceptingOrders || (scheduling && schedule.chosen !== null)) &&
    // A delivery order can't be placed until a courier has priced it. Placing
    // it anyway would mean promising a delivery nobody has agreed to make.
    (!isDelivery || quote !== null) &&
    // Paying by card means there has to be a card. Checked here rather than in
    // the component so both surfaces get it, and so the rule sits next to the
    // other five reasons an order can't go.
    // Paying by card means there has to be a card. Which fields answer that
    // question depends on who is rendering them: Square's are an iframe this
    // page cannot inspect, so the test is that they mounted, and whether the
    // card is any good is settled by tokenize() at submit.
    (tender !== "card" || (hosted.enabled ? hosted.ready : card.complete));

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

    // ——— The card, turned into a token, before anything else happens ———
    //
    // Square's iframes hold the number; this is the one call that asks them for
    // something we are allowed to have. It runs first because a card that will
    // not tokenize is a checkout that must not proceed, and because
    // verifyBuyer() inside it can put a bank's 3-D Secure challenge on screen —
    // which has to happen while the customer is still here, not after the
    // order is away.
    //
    // ⚠️ `payment` holds a single-use token. There is no card number in this
    // function, in this file, or in the request below.
    let payment: { token: string; verificationToken?: string } | null = null;
    if (hosted.enabled && tender === "card") {
      payment = await hosted.tokenize({
        amountCents: totals.totalCents,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        // No email: this screen deliberately does not collect one (see the
        // note at the top), and the server reads it from the session cookie.
        // Square treats billingContact.email as optional.
        email: "",
        phone,
      });
      if (!payment) {
        // Square refused the card details themselves — a wrong number, a bad
        // postcode, an expired card. Nothing has been charged and no order has
        // been sent, so this is a correction rather than a failure.
        setError(t("checkout.cardNotAccepted"));
        setStatus("idle");
        refused();
        return;
      }
    }

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
          // Which tender was chosen, said rather than inferred. The server used
          // to guess from whether a token arrived, and guessed "this order is
          // broken" for everybody paying at the window.
          tender,
          // The token, and Square's 3-D Secure result where the bank asked for
          // one. Opaque, single-use, and worthless to anybody who intercepts
          // it. The card number is not here and has no route to here.
          ...(payment
            ? {
                paymentToken: payment.token,
                ...(payment.verificationToken
                  ? { verificationToken: payment.verificationToken }
                  : {}),
              }
            : {}),
          // The time on screen, sent back so the server holds *that* minute
          // rather than whichever one it would pick on its own. Absent on an
          // ordinary order, and the endpoint refuses a scheduled one without
          // it — the whole point is that nobody pays for a time they have
          // not read.
          ...(scheduling && schedule.chosen ? { scheduledFor: schedule.chosen } : {}),
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
        // ——— Not made at the counter this order is going to ———
        //
        // Deliberately NOT the same treatment as sold out. Sold out empties
        // the line because the item no longer exists anywhere and there is
        // nothing to keep; this one is "not here", and the item is perfectly
        // real one counter away. Deleting somebody's sandwich because they
        // picked the nearer shop takes the decision off them — switching to
        // Wilshire Blvd is a fix they might prefer, and it is only available
        // while the sandwich is still in the basket.
        //
        // So the basket is left alone and the message says both ways out. The
        // rows are already badged, so what arrives here is the sentence, not
        // the news.
        if (Array.isArray(result?.notAtCounter)) {
          setError(st(result?.error) || t("checkout.somethingWentWrong"));
          setStatus("idle");
          return;
        }
        // ——— The time went while they were typing ———
        //
        // Somebody else took the last seat at 7:15 between this screen being
        // drawn and this button being pressed. Not a mistake the customer
        // made and not a reason to send them back to the basket: the shop
        // sends the next time it can do, the chips redraw around it, and one
        // more press places the order.
        //
        // Deliberately not placed automatically at the new time. That is a
        // different order from the one they agreed to, however close the
        // minutes are, and the whole point of scheduling is that the time is
        // read before it is paid for.
        if (typeof result?.scheduledFor === "string") {
          const slots = Array.isArray(result?.slots)
            ? (result.slots as unknown[]).filter(
                (value): value is string => typeof value === "string",
              )
            : [];
          schedule.correct(result.scheduledFor, slots);
          setError(
            t("checkout.scheduleMoved", {
              time: slotLabel(new Date(result.scheduledFor), tag),
            }),
          );
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
        // The slot the shop agreed to. Kept because every screen that talks
        // about this order afterwards — the confirmation, the tracker, the
        // history — would otherwise date it from when it was placed, and an
        // order placed at 4am and collected at 7:15 is nine stages of wrong
        // if the clock starts at 4.
        ...(typeof result?.scheduledFor === "string" &&
        !Number.isNaN(Date.parse(result.scheduledFor))
          ? { scheduledFor: Date.parse(result.scheduledFor) }
          : {}),
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

      // Done with. Carrying a draft past the order it was written for is how
      // somebody's note about an allergy ends up on a stranger's sandwich next
      // week, and how a shared phone in the shop hands over the last
      // customer's number.
      clearDraft();
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

    scheduling,
    schedule,

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
    hosted,

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
