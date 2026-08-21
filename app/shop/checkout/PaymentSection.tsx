"use client";

// Payment: how you're paying, and the card if that's how.
//
// The card fields are real inputs, and the number they collect stays in the
// browser. That is the whole design, and it's worth being precise about why,
// because the two obvious ways to build this screen are both wrong.
//
// Rebuilding a card form and posting the number with the order would look
// exactly like this and be a different thing entirely: a live PAN in the
// request body, in whatever logs request bodies, and in any error report that
// captures one — and whoever deploys it inside PCI DSS scope. Not building
// the fields at all, which is what this file used to do, means a checkout
// that doesn't look like a checkout.
//
// So: the fields are here, they validate properly, and the only thing that
// crosses the network is a brand and four digits. See the note at the top of
// card.ts, which is also where the one function lives that changes when
// Toast's hosted element is wired up.

import { useServerText, useT } from "../../i18n";
import { formatPrice } from "../products";
import ApplePayButton from "./ApplePayButton";
import CardFields from "./CardFields";
import type { ApplePayEntry } from "./useApplePay";
import type { SquareCardEntry } from "./useSquareCard";
import type { CardEntry } from "./useCard";

import type { Tender } from "./tender";

// Re-exported because several surfaces have always imported the tender from
// here. The definition moved to tender.ts so the order endpoint can read it
// too; see the note at the top of that file.
export type { Tender };

/** The half of the checkout engine this component needs to offer a gift card.
 *
 *  Named separately rather than taking the whole Checkout so the chat panel can
 *  leave it out — and so it is obvious from here what this component is allowed
 *  to touch. */
export type GiftEntry = {
  giftGan: string;
  setGiftGan: (value: string) => void;
  giftBalanceCents: number | null;
  giftAppliedCents: number;
  dueNowCents: number;
  giftError: string | null;
  giftChecking: boolean;
  applyGift: () => void;
  clearGift: () => void;
};

export default function PaymentSection({
  tender,
  onTender,
  cardEnabled,
  card,
  hosted,
  wallet,
  onWalletPay,
  gift,
}: {
  tender: Tender;
  onTender: (next: Tender) => void;
  // Whether this deployment can take a card at all. Passed in rather than read
  // here so the surface decides, and so a shop with no processor offers no
  // card rather than collecting a number it can't charge.
  cardEnabled: boolean;
  card: CardEntry;
  /** Square's hosted fields, when this shop charges cards. Threaded through
   *  rather than read here for the same reason `cardEnabled` is: the surface
   *  owns the checkout engine, and this component renders what it is given. */
  hosted?: SquareCardEntry;
  /** Apple Pay, when this browser can offer it.
   *
   *  ⚠️ Absent or unavailable means the option is not rendered at all, rather
   *  than rendered disabled like the card one above. A greyed-out card tender
   *  says something true and actionable — this shop has no processor — while a
   *  greyed-out Apple Pay would be telling somebody on Android about a wallet
   *  they cannot install. */
  wallet?: ApplePayEntry;
  /** Place the order through Apple's sheet. Passed rather than called from
   *  here because it is the surface that owns submitting, and because this has
   *  to run inside the tap: Safari opens the sheet from a user gesture and
   *  nothing may be awaited on the way. */
  onWalletPay?: () => void;
  /** A gift card against this order. Absent on a surface that does not offer
   *  one — the chat panel shares this component and has no room for it. */
  gift?: GiftEntry;
}) {
  const t = useT();
  const covered = gift ? gift.dueNowCents === 0 && gift.giftAppliedCents > 0 : false;
  return (
    <div className="flex flex-col gap-2">
      {/* Above the tenders, deliberately. What a card covers changes which
          tender is even needed — a card that pays for everything means there is
          nothing to choose — so asking about it after the choice is asking in
          the wrong order. */}
      {gift ? <GiftCard gift={gift} covered={covered} /> : null}

      <Option
        id="counter"
        checked={tender === "counter"}
        onSelect={() => onTender("counter")}
        label={t("checkout.tenderCounter")}
        hint={t("checkout.tenderCounterHint")}
      />

      <Option
        id="card"
        checked={tender === "card"}
        onSelect={() => onTender("card")}
        disabled={!cardEnabled}
        label={t("checkout.tenderCard")}
        hint={t("checkout.tenderCardHint")}
      />

      {/* ⚠️ Only when the wallet is really there. See the note on the prop:
          this option is absent rather than disabled, because a browser that
          cannot do Apple Pay usually cannot be made to. */}
      {wallet?.available && cardEnabled ? (
        <Option
          id="wallet"
          checked={tender === "wallet"}
          onSelect={() => onTender("wallet")}
          label={t("checkout.tenderWallet")}
          hint={t("checkout.tenderWalletHint")}
        />
      ) : null}

      {/* ⚠️ No card fields when there is nothing left to charge. Showing an
          empty card box under "the gift card covers this" is asking somebody to
          pay twice, and the engine will not tokenize it anyway. */}
      {tender === "card" && cardEnabled && !covered ? (
        <div className="mt-1">
          <CardFields card={card} hosted={hosted} />
        </div>
      ) : null}

      {/* Apple's button, in place of the card fields, for the same reason they
          are there: it is what this tender needs on screen to be used.

          ⚠️ It is also the submit. Apple requires their button to be the thing
          that opens the sheet, so the surface hides its own Place order while
          this tender is chosen — one button, and it is this one. Hidden when a
          gift card covers the bill, because then there is nothing to
          authorise. */}
      {tender === "wallet" && wallet?.available && !covered && onWalletPay ? (
        <div className="mt-1">
          <ApplePayButton onPress={onWalletPay} />
        </div>
      ) : null}
    </div>
  );
}

