"use client";

import { useId, useState } from "react";

// The small parts checkout is assembled from. They live here rather than
// inline in page.tsx because the page is long enough already, and because a
// section header that differs by two pixels between the fifth and sixth block
// is exactly the drift a checkout picks up as it grows.

export function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line py-6 first:border-t-0 first:pt-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[15px] font-medium text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

// A labelled input. The label sits above rather than inside as a placeholder:
// a placeholder disappears the moment you type, so on a form this long you
// lose track of which box you're in, and a screen reader gets nothing at all
// from a field whose only label vanished.
export function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  inputMode,
  required,
  error,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "numeric";
  required?: boolean;
  error?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[12px] text-muted">
        {label}
        {required ? <span className="text-brand-red"> *</span> : null}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
        // 16px, so iOS doesn't zoom the viewport when the field takes focus.
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

export function Check({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer accent-[var(--cb-ink)]"
      />
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-[14px] text-ink">{label}</span>
        {hint ? <span className="block text-[12px] text-muted">{hint}</span> : null}
      </label>
    </div>
  );
}

// A collapsible block. Used for Order details, which is a summary you want
// available and not in the way — the reference collapses it too.
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="cb-press flex w-full cursor-pointer items-center justify-between gap-3 text-left"
      >
        <span className="text-[14px] text-ink">{summary}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          className="shrink-0 transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted"
          />
        </svg>
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

// One row of the bill. `strong` is the total. `after` rides beside the label —
// the delivery line uses it to say who is driving and to hang the (i) that
// explains the fee, which is the one row on a bill people want a footnote for.
export function Money({
  label,
  amount,
  strong,
  tone,
  after,
}: {
  label: string;
  amount: string;
  strong?: boolean;
  tone?: "credit";
  after?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span
        className={`flex min-w-0 items-center gap-1.5 ${
          strong ? "text-[15px] font-medium text-ink" : "text-[14px] text-muted"
        }`}
      >
        <span className="truncate">{label}</span>
        {after}
      </span>
      <span
        className={
          strong
            ? "text-[15px] font-medium text-ink"
            : tone === "credit"
              ? "text-[14px] text-ink"
              : "text-[14px] text-ink"
        }
      >
        {amount}
      </span>
    </div>
  );
}
