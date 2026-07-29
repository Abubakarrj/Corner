"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// The drop-list signup modal. It lives in the root layout so it can appear over
// any page, blurring whatever is behind it.
//
// It shows once per visitor: whether they join or close it, the outcome is
// written to localStorage and the modal never opens again on that device. The
// privacy policy page is excluded — the modal links there, so popping it over
// the page someone navigated to from the modal would be a loop.

const STORAGE_KEY = "cb-drop-list-v1";

// How long after the page settles the modal appears. Long enough that the
// landing page's logo animation reads first, short enough to still be seen.
const OPEN_DELAY_MS = 1200;

// Corner Bagel has a privacy policy page but no terms of service page yet.
// Point this at the terms route once one exists and the copy below turns it
// into a link automatically; while it is null the words stay plain text rather
// than linking somewhere that 404s.
const TERMS_HREF: string | null = null;

const PRIVACY_HREF = "/privacy-policy";

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
    if (pathname === PRIVACY_HREF) return;

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
        className="relative w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl sm:p-9"
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
          className="mb-3 pr-8 text-[26px] font-semibold leading-tight text-[#2D2D2D]"
        >
          Join our drop list!
        </h2>
        <p className="mb-6 text-[15px] leading-[150%] text-[#575757]">
          Add your phone number to get a text whenever we do new item drops.
        </p>

        <form onSubmit={onSubmit} noValidate>
          <div className="flex items-center gap-2 rounded-xl border border-[#E2E2E2] px-4 py-3 focus-within:border-[#2D2D2D]">
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
            className="mt-4 w-full cursor-pointer rounded-xl bg-[#2D2D2D] py-4 text-[18px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-15 disabled:hover:opacity-15"
          >
            {status === "sending" ? "One sec…" : "Notify me!"}
          </button>
        </form>

        <p className="mt-6 text-[12px] leading-[160%] text-[#8A8A8A]">
          By submitting your information, you agree to receive recurring
          automated marketing messages, updates, and announcements from Corner
          Bagel, a Public Entity Holdings company, at the contact information you
          provide. By signing up, you also agree to our{" "}
          {TERMS_HREF ? (
            <Link href={TERMS_HREF} className="underline">
              Terms of Service
            </Link>
          ) : (
            "Terms of Service"
          )}{" "}
          and{" "}
          <Link href={PRIVACY_HREF} className="underline">
            Privacy Policy
          </Link>
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
