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
import { SHOP_PHONE } from "../../shopFacts";
import { formatPrice } from "../products";
import CardFields from "./CardFields";
import WalletButtons from "./WalletButtons";
import type { WalletEntry } from "./useSquareWallet";
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
  cardEnabled,
  card,
  hosted,
  apple,
  google,
  onWalletPay,
  gift,
}: {
  // Whether this deployment can take a card at all. Passed in rather than read
  // here so the surface decides, and so a shop with no processor offers no
  // card rather than collecting a number it can't charge.
  cardEnabled: boolean;
  card: CardEntry;
  /** Square's hosted fields, when this shop charges cards. Threaded through
   *  rather than read here for the same reason `cardEnabled` is: the surface
   *  owns the checkout engine, and this component renders what it is given. */
  hosted?: SquareCardEntry;
  /** The two wallets, each available only where its browser can offer it.
   *
   *  ⚠️ Nothing is rendered disabled here. A greyed-out Apple Pay would be
   *  telling somebody on Android about a wallet they cannot install; absent is
   *  the honest state. */
  apple?: WalletEntry;
  google?: WalletEntry;
  /** Place the order through whichever wallet was tapped. Passed rather than
   *  called from here because the surface owns submitting, and because it has
   *  to run inside the tap: the sheets open from a user gesture and nothing
   *  may be awaited on the way. */
  onWalletPay?: (via: "apple" | "google") => void;
  /** A gift card against this order. Absent on a surface that does not offer
   *  one — the chat panel shares this component and has no room for it. */
  gift?: GiftEntry;
}) {
  const t = useT();
  const covered = gift ? gift.dueNowCents === 0 && gift.giftAppliedCents > 0 : false;
  return (
    <div className="flex flex-col gap-3">
      {/* Above the payment, because what a gift card covers changes whether
          there is anything left to pay for. Asking after is asking in the
          wrong order. */}
      {gift ? <GiftCard gift={gift} covered={covered} /> : null}

      {/* ——— ⚠️ No choice here, because there is not one ———

          This was two radios: pay at the window, or pay now. Paying at the
          window is gone, and the honest shape for one option is no radio at
          all. A single selected radio is a control nobody can operate and a
          decision already made, drawn as though it were open — and it costs a
          tap on the way to the only thing that works.

          What is left is one payment: a wallet if the browser has one, the
          card fields if not, the same charge either way.

          ⚠️ Nothing at all when a gift card covers the bill. An empty card box
          under "the gift card covers this" is asking somebody to pay twice, and
          the engine will not tokenize it. The wallets go with it — a sheet for
          nothing. */}
      {cardEnabled && !covered ? (
        <div className="flex flex-col">
          {apple && google && onWalletPay ? (
            <WalletButtons
              appleReady={apple.available}
              googleReady={google.available}
              googleAttach={google.attach}
              onPay={onWalletPay}
            />
          ) : null}
          <CardFields card={card} hosted={hosted} />
          {/* When the money moves. It was the hint under a radio; with the
              radio gone it belongs to the block. */}
          <p className="m-0 mt-2 text-[11px] text-quiet">{t("checkout.chargedOnPlace")}</p>
        </div>
      ) : null}

      {/* ⚠️ The state the window used to cover: no processor. With two tenders
          an order still settled in person; with one there is no way to pay at
          all, so this says so and gives the phone number rather than drawing a
          form that cannot work. */}
      {!cardEnabled ? (
        <p role="status" className="m-0 text-[13px] leading-[1.5] text-brand-red">
          {t("checkout.paymentsOff", { phone: SHOP_PHONE })}
        </p>
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

