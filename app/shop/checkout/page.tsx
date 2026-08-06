"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCart, useCartRows } from "../CartContext";
import { formatPrice } from "../products";
import { totalsFor } from "../money";
import { describeFulfillment, useFulfillment } from "../../fulfillment";
import { useOpening } from "../../useOpening";
import { CLOSE_LABEL } from "../../shopFacts";
import { useCapabilities } from "../../capabilities";
import { orderTotals, recordOrder, PREP_MINUTES, type PlacedOrder } from "../../account";
import { Button, ButtonLink } from "../../ui/Button";
import { DISPLAY_FONT } from "../shopControls";
import { Check, Disclosure, Field, Money, Section } from "./CheckoutSections";
import PaymentSection, { type Tender } from "./PaymentSection";
import TipPicker from "./TipPicker";

// Checkout, in the order the reference asks for it: who you are, where it's
// going, what's in it, how you're paying, what you're adding, what it comes
// to. One column on a phone — a two-column checkout on a 430px screen is two
// half-width columns.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readyAt(minutes: number): string {
  const when = new Date(Date.now() + minutes * 60_000);
  return when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function CheckoutPage() {
  const { subtotalCents, clear } = useCart();
  const fulfillment = useFulfillment();
  const rows = useCartRows();
  const opening = useOpening();
  const { payments } = useCapabilities();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [curbside, setCurbside] = useState(false);
  const [utensils, setUtensils] = useState(false);
  const [note, setNote] = useState("");
  const [tipCents, setTipCents] = useState(0);
  const [tender, setTender] = useState<Tender>("counter");
  const [status, setStatus] = useState<"idle" | "sending" | "placed">("idle");
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set once someone has tried to submit, so the form doesn't scold you about
  // an empty email before you've had a chance to fill it in.
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
  // Both are tagged with the address they belong to and read back only when
  // that still matches — the same pattern the address search uses. Switching
  // fulfillment mid-checkout would otherwise leave the previous address's fee
  // on the screen while the new one is still in flight, and the moment to be
  // showing a stale delivery fee is never.
  const [quoted, setQuoted] = useState<{
    forAddress: string;
    quote: { quoteId: string; feeCents: number; etaMinutes: number | null } | null;
    error: string | null;
  } | null>(null);

  const quote = quoted?.forAddress === deliveryAddress ? quoted.quote : null;
  const quoteError = quoted?.forAddress === deliveryAddress ? quoted.error : null;

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
          error: response.ok ? null : (body?.error ?? "We couldn't price that delivery."),
        });
      })
      .catch(() => {
        if (!live) return;
        setQuoted({
          forAddress: deliveryAddress,
          quote: null,
          error: "We couldn't price that delivery.",
        });
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

  const emailError = tried && !EMAIL.test(email.trim()) ? "Enter a valid email." : undefined;
  const firstNameError = tried && firstName.trim().length === 0 ? "Required." : undefined;

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

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
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
        throw new Error(result?.error ?? "Something went wrong.");
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
        fulfillmentMode: where?.mode ?? "Pickup",
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
      setError(submitError instanceof Error ? submitError.message : "Something went wrong.");
    }
  }

  if (status === "placed") {
    // The recorded order's own totals, not the live ones. `totals` is derived
    // from the cart, and placing the order clears the cart — so reading it
    // here printed a $0.00 subtotal and a $0.00 tax under the tip, on the one
    // screen whose entire job is telling somebody what they owe. A
    // confirmation has to describe what happened, not recompute from state
    // that has since moved on.
    return <Placed order={placed} where={where} />;
  }

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
        <p className="text-[14px] text-muted">Your basket is empty.</p>
        <Link href="/shop" className="mt-3 inline-block cursor-pointer text-[14px] underline">
          Browse the menu
        </Link>
      </div>
    );
  }

  const itemCount = rows.reduce((sum, row) => sum + row.line.quantity, 0);

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-lg px-4 pb-10 pt-6 sm:px-6">
      <h1
        className="m-0 mb-6 text-[20px] font-medium text-ink"
        style={{ fontFamily: DISPLAY_FONT }}
      >
        Checkout
      </h1>

      <Section title="Contact">
        <div className="flex flex-col gap-3">
          <Field
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={setEmail}
            error={emailError}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="First name"
              autoComplete="given-name"
              required
              value={firstName}
              onChange={setFirstName}
              error={firstNameError}
            />
            <Field
              label="Last name"
              autoComplete="family-name"
              value={lastName}
              onChange={setLastName}
            />
          </div>
          <Field
            label="Phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={setPhone}
          />
          <p className="m-0 text-[11px] leading-[1.5] text-quiet">
            We use these to reach you about this order. Nothing else.
          </p>
        </div>
      </Section>

      <Section
        title={isDelivery ? "Delivery details" : "Pickup details"}
        aside={
          <Link
            href="/locations"
            className="cursor-pointer text-[13px] text-ink underline underline-offset-2"
          >
            {isDelivery ? "Switch to pickup" : "Switch to delivery"}
          </Link>
        }
      >
        <div className="rounded-xl border border-line-soft">
          <div className="flex items-start gap-3 border-b border-line-faint p-4">
            <ClockIcon />
            <div className="min-w-0">
              <p className="m-0 text-[14px] text-ink">
                {/* On a delivery, the time is Uber's — it's their courier and
                    their estimate of the drive. On a pickup it's the
                    kitchen's prep time and nothing else. */}
                {isDelivery ? "Delivery" : "Pickup"} around{" "}
                {readyAt(isDelivery ? (quote?.etaMinutes ?? PREP_MINUTES) : PREP_MINUTES)}
              </p>
              {/* "Estimated" is doing real work here: nothing in this app can
                  see the kitchen, so this is arithmetic on the clock, and
                  saying otherwise would be a promise the shop didn't make. */}
              <p className="m-0 text-[12px] text-muted">
                {isDelivery && quote
                  ? "Estimated by the courier."
                  : "Estimated — the shop confirms."}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4">
            <PinIcon />
            <div className="min-w-0">
              <p className="m-0 text-[14px] text-ink">{where?.where ?? "Corner Bagel"}</p>
              {fulfillment && fulfillment.mode !== "delivery" ? (
                <p className="m-0 text-[12px] text-muted">{fulfillment.detail}</p>
              ) : null}
            </div>
          </div>

          {!isDelivery ? (
            <div className="border-t border-line-faint p-4">
              <Check
                checked={curbside}
                onChange={setCurbside}
                label="Curbside pickup"
                hint="Bring my order out to the car."
              />
            </div>
          ) : null}
        </div>
      </Section>

      <Section title="Order details">
        <Disclosure summary={`${itemCount} item${itemCount === 1 ? "" : "s"}`}>
          <div className="flex flex-col divide-y divide-line-faint">
            {rows.map(({ line, product, key, lineCents, chosen }) => (
              <div key={key} className="flex items-start justify-between gap-3 py-2.5">
                <span className="min-w-0 text-[14px] text-ink">
                  {product.name} <span className="text-quiet">×{line.quantity}</span>
                  {chosen.length > 0 ? (
                    <span className="mt-0.5 block text-[12px] text-muted">
                      {chosen.join(" · ")}
                    </span>
                  ) : null}
                </span>
                <span className="whitespace-nowrap text-[14px] text-ink">
                  {formatPrice(lineCents)}
                </span>
              </div>
            ))}
          </div>
          <Link
            href="/shop/cart"
            className="mt-3 inline-block cursor-pointer text-[13px] text-muted underline hover:text-ink"
          >
            Edit basket
          </Link>
        </Disclosure>

        {unavailable.length > 0 ? (
          <p role="alert" className="m-0 mt-3 text-[12px] text-brand-red">
            {unavailable[0].product.name} sold out today.{" "}
            <Link href="/shop/cart" className="cursor-pointer underline">
              Take it out of your basket
            </Link>
            .
          </p>
        ) : null}

        {incomplete.length > 0 ? (
          <p role="alert" className="m-0 mt-3 text-[12px] text-brand-red">
            {incomplete[0].product.name} still needs its options.{" "}
            <Link href="/shop/cart" className="cursor-pointer underline">
              Choose in your basket
            </Link>
            .
          </p>
        ) : null}
      </Section>

      {!opening.acceptingOrders ? (
        <div className="mb-6 rounded-2xl border border-line-soft bg-sun-soft px-4 py-3">
          <p className="m-0 text-[14px] font-medium text-sun-ink">
            {opening.open ? "The kitchen is closing" : "We're closed right now"}
          </p>
          <p className="m-0 mt-1 text-[13px] leading-[1.5] text-sun-ink">
            {opening.open
              ? `There isn't time to make this before we shut at ${CLOSE_LABEL}. Your basket keeps — order again when we open.`
              : `${opening.label.replace("Closed · o", "O")}. Your basket keeps until then.`}
          </p>
        </div>
      ) : null}

      <Section title="Payment">
        <PaymentSection tender={tender} onTender={setTender} cardEnabled={payments} />
      </Section>

      <Section title="Add a tip">
        <TipPicker subtotalCents={subtotalCents} tipCents={tipCents} onTip={setTipCents} />
      </Section>

      <Section title="Anything else">
        <div className="flex flex-col gap-4">
          <Check
            checked={utensils}
            onChange={setUtensils}
            label="Utensils and napkins"
            hint="Left out unless you ask — most orders don't need them."
          />
          <div>
            <label htmlFor="order-note" className="mb-1 block text-[12px] text-muted">
              Note for the kitchen
            </label>
            <textarea
              id="order-note"
              rows={2}
              maxLength={255}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Allergies, how you'd like it, where to leave it."
              className="w-full resize-none rounded-xl border border-line-soft bg-surface px-4 py-3 text-[16px] text-ink outline-none transition-colors placeholder:text-quieter focus:border-ink"
            />
          </div>
        </div>
      </Section>

      <div className="border-t border-line pt-5">
        <Money label="Subtotal" amount={formatPrice(totals.subtotalCents)} />
        <Money label="Tax" amount={formatPrice(totals.taxCents)} />
        {isDelivery ? (
          <Money
            label="Delivery"
            amount={quote ? formatPrice(totals.deliveryCents) : "—"}
          />
        ) : null}
        {totals.tipCents > 0 ? <Money label="Tip" amount={formatPrice(totals.tipCents)} /> : null}
        <div className="mt-1 border-t border-line pt-2">
          <Money label="Total" amount={formatPrice(totals.totalCents)} strong />
        </div>
      </div>

      {/* A courier that can't take the job is not an error the customer
          caused, and it has a way out that isn't "try again" — so it says
          what happened and points at pickup. */}
      {quoteError ? (
        <p role="alert" className="m-0 mt-4 text-[13px] text-brand-red">
          {quoteError}{" "}
          <Link href="/locations" className="cursor-pointer underline">
            Switch to pickup
          </Link>
          .
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="m-0 mt-4 text-[13px] text-brand-red">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        block
        disabled={
          status === "sending" ||
          incomplete.length > 0 ||
          unavailable.length > 0 ||
          !opening.acceptingOrders ||
          (isDelivery && quote === null)
        }
        className="mt-5"
      >
        {status === "sending"
          ? "Placing order…"
          : !opening.acceptingOrders
            ? "Closed"
            : isDelivery && quote === null
              ? quoteError
                ? "Delivery unavailable"
                : "Pricing delivery…"
              : `Place order · ${formatPrice(totals.totalCents)}`}
      </Button>

      {/* Says what actually happens, which depends on how the shop is set up
          rather than on a hardcoded apology. Getting this wrong in the
          reassuring direction — telling somebody they've paid when they
          haven't — is the one failure mode worth designing against. */}
      <p className="m-0 mt-3 text-center text-[11px] leading-[1.6] text-quiet">
        {tender === "card"
          ? "Your card is charged when the shop confirms the order."
          : "You pay at the window when you collect."}
      </p>
    </form>
  );
}

