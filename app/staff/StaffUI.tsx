"use client";

import { useId } from "react";

// The handful of controls the staff screens share.
//
// ——— Why these are not the shop's components ———
//
// Button and ButtonLink are, and are imported directly. These two are not,
// because the shop's Field lives in app/shop/checkout and importing across
// that boundary would drag the checkout module — cart context and all — into
// a screen that has nothing to do with a basket. They are twenty lines each
// and a copy is cheaper than the coupling.
//
// ——— Why these screens are not translated ———
//
// Everything a customer sees exists in ten languages. This does not, and that
// is a decision rather than an omission. The staff screens are read by the
// people whose accounts are listed in one config value — a group we know the
// size of — and the same reasoning already applied to the printed job
// application holds here: a purchase order that changes language between the
// screen and the PDF and the supplier's inbox is one nobody can check.

export function StaffField({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  hint,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  hint?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12px] text-muted">
        {label}
      </label>
      <input
        {...rest}
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        // 16px, so iOS doesn't zoom the viewport when the field takes focus.
        className="w-full rounded-xl border border-line-soft bg-surface px-4 py-3 text-[16px] text-ink outline-none transition-colors placeholder:text-quieter focus:border-ink"
      />
      {hint ? <p className="m-0 mt-1 text-[12px] text-quiet">{hint}</p> : null}
    </div>
  );
}

/** A message that is the result of pressing something: an error, or a
 *  confirmation. role="alert" either way, because in both cases something the
 *  person did has an outcome they need to hear about. */
export function Notice({ tone, children }: { tone: "bad" | "good"; children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className={`m-0 rounded-xl px-4 py-3 text-[13px] ${
        tone === "bad" ? "bg-raise text-brand-red" : "bg-good text-ink"
      }`}
    >
      {children}
    </p>
  );
}
