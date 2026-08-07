"use client";

import { useEffect, useState } from "react";
import { useServerText, useT } from "../../i18n";
import { useCart, useCartRows } from "../CartContext";
import { totalsFor, type OrderTotals } from "../money";
import { describeFulfillment, useFulfillment, type Fulfillment } from "../../fulfillment";
import { useOpening } from "../../useOpening";
import { recordOrder, type PlacedOrder } from "../../account";
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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CheckoutStatus = "idle" | "sending" | "placed";

export type DeliveryQuote = {
  quoteId: string;
  feeCents: number;
  etaMinutes: number | null;
};

export type Checkout = {
  // ——— What's being bought ———
  rows: CartRow[];
  itemCount: number;
  subtotalCents: number;
  totals: OrderTotals;
  /** Rows that never got their choices made; the endpoint refuses these. */
  incomplete: CartRow[];
  /** Rows that sold out after the basket was filled. */
  unavailable: CartRow[];

  // ——— Where it's going ———
  fulfillment: Fulfillment | null;
  where: { mode: ReturnType<typeof describeFulfillment>["mode"]; where: string } | null;
  isDelivery: boolean;
  quote: DeliveryQuote | null;
  quoteError: string | null;
  /** True while the courier is still pricing a delivery. */
  quoting: boolean;

  // ——— Who's buying ———
  firstName: string;
  setFirstName: (value: string) => void;
  lastName: string;
  setLastName: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  phone: string;
  setPhone: (value: string) => void;
  firstNameError: string | undefined;
  emailError: string | undefined;

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
  const { subtotalCents, clear } = useCart();
  const rows = useCartRows();
  const fulfillment = useFulfillment();
  const opening = useOpening();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [curbside, setCurbside] = useState(false);
  const [utensils, setUtensils] = useState(false);
  const [note, setNote] = useState("");
  const [tipCents, setTipCents] = useState(0);
  const [tender, setTender] = useState<Tender>("counter");
  const [status, setStatus] = useState<CheckoutStatus>("idle");
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const where = fulfillment ? describeFulfillment(fulfillment) : null;
  const isDelivery = fulfillment?.mode === "delivery";
  const deliveryAddress = fulfillment?.mode === "delivery" ? fulfillment.address : null;

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
      body: JSON.stringify({ address: deliveryAddress }),
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
  }, [deliveryAddress]);

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

  const emailError = tried && !EMAIL.test(email.trim()) ? t("checkout.validEmail") : undefined;
  const firstNameError = tried && firstName.trim().length === 0 ? t("checkout.required") : undefined;

  const valid =
    firstName.trim().length > 0 &&
    EMAIL.test(email.trim()) &&
    rows.length > 0 &&
    incomplete.length === 0 &&
    unavailable.length === 0 &&
    // Nothing gets made outside opening hours, so nothing gets ordered. The
    // app used to take the order at 3am on a Monday and promise it for
    // 3:12am, which sends somebody to a locked window.
    opening.acceptingOrders &&
    // A delivery order can't be placed until a courier has priced it. Placing
    // it anyway would mean promising a delivery nobody has agreed to make.
    (!isDelivery || quote !== null);

  async function submit() {
    setTried(true);
    if (!valid || status !== "idle") return;

    setStatus("sending");
    setError(null);

    try {
      const response = await fetch("/api/shop-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          email,
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
        throw new Error(st(result?.error) || t("checkout.somethingWentWrong"));
      }

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
      });
      setPlaced(record);
      setStatus("placed");
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

    fulfillment,
    where,
    isDelivery,
    quote,
    quoteError,
    quoting: isDelivery && quote === null && !quoteError,

    firstName,
    setFirstName,
    lastName,
    setLastName,
    email,
    setEmail,
    phone,
    setPhone,
    firstNameError,
    emailError,

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

    valid,
    status,
    error,
    placed,
    tried,
    submit,
  };
}