// The confirmation. A food order's next question is always "where is it", so
// the tracker is the primary action and the menu is the way back.
function Placed({
  order,
  where,
}: {
  order: PlacedOrder | null;
  where: { mode: string; where: string } | null;
}) {
  const bill = order ? orderTotals(order) : null;
  return (
    <div className="cb-rise mx-auto max-w-lg px-4 py-10 text-center sm:px-6">
      <span
        aria-hidden
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--cb-good-bg)" }}
      >
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
          <path
            d="M6 13.4l4.6 4.6L20 8.6"
            stroke="var(--cb-ink)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <p
        className="mt-4 text-[22px] font-medium leading-tight text-ink"
        style={{ fontFamily: DISPLAY_FONT }}
      >
        You&rsquo;re all set
      </p>
      <p className="mx-auto mt-1.5 max-w-xs text-[14px] leading-[1.5] text-muted">
        {where ? (
          <>
            {where.mode} from <span className="font-medium text-ink">{where.where}</span>.
            We&rsquo;ll have it ready.
          </>
        ) : (
          <>We&rsquo;ll have it ready.</>
        )}
      </p>

      {bill ? (
        <div className="mx-auto mt-6 max-w-[280px] rounded-2xl border border-line-soft p-4 text-left">
          <Money label="Subtotal" amount={formatPrice(bill.subtotalCents)} />
          <Money label="Tax" amount={formatPrice(bill.taxCents)} />
          {bill.deliveryCents > 0 ? (
            <Money label="Delivery" amount={formatPrice(bill.deliveryCents)} />
          ) : null}
          {bill.tipCents > 0 ? <Money label="Tip" amount={formatPrice(bill.tipCents)} /> : null}
          <div className="mt-1 border-t border-line pt-2">
            <Money label="Total" amount={formatPrice(bill.totalCents)} strong />
          </div>
        </div>
      ) : null}

      {order ? (
        <ButtonLink href={`/shop/order/${order.id}`} className="mt-6 w-full max-w-[280px]">
          Track order
        </ButtonLink>
      ) : null}

      <Link
        href="/shop"
        className="cb-press mt-4 block cursor-pointer text-[14px] text-muted underline hover:text-ink"
      >
        Back to the menu
      </Link>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className="mt-0.5 shrink-0">
      <circle cx="9" cy="9" r="7" stroke="var(--cb-muted)" strokeWidth="1.5" />
      <path d="M9 5v4.2l2.6 1.6" stroke="var(--cb-muted)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className="mt-0.5 shrink-0">
      <path
        d="M9 16s5.2-5 5.2-8.2A5.2 5.2 0 0 0 3.8 7.8C3.8 11 9 16 9 16Z"
        stroke="var(--cb-muted)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="7.6" r="1.9" stroke="var(--cb-muted)" strokeWidth="1.5" />
    </svg>
  );
}
