"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// A catering inquiry form. Kept as its own page (not a modal, like the
// drop-list signup) since it's a destination someone navigates to
// deliberately from the homepage menu, not an interruption.

const BRAND_RED = "#BE1923";

const sansStyle = {
  fontFamily: "var(--font-geist-sans), sans-serif",
} as const;

// Matches HONEYPOT_FIELD in app/api/catering/route.ts.
const HONEYPOT_FIELD = "company";

const inputClass =
  "w-full min-w-0 bg-transparent text-[16px] text-[#2D2D2D] outline-none placeholder:text-[#9A9A9A]";
const fieldWrapClass =
  "flex items-center gap-2 rounded-xl border border-[#E2E2E2] px-4 py-3 focus-within:border-[#2D2D2D]";

export default function CateringPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const honeypotRef = useRef<HTMLInputElement>(null);
  // When the page became interactive, so the server can reject a submit
  // that arrives faster than a human could plausibly fill the form.
  const openedAtRef = useRef(0);
  useEffect(() => {
    openedAtRef.current = Date.now();
  }, []);

  const valid =
    name.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    eventDate.trim().length > 0 &&
    guestCount.trim().length > 0;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || status !== "idle") return;

    setStatus("sending");
    setError(null);

    try {
      const response = await fetch("/api/catering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          eventDate,
          guestCount,
          details,
          [HONEYPOT_FIELD]: honeypotRef.current?.value ?? "",
          elapsed_ms: Date.now() - openedAtRef.current,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Something went wrong.");
      }
      setStatus("sent");
    } catch (submitError) {
      setStatus("idle");
      setError(
        submitError instanceof Error ? submitError.message : "Something went wrong.",
      );
    }
  }

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-white px-6 py-12 sm:py-16">
      <div className="w-full max-w-md" style={sansStyle}>
        <h1
          className="mb-2 text-[24px] font-bold leading-tight text-[#2D2D2D]"
          style={{ letterSpacing: "-0.03em" }}
        >
          Catering
        </h1>

        {status === "sent" ? (
          <>
            <p className="mb-4 text-[14px] leading-[145%] text-[#575757]">
              Got it — thanks for the details. We&rsquo;ll be in touch shortly to
              talk through your event.
            </p>
            <Link
              href="/"
              className="inline-block cursor-pointer text-[13px] text-[#575757] underline transition-opacity hover:opacity-70"
            >
              Back home
            </Link>
          </>
        ) : (
          <>
            <p className="mb-6 text-[14px] leading-[145%] text-[#575757]">
              Tell us about your event and we&rsquo;ll get back to you with options
              and pricing.
            </p>

            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
              <input
                ref={honeypotRef}
                type="text"
                name={HONEYPOT_FIELD}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
              />

              <div className={fieldWrapClass}>
                <input
                  type="text"
                  autoComplete="name"
                  aria-label="Name"
                  placeholder="Name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                  className={inputClass}
                />
              </div>

              <div className={fieldWrapClass}>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  aria-label="Email address"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  className={inputClass}
                />
              </div>

              <div className={fieldWrapClass}>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-label="Phone number (optional)"
                  placeholder="Phone (optional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="flex gap-3">
                <div className={`${fieldWrapClass} flex-1`}>
                  <input
                    type="date"
                    aria-label="Event date"
                    value={eventDate}
                    onChange={(e) => {
                      setEventDate(e.target.value);
                      setError(null);
                    }}
                    className={inputClass}
                  />
                </div>
                <div className={`${fieldWrapClass} w-28`}>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    aria-label="Number of guests"
                    placeholder="Guests"
                    value={guestCount}
                    onChange={(e) => {
                      setGuestCount(e.target.value);
                      setError(null);
                    }}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className={fieldWrapClass}>
                <textarea
                  aria-label="Event details (optional)"
                  placeholder="Tell us about the event (optional)"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={3}
                  className={`${inputClass} resize-none`}
                />
              </div>

              {error ? (
                <p role="alert" style={{ color: BRAND_RED }} className="text-[12px]">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={!valid || status === "sending"}
                style={{ backgroundColor: BRAND_RED }}
                className="mt-1 w-full cursor-pointer rounded-xl py-3 text-[16px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-15 disabled:hover:opacity-15"
              >
                {status === "sending" ? "Sending…" : "Send inquiry"}
              </button>

              <Link
                href="/"
                className="mx-auto mt-1 inline-block cursor-pointer text-center text-[13px] text-[#575757] underline transition-opacity hover:opacity-70"
              >
                Back home
              </Link>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
