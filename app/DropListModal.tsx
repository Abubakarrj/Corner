"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// The drop-list signup modal. It lives in the root layout so it can appear over
// any page, blurring whatever is behind it.
//
// It shows once per visitor: whether they join or close it, the outcome is
// written to localStorage and the modal never opens again on that device.

const STORAGE_KEY = "cb-drop-list-v1";

// How long after the page settles the modal appears. Long enough that the
// landing page's logo animation reads first, short enough to still be seen.
const OPEN_DELAY_MS = 1200;

// The legal terms behind the disclosure live on Public Entity's site, not this
// one — both are sections of the same page there. They open in a new tab so
// that reading them doesn't throw away a half-typed number.
const TERMS_HREF = "https://publicentity.co/privacy-policy#terms";
const PRIVACY_HREF = "https://publicentity.co/privacy-policy#privacy";

// Corner Bagel's own privacy page. Nothing in the modal links here anymore, but
// a marketing pop-up over the policy someone is reading is still the wrong
// moment for it, so the modal stays out of the way on that route.
const SUPPRESSED_PATH = "/privacy-policy";

const sansStyle = {
  fontFamily: "var(--font-geist-sans), sans-serif",
} as const;

// (555) 123-4567 — formats as you type, and caps at the 10 digits of a US
// number so the field can never hold something the API would reject on length.
function formatPhone(input: string) {
  const digits = input.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// A valid North American number: neither the area code nor the exchange may
// start with 0 or 1. Same rule the API route enforces server-side.
function isValidPhone(input: string) {
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(input.replace(/\D/g, ""));
}

export default function DropListModal() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const valid = isValidPhone(phone);

  // Closing is final: record it so the modal stays closed on the next visit.
  const close = useCallback((outcome: "dismissed" | "joined") => {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, outcome);
    } catch {
      // Private browsing or blocked storage — the modal simply shows again
      // next time, which is better than failing to close.
    }
  }, []);

  // Open on a timer, but only for a visitor who has not answered it before.
  useEffect(() => {
    if (pathname === SUPPRESSED_PATH) return;

    let answered = false;
    try {
      answered = window.localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      answered = false;
    }
    if (answered) return;

    const timer = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  // While the modal is up: lock the page behind it, focus the field, close on
  // Escape, and keep Tab inside the dialog.
  useEffect(() => {
    if (!open) return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    inputRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close("dismissed");
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || status !== "idle") return;

    setStatus("sending");
    setError(null);

    try {
      const response = await fetch("/api/drop-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Something went wrong.");
      }
      // Signing up dismisses the modal — there is no confirmation step, so the
      // page the visitor came for is handed straight back to them.
      close("joined");
    } catch (submitError) {
      setStatus("idle");
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Something went wrong.",
      );
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/25 p-6 backdrop-blur-md"
      // A click on the backdrop dismisses; clicks inside the card bubble up to
      // here too, so only a hit on the backdrop itself counts.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close("dismissed");
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drop-list-title"
        className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl sm:p-7"
        style={sansStyle}
      >
        <button
          type="button"
          onClick={() => close("dismissed")}
          aria-label="Close"
          className="absolute right-5 top-5 cursor-pointer text-[#575757] transition-opacity hover:opacity-60"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden
          >
            <path
              d="M4 4l12 12M16 4L4 16"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <h2
          id="drop-list-title"
          className="mb-2 pr-8 text-[21px] font-semibold leading-tight text-[#2D2D2D]"
        >
          Join our drop list!
        </h2>
        <p className="mb-4 text-[14px] leading-[145%] text-[#575757]">
          Add your phone number to get a text whenever we do new item drops.
        </p>

        <form onSubmit={onSubmit} noValidate>
          {/* The field's text stays at 16px however much the card tightens:
              anything smaller makes iOS Safari zoom the page on focus. */}
          <div className="flex items-center gap-2 rounded-xl border border-[#E2E2E2] px-3.5 py-2.5 focus-within:border-[#2D2D2D]">
            <span className="shrink-0 text-[16px] text-[#2D2D2D]" aria-hidden>
              +1 🇺🇸
            </span>
            <input
              ref={inputRef}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              name="phone"
              aria-label="Phone number"
              placeholder="Phone number"
              value={phone}
              onChange={(event) => {
                setPhone(formatPhone(event.target.value));
                setError(null);
              }}
              className="w-full min-w-0 bg-transparent text-[16px] text-[#2D2D2D] outline-none placeholder:text-[#9A9A9A]"
            />
          </div>

          {error ? (
            <p role="alert" className="mt-2 text-[13px] text-[#B3061F]">
              {error}
            </p>
          ) : null}

          {/* Faded until the number is complete, so the button shows at a
              glance whether there is anything to submit. */}
          <button
            type="submit"
            disabled={!valid || status === "sending"}
            className="mt-3 w-full cursor-pointer rounded-xl bg-[#2D2D2D] py-3 text-[16px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-15 disabled:hover:opacity-15"
          >
            {status === "sending" ? "One sec…" : "Notify me!"}
          </button>
        </form>

        <p className="mt-4 text-[11px] leading-[145%] text-[#8A8A8A]">
          By submitting your information, you agree to receive recurring
          automated marketing messages, updates, and announcements from Corner
          Bagel, a Public Entity Holdings company, at the contact information you
          provide. By signing up, you also agree to our{" "}
          <a
            href={TERMS_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href={PRIVACY_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Privacy Policy
          </a>
          . Wireless carriers are not liable for delayed or undelivered messages.
          Message and data rates may apply. Reply STOP to unsubscribe or HELP for
          assistance. For support, email{" "}
          <a href="mailto:support@publicentity.co" className="underline">
            support@publicentity.co
          </a>
          . Text STOP at any time to opt out of all SMS communications.
        </p>
      </div>
    </div>
  );
}
