"use client";

import { useState, useSyncExternalStore } from "react";
import { COOKIE_CONSENT_CHANGED_EVENT } from "../CookieConsent";

const BRAND_RED = "#BE1923";

// Must match STORAGE_KEY in app/CookieConsent.tsx. The cookie banner is a
// full-width bar docked to the same bottom-right corner this widget lives
// in, at a higher z-index — without this, its button is unreachable behind
// the banner until it's dismissed. Reading the same key (rather than
// importing that component's internals, since the two live in different
// layouts) is a small duplication in exchange for not coupling this
// shop-only widget to a site-wide component.
const COOKIE_CONSENT_KEY = "cb-cookie-consent-v1";

function cookieBannerVisible(): boolean {
  try {
    return window.localStorage.getItem(COOKIE_CONSENT_KEY) === null;
  } catch {
    return true;
  }
}
// CookieConsent's own acknowledge() sets localStorage then dispatches this
// event — a plain localStorage write doesn't fire a "storage" event in the
// same document that made it, so there'd otherwise be nothing to
// re-render this on.
function subscribeCookieBanner(callback: () => void) {
  window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, callback);
  return () => window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, callback);
}
function getCookieBannerServerSnapshot() {
  return false;
}

function ChatBubbleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5v-8Z"
        stroke="white"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// A placeholder chat widget — no live agent behind it yet. Leaving a message
// here logs it (same "log now, wire the real vendor later" pattern as the
// signup/catering/order forms) instead of reaching anyone in real time. Swap
// this whole component for a real provider's embed (Intercom, Gorgias,
// Zendesk, ...) once one is chosen.
export default function ChatWidget() {
  const bannerVisible = useSyncExternalStore(
    subscribeCookieBanner,
    cookieBannerVisible,
    getCookieBannerServerSnapshot,
  );
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const valid =
    name.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    message.trim().length > 0;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || status !== "idle") return;

    setStatus("sending");
    setError(null);

    try {
      const response = await fetch("/api/shop-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
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
    <div
      className={`fixed right-5 z-[150] flex flex-col items-end transition-[bottom] duration-200 sm:right-6 ${
        // Clears the cookie banner's measured height (~120px mobile, ~69px
        // desktop) plus a gap, while it's up; settles into the corner once
        // it's dismissed.
        bannerVisible ? "bottom-[136px] sm:bottom-24" : "bottom-5 sm:bottom-6"
      }`}
      style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
    >
      {open ? (
        <div className="mb-3 w-[calc(100vw-2.5rem)] max-w-[320px] overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.2)]">
          <div
            style={{ backgroundColor: BRAND_RED }}
            className="flex items-center justify-between px-4 py-3"
          >
            <span className="text-[14px] font-bold text-white">Chat</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="cursor-pointer text-white transition-opacity hover:opacity-70"
            >
              ✕
            </button>
          </div>

          <div className="p-4">
            {status === "sent" ? (
              <p className="text-[13px] text-[#575757]">
                Thanks — we&rsquo;ll email you back shortly.
              </p>
            ) : (
              <>
                <p className="mb-3 text-[13px] text-[#575757]">
                  Leave a message and we&rsquo;ll email you back.
                </p>
                <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
                  <input
                    type="text"
                    aria-label="Name"
                    placeholder="Name"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setError(null);
                    }}
                    className="rounded-lg border border-[#E2E2E2] px-3 py-2 text-[13px] text-[#2D2D2D] outline-none placeholder:text-[#9A9A9A] focus:border-[#2D2D2D]"
                  />
                  <input
                    type="email"
                    inputMode="email"
                    aria-label="Email address"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    className="rounded-lg border border-[#E2E2E2] px-3 py-2 text-[13px] text-[#2D2D2D] outline-none placeholder:text-[#9A9A9A] focus:border-[#2D2D2D]"
                  />
                  <textarea
                    aria-label="Message"
                    placeholder="How can we help?"
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value);
                      setError(null);
                    }}
                    rows={3}
                    className="resize-none rounded-lg border border-[#E2E2E2] px-3 py-2 text-[13px] text-[#2D2D2D] outline-none placeholder:text-[#9A9A9A] focus:border-[#2D2D2D]"
                  />

                  {error ? (
                    <p role="alert" style={{ color: BRAND_RED }} className="text-[11px]">
                      {error}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={!valid || status === "sending"}
                    style={{ backgroundColor: BRAND_RED }}
                    className="mt-1 cursor-pointer rounded-lg py-2 text-[13px] font-bold uppercase tracking-[0.04em] text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-30"
                  >
                    {status === "sending" ? "Sending…" : "Send"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close chat" : "Open chat"}
        aria-expanded={open}
        style={{ backgroundColor: BRAND_RED }}
        className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.25)] transition-opacity hover:opacity-90"
      >
        <ChatBubbleIcon />
      </button>
    </div>
  );
}
