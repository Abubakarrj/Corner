"use client";

// Payment.
//
// The reference checkout has card fields on it. Those fields belong to Toast:
// they're rendered inside Toast's own hosted payment element, so the number
// goes from the browser straight to Toast's PCI environment and the
// restaurant's site never touches it.
//
// Rebuilding them here as ordinary <input>s would look identical and be a
// different thing entirely — a live card number sitting in this page's memory,
// in the request body, in whatever logs that body, and in any error report
// that captures it. It would also put whoever deploys this into PCI DSS scope
// for a form that doesn't charge anyone. So this section offers the tender the
// shop actually takes today, and names the one it doesn't yet.
//
// Wiring up card payment is: mount Toast's payment element in the slot below,
// take the token it hands back, and send that token — never a PAN — to
// /api/shop-order. See app/toast.ts.

export type Tender = "counter" | "card";

export default function PaymentSection({
  tender,
  onTender,
  cardEnabled,
}: {
  tender: Tender;
  onTender: (next: Tender) => void;
  // True once Toast's payment element is configured and mounted. Passed in
  // rather than read here so the page decides, and so this component has an
  // honest "on" state to grow into instead of a permanent apology.
  cardEnabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Option
        id="counter"
        checked={tender === "counter"}
        onSelect={() => onTender("counter")}
        label="Pay at the window"
        hint="We'll have it ready. Card, Apple Pay, Google Pay or cash when you collect."
      />

      <Option
        id="card"
        checked={tender === "card"}
        onSelect={() => onTender("card")}
        disabled={!cardEnabled}
        label="Pay now by card"
        hint="Charged when the shop confirms your order."
      />

      {tender === "card" && cardEnabled ? (
        // Toast's payment element mounts here. Deliberately empty otherwise:
        // an input that looks like a card field but isn't one is worse than
        // no field at all.
        <div id="toast-payment-element" className="mt-2 rounded-xl border border-line-soft p-4" />
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