/** What a gift card is worth against this order.
 *
 *  ⚠️ The number is typed here and goes to the server with the order. It is not
 *  saved, not autofilled, and not restored — see the note in useCheckout.ts.
 *  Treat it like cash. */
function GiftCard({ gift, covered }: { gift: GiftEntry; covered: boolean }) {
  const t = useT();
  const st = useServerText();
  const applied = gift.giftBalanceCents !== null;

  if (applied) {
    return (
      <div className="mb-1 rounded-xl border border-line-soft bg-surface px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px] text-ink">
            {t("checkout.giftApplied", { amount: formatPrice(gift.giftAppliedCents) })}
          </span>
          <button
            type="button"
            onClick={gift.clearGift}
            className="cb-tap cb-press cursor-pointer text-[13px] text-muted underline hover:text-ink"
          >
            {t("common.remove")}
          </button>
        </div>
        {/* Said plainly either way. "Nothing left to pay" is the whole reason
            the card fields disappeared, and somebody who is not told that is
            somebody looking for where the card box went. */}
        <p className="m-0 mt-1 text-[12px] leading-[1.5] text-muted">
          {covered
            ? t("checkout.giftCoversAll")
            : t("checkout.giftLeavesDue", { amount: formatPrice(gift.dueNowCents) })}
        </p>
      </div>
    );
  }

  return (
    <div className="mb-1">
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          // ⚠️ Off. A card number remembered by a shared browser is a card
          // somebody else can spend.
          autoComplete="off"
          aria-label={t("checkout.giftCardNumber")}
          placeholder={t("checkout.giftCardNumber")}
          value={gift.giftGan}
          onChange={(event) => gift.setGiftGan(event.target.value)}
          aria-invalid={gift.giftError ? true : undefined}
          className={`min-w-0 flex-1 rounded-xl border bg-surface px-4 py-3 text-[16px] tracking-[0.04em] text-ink outline-none transition-colors placeholder:text-quieter focus:border-ink ${
            gift.giftError ? "border-brand-red" : "border-line-soft"
          }`}
        />
        <button
          type="button"
          onClick={gift.applyGift}
          disabled={gift.giftGan.replace(/\D/g, "").length < 8 || gift.giftChecking}
          className="cb-press shrink-0 cursor-pointer rounded-xl border border-line-soft px-4 text-[14px] text-ink transition-colors hover:border-ink disabled:cursor-default disabled:text-quieter disabled:hover:border-line-soft"
        >
          {gift.giftChecking ? t("gift.checking") : t("checkout.giftApply")}
        </button>
      </div>
      {gift.giftError ? (
        <p role="alert" className="m-0 mt-1 text-[12px] text-brand-red">
          {st(gift.giftError)}
        </p>
      ) : null}
    </div>
  );
}

function Option({
  id,
  checked,
  onSelect,
  label,
  hint,
  disabled,
}: {
  id: string;
  checked: boolean;
  onSelect: () => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={`tender-${id}`}
      className={`flex items-start gap-3 rounded-xl border p-4 transition-colors ${
        disabled
          ? "cursor-not-allowed border-line-faint opacity-70"
          : `cb-press cursor-pointer ${checked ? "border-ink bg-raise" : "border-line-soft hover:border-line-mute"}`
      }`}
    >
      <input
        id={`tender-${id}`}
        type="radio"
        name="tender"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--cb-ink)] disabled:cursor-not-allowed"
      />
      <span className="min-w-0">
        <span className="block text-[14px] text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-[12px] leading-[1.5] text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}
