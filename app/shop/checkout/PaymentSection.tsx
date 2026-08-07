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

import { useT } from "../../i18n";
import CardFields from "./CardFields";
import type { CardEntry } from "./useCard";

export type Tender = "counter" | "card";

export default function PaymentSection({
  tender,
  onTender,
  cardEnabled,
  card,
}: {
  tender: Tender;
  onTender: (next: Tender) => void;
  // Whether this deployment can take a card at all. Passed in rather than read
  // here so the surface decides, and so a shop with no processor offers no
  // card rather than collecting a number it can't charge.
  cardEnabled: boolean;
  card: CardEntry;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2">
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

      {tender === "card" && cardEnabled ? (
        <div className="mt-1">
          <CardFields card={card} />
        </div>
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
