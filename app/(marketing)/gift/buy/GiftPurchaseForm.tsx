"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatPrice } from "../../../shop/products";
import { Button, ButtonLink } from "../../../ui/Button";
import { PALETTE, SHOP_FONT } from "../../../shop/shopControls";
import { useCapabilities } from "../../../capabilities";
import { GIFT_CARDS } from "../giftCards";
import GiftCardArt from "../GiftCardArt";
import {
  DELIVERY_METHODS,
  GIFT_AMOUNTS_CENTS,
  GIFT_MAX_CENTS,
  GIFT_MIN_CENTS,
  MESSAGE_MAX,
  contactError,
  dateError,
  describeDelivery,
  giftOrderError,
  isValidAmount,
  type DeliveryMethod,
  type GiftOrder,
} from "./giftOrder";

const { cream } = PALETTE;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Buying a gift card, built to the reference: amount, how it's delivered, when
// it lands, who it's from and to, then payment.
//
// It doesn't go through the food basket. A basket here is bound to a pickup
// counter or a delivery address — the shop won't even open the menu without
// one — and none of that means anything for a card that arrives by email. So
// this is its own short flow with its own confirmation.
export default function GiftPurchaseForm({ designId }: { designId: string }) {
  const { payments } = useCapabilities();
  const design = useMemo(
    () => GIFT_CARDS.find((card) => card.id === designId) ?? GIFT_CARDS[0],
    [designId],
  );

  const [amountCents, setAmountCents] = useState<number>(GIFT_AMOUNTS_CENTS[1]);
  const [customAmount, setCustomAmount] = useState("");
  const [method, setMethod] = useState<DeliveryMethod>("email");
  const [recipientContact, setRecipientContact] = useState("");
  const [confirmContact, setConfirmContact] = useState("");
  const [deliverOn, setDeliverOn] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [senderName, setSenderName] = useState("");
  const [message, setMessage] = useState("");

  // Payment step.
  const [step, setStep] = useState<"build" | "pay" | "done">("build");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const order: GiftOrder = {
    designId: design.id,
    amountCents,
    method,
    recipientContact,
    deliverOn,
    recipientName,
    senderName,
    message,
  };

  const contactProblem = tried ? contactError(method, recipientContact) : null;
  const confirmProblem =
    tried && method !== "self" && confirmContact.trim() !== recipientContact.trim()
      ? "These don't match."
      : null;
  const dateProblem = tried ? dateError(deliverOn) : null;

  const ready =
    giftOrderError(order) === null &&
    (method === "self" || confirmContact.trim() === recipientContact.trim());

  // A gift card is stored value, not a meal — it isn't taxed on purchase, it's
  // taxed when it's spent on something taxable. So the total is the face value,
  // and app/shop/money.ts is deliberately not involved.
  const totalCents = amountCents;

  function applyCustom(raw: string) {
    setCustomAmount(raw);
    const dollars = Number.parseFloat(raw);
    if (Number.isFinite(dollars)) setAmountCents(Math.round(dollars * 100));
  }

  async function pay(event: React.FormEvent) {
    event.preventDefault();
    setTried(true);
    if (!EMAIL.test(buyerEmail.trim()) || sending) return;

    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/gift-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...order, buyerEmail }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Something went wrong.");
      }
      setStep("done");
    } catch (payError) {
      setError(payError instanceof Error ? payError.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  if (step === "done") {
    return <Sent order={order} totalCents={totalCents} design={design} paid={payments} />;
  }

  return (
    <div style={{ backgroundColor: cream, fontFamily: SHOP_FONT }}>
      <div className="mx-auto max-w-lg px-5 pb-12 pt-6">
        <Link
          href="/gift"
          className="cb-press inline-block cursor-pointer text-[13px] text-muted underline hover:text-ink"
        >
          ← All designs
        </Link>

        <h1 className="m-0 mt-4 text-center text-[22px] font-medium leading-tight tracking-[-0.01em] text-ink">
          Corner Bagel Gift Card
        </h1>

        <div className="mx-auto mt-5 aspect-[1.35] w-[62%] overflow-hidden rounded-2xl">
          <div className="relative h-full w-full">
            <GiftCardArt art={design.art} />
          </div>
        </div>

        {step === "build" ? (
          <>
            <Block title="Gift amount" required>
              <div className="grid grid-cols-4 gap-2">
                {GIFT_AMOUNTS_CENTS.map((cents) => {
                  const active = amountCents === cents && customAmount === "";
                  return (
                    <button
                      key={cents}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setCustomAmount("");
                        setAmountCents(cents);
                      }}
                      className={`cb-press cursor-pointer rounded-xl border py-3 text-[14px] font-medium transition-colors ${
                        active
                          ? "border-ink bg-ink text-on-ink"
                          : "border-line-soft bg-surface text-ink hover:border-line-mute"
                      }`}
                    >
                      {formatPrice(cents)}
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 flex items-center gap-2 rounded-xl border border-line-soft bg-surface px-4 py-3 focus-within:border-ink">
                <span className="text-[15px] text-muted">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="Custom amount"
                  placeholder={`Customize amount (${formatPrice(GIFT_MIN_CENTS)} – ${formatPrice(GIFT_MAX_CENTS)})`}
                  value={customAmount}
                  onChange={(event) => applyCustom(event.target.value)}
                  className="w-full min-w-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-quieter"
                />
              </div>
              {customAmount !== "" && !isValidAmount(amountCents) ? (
                <p role="alert" className="m-0 mt-1 text-[12px] text-brand-red">
                  Pick an amount between {formatPrice(GIFT_MIN_CENTS)} and{" "}
                  {formatPrice(GIFT_MAX_CENTS)}.
                </p>
              ) : null}
            </Block>

            <Block title="Delivery options" required>
              <div className="flex flex-col gap-2">
                {DELIVERY_METHODS.map(({ id, label }) => (
                  <label
                    key={id}
                    className={`cb-press flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors ${
                      method === id ? "border-ink bg-raise" : "border-line-soft hover:border-line-mute"
                    }`}
                  >
                    <input
                      type="radio"
                      name="delivery-method"
                      checked={method === id}
                      onChange={() => {
                        setMethod(id);
                        setRecipientContact("");
                        setConfirmContact("");
                      }}
                      className="h-[18px] w-[18px] shrink-0 accent-[var(--cb-ink)]"
                    />
                    <span className="text-[14px] text-ink">{label}</span>
                  </label>
                ))}
              </div>

              {method !== "self" ? (
                <div className="mt-3 flex flex-col gap-2">
                  <Input
                    label={method === "email" ? "Recipient email" : "Recipient phone number"}
                    type={method === "email" ? "email" : "tel"}
                    inputMode={method === "email" ? "email" : "tel"}
                    value={recipientContact}
                    onChange={setRecipientContact}
                    error={contactProblem}
                  />
                  <Input
                    label={method === "email" ? "Confirm email" : "Confirm phone number"}
                    type={method === "email" ? "email" : "tel"}
                    inputMode={method === "email" ? "email" : "tel"}
                    value={confirmContact}
                    onChange={setConfirmContact}
                    error={confirmProblem}
                  />
                </div>
              ) : (
                <p className="m-0 mt-3 text-[12px] leading-[1.5] text-muted">
                  We&rsquo;ll send it to you, and you can forward it whenever you like.
                </p>
              )}
            </Block>

            <Block title="Delivery date" required>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={deliverOn === null}
                  onClick={() => setDeliverOn(null)}
                  className={`cb-press cursor-pointer rounded-xl border py-3 text-[14px] transition-colors ${
                    deliverOn === null
                      ? "border-ink bg-ink text-on-ink"
                      : "border-line-soft bg-surface text-ink hover:border-line-mute"
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  aria-pressed={deliverOn !== null}
                  onClick={() => {
                    if (deliverOn === null) {
                      const tomorrow = new Date(Date.now() + 86_400_000);
                      setDeliverOn(
                        `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`,
                      );
                    }
                  }}
                  className={`cb-press cursor-pointer rounded-xl border py-3 text-[14px] transition-colors ${
                    deliverOn !== null
                      ? "border-ink bg-ink text-on-ink"
                      : "border-line-soft bg-surface text-ink hover:border-line-mute"
                  }`}
                >
                  Later
                </button>
              </div>

              {deliverOn !== null ? (
                <input
                  type="date"
                  aria-label="Delivery date"
                  value={deliverOn}
                  onChange={(event) => setDeliverOn(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-line-soft bg-surface px-4 py-3 text-[16px] text-ink outline-none focus:border-ink"
                />
              ) : (
                <p className="m-0 mt-2 text-[12px] leading-[1.5] text-muted">
                  We&rsquo;ll send the card as soon as the order goes through.
                </p>
              )}
              {dateProblem ? (
                <p role="alert" className="m-0 mt-1 text-[12px] text-brand-red">
                  {dateProblem}
                </p>
              ) : null}
            </Block>

            <Block title="Personalize your card">
              <div className="flex flex-col gap-2">
                <Input label="Recipient's name" value={recipientName} onChange={setRecipientName} />
                <Input label="Sender's name" value={senderName} onChange={setSenderName} />
                <div>
                  <textarea
                    rows={3}
                    maxLength={MESSAGE_MAX}
                    aria-label="Message"
                    placeholder={`Add a message, up to ${MESSAGE_MAX} characters.`}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    className="w-full resize-none rounded-xl border border-line-soft bg-surface px-4 py-3 text-[16px] text-ink outline-none transition-colors placeholder:text-quieter focus:border-ink"
                  />
                  <p className="m-0 mt-1 text-right text-[11px] text-quiet">
                    {message.length}/{MESSAGE_MAX}
                  </p>
                </div>
              </div>
            </Block>

            {/* Never disabled for validation. A greyed-out button with no
                stated reason is a dead end — you can't press it to find out
                what's wrong, so you're left guessing which field it dislikes.
                Pressing it either moves on or says what's missing. */}
            <Button
              block
              className="mt-6"
              onClick={() => {
                setTried(true);
                if (ready) setStep("pay");
              }}
            >
              Continue · {formatPrice(totalCents)}
            </Button>
            {tried && !ready ? (
              <p role="alert" className="m-0 mt-2 text-center text-[12px] text-brand-red">
                {giftOrderError(order) ?? "Check the recipient details."}
              </p>
            ) : null}
          </>
        ) : (
          <form onSubmit={pay} noValidate className="mt-6">
            <Block title="Your details">
              <Input
                label="Your email — the receipt goes here"
                type="email"
                inputMode="email"
                value={buyerEmail}
                onChange={setBuyerEmail}
                error={tried && !EMAIL.test(buyerEmail.trim()) ? "Enter a valid email." : null}
              />
            </Block>

            <Block title="Payment">
              {/* No card fields of our own, ever. A gift card is the one thing
                  here that genuinely has to be paid for up front, which makes
                  it the last place to hand-roll a card form — the number
                  belongs in the processor's hosted element, not in this page.
                  See app/toast.ts. */}
              {payments ? (
                <div
                  id="toast-payment-element"
                  className="rounded-xl border border-line-soft p-4"
                />
              ) : (
                <div className="rounded-xl border border-line-soft p-4">
                  <p className="m-0 text-[14px] text-ink">Pay by link</p>
                  <p className="m-0 mt-1 text-[12px] leading-[1.5] text-muted">
                    We&rsquo;ll email you a payment link, and the card goes out as soon
                    as it&rsquo;s paid.
                  </p>
                </div>
              )}
            </Block>

            <div className="border-t border-line pt-4">
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[14px] text-muted">Gift card</span>
                <span className="text-[14px] text-ink">{formatPrice(amountCents)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-2">
                <span className="text-[15px] font-medium text-ink">Total</span>
                <span className="text-[15px] font-medium text-ink">{formatPrice(totalCents)}</span>
              </div>
              {/* Said once, plainly: a gift card isn't taxed when it's bought,
                  it's taxed on what it buys. */}
              <p className="m-0 mt-2 text-[11px] text-quiet">
                No tax on a gift card — it&rsquo;s charged on whatever it&rsquo;s spent on.
              </p>
            </div>

            {error ? (
              <p role="alert" className="m-0 mt-4 text-[13px] text-brand-red">
                {error}
              </p>
            ) : null}

            <Button type="submit" block className="mt-5" disabled={sending}>
              {sending ? "Sending…" : `Place gift card order · ${formatPrice(totalCents)}`}
            </Button>
            <button
              type="button"
              onClick={() => setStep("build")}
              className="cb-press mx-auto mt-3 block cursor-pointer text-[13px] text-muted underline hover:text-ink"
            >
              Back to the card
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// The screen after the order goes through.
function Sent({
  order,
  totalCents,
  design,
  paid,
}: {
  order: GiftOrder;
  totalCents: number;
  design: (typeof GIFT_CARDS)[number];
  paid: boolean;
}) {
  return (
    <div
      className="cb-rise mx-auto max-w-lg px-5 py-10 text-center"
      style={{ fontFamily: SHOP_FONT }}
    >
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

      <p className="m-0 mt-4 text-[22px] font-medium leading-tight text-ink">
        Gift card on its way
      </p>
      <p className="m-0 mx-auto mt-1.5 max-w-xs text-[14px] leading-[1.5] text-muted">
        {describeDelivery(order)}
      </p>

      <div className="mx-auto mt-6 aspect-[1.35] w-[62%] overflow-hidden rounded-2xl">
        <div className="relative h-full w-full">
          <GiftCardArt art={design.art} />
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-[300px] rounded-2xl border border-line-soft p-4 text-left">
        <Row label="Amount" value={formatPrice(order.amountCents)} />
        <Row
          label="Delivery"
          value={
            order.method === "email" ? "Email" : order.method === "text" ? "Text" : "To you first"
          }
        />
        {order.recipientName.trim() ? (
          <Row label="For" value={order.recipientName.trim()} />
        ) : null}
        <div className="mt-1 border-t border-line pt-2">
          <Row label="Total" value={formatPrice(totalCents)} strong />
        </div>
      </div>

      {/* Said plainly rather than buried: telling somebody their gift is on
          its way when it hasn't been paid for is the failure this screen has
          to avoid. */}
      <p className="m-0 mx-auto mt-5 max-w-xs text-[12px] leading-[1.6] text-quiet">
        {paid
          ? "A receipt is on its way to you."
          : "We\u2019ll email you a payment link \u2014 the card goes out as soon as it\u2019s paid."}
      </p>

      <ButtonLink href="/gift" className="mt-6 w-full max-w-[280px]">
        Send another
      </ButtonLink>
      <Link
        href="/shop"
        className="cb-press mt-4 block cursor-pointer text-[14px] text-muted underline hover:text-ink"
      >
        Back to the menu
      </Link>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className={strong ? "text-[15px] font-medium text-ink" : "text-[14px] text-muted"}>
        {label}
      </span>
      <span className={strong ? "text-[15px] font-medium text-ink" : "text-[14px] text-ink"}>
        {value}
      </span>
    </div>
  );
}

function Block({
  title,
  required,
  children,
}: {
  title: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <h2 className="m-0 mb-2.5 text-[14px] font-medium text-ink">
        {required ? <span className="text-brand-red">* </span> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: "text" | "email" | "tel";
  error?: string | null;
}) {
  return (
    <div>
      <input
        type={type}
        inputMode={inputMode}
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-xl border bg-surface px-4 py-3 text-[16px] text-ink outline-none transition-colors placeholder:text-quieter focus:border-ink ${
          error ? "border-brand-red" : "border-line-soft"
        }`}
      />
      {error ? (
        <p role="alert" className="m-0 mt-1 text-[12px] text-brand-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
