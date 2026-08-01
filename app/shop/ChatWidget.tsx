"use client";

import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
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

// The quick-reply buttons under "What can we help you with?". Picking one
// stands in for the visitor's first message — it's sent along to the intake
// route as routing metadata, and rendered as their reply bubble in the
// thread.
const TOPICS = [
  "Track my order",
  "Report an issue",
  "Product question",
  "Other",
] as const;

function ChatBubbleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5v-8Z"
        stroke="white"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="9.5" r="1" fill="white" />
      <circle cx="12" cy="9.5" r="1" fill="white" />
      <circle cx="15.5" cy="9.5" r="1" fill="white" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M5 5l10 10M15 5L5 15"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BagelAvatar() {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#F0F0F0] bg-white">
      <Image
        src="/icon.svg"
        alt=""
        width={18}
        height={18}
        unoptimized
        className="object-contain"
      />
    </span>
  );
}

const botBubbleClass =
  "w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-[#F4F4F4] px-3.5 py-2.5 text-[13px] leading-[1.45] text-[#2D2D2D]";

const fieldClass =
  "rounded-xl border border-[#E2E2E2] px-3.5 py-2.5 text-[16px] text-[#2D2D2D] outline-none placeholder:text-[#9A9A9A] focus:border-[#2D2D2D] sm:text-[14px]";

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
  const [topic, setTopic] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

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
        body: JSON.stringify({ name, email, message, topic }),
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

  function resetThread() {
    setTopic(null);
    setMessage("");
    setStatus("idle");
    setError(null);
  }

  return (
    // pointer-events-none on the container: with the panel always mounted
    // for its open/close animation, the container's (invisible) box spans
    // the panel's full footprint even while closed, and would otherwise
    // swallow clicks meant for the page under it. Only the launcher and the
    // open panel opt back in.
    <div
      className={`pointer-events-none fixed right-5 z-[150] flex flex-col items-end transition-[bottom] duration-200 sm:right-6 ${
        // Clears the cookie banner's measured height (~120px mobile, ~69px
        // desktop) plus a gap, while it's up; settles into the corner once
        // it's dismissed.
        bannerVisible ? "bottom-[136px] sm:bottom-24" : "bottom-5 sm:bottom-6"
      }`}
      style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
    >
      {/* Always mounted so it can animate closed as well as open; inert
          keeps focus and clicks out while it's hidden. */}
      <div
        inert={!open}
        role="dialog"
        aria-label="Chat"
        className={`mb-3 w-[calc(100vw-2.5rem)] max-w-[340px] origin-bottom-right overflow-hidden rounded-2xl bg-white shadow-[0_12px_40px_rgba(0,0,0,0.18)] transition-all duration-200 ease-out ${
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-2 scale-95 opacity-0"
        }`}
      >
        <div
          style={{ backgroundColor: BRAND_RED }}
          className="flex items-center gap-3 px-5 py-4"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
            <Image
              src="/icon.svg"
              alt=""
              width={26}
              height={26}
              unoptimized
              className="object-contain"
            />
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="text-[15px] font-bold leading-tight text-white"
              style={{ letterSpacing: "-0.02em" }}
            >
              Corner Bagel
            </p>
            <p className="text-[12px] leading-tight text-white/80">
              We reply by email, usually same day
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close chat"
            className="cursor-pointer transition-opacity hover:opacity-70"
          >
            <CloseIcon />
          </button>
        </div>

        {/* The thread. Bot messages on the left, the visitor's picked topic
            on the right — the quick-reply buttons stand in for typing a
            first message, like the concierge widgets this is modeled on. */}
        <div className="max-h-[55vh] overflow-y-auto p-4">
          <p className="mb-1.5 ml-9 text-[11px] font-bold text-[#8A8A8A]">
            Corner Bagel
          </p>
          <div className="mb-2 ml-9">
            <p className={botBubbleClass}>
              Leave a message and we&rsquo;ll email you back — usually the same
              day.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <BagelAvatar />
            <p className={botBubbleClass}>What can we help you with?</p>
          </div>
          <p className="ml-9 mt-1 text-[11px] text-[#9A9A9A]">Automated</p>

          {topic === null ? (
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {TOPICS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTopic(option)}
                  className="cursor-pointer rounded-xl border border-[#D9D9D9] px-3.5 py-2 text-[13px] text-[#2D2D2D] transition-colors hover:border-[#BE1923] hover:text-[#BE1923]"
                >
                  {option}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="mt-4 flex justify-end">
                <span
                  style={{ backgroundColor: BRAND_RED }}
                  className="w-fit max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-[13px] leading-[1.45] text-white"
                >
                  {topic}
                </span>
              </div>

              {status === "sent" ? (
                <>
                  <div className="mt-3 flex items-end gap-2">
                    <BagelAvatar />
                    <p className={botBubbleClass}>
                      Thanks — message received. We&rsquo;ll email you back
                      shortly.
                    </p>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={resetThread}
                      className="cursor-pointer text-[12px] text-[#575757] underline transition-opacity hover:opacity-70"
                    >
                      Send another message
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setTopic(null)}
                      className="cursor-pointer text-[11px] text-[#8A8A8A] underline transition-opacity hover:opacity-70"
                    >
                      Change topic
                    </button>
                  </div>

                  <form
                    onSubmit={onSubmit}
                    noValidate
                    className="mt-3 flex flex-col gap-2.5"
                  >
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
                      className={fieldClass}
                    />
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      aria-label="Email address"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError(null);
                      }}
                      className={fieldClass}
                    />
                    <textarea
                      aria-label="Message"
                      placeholder="Tell us a little more…"
                      value={message}
                      onChange={(e) => {
                        setMessage(e.target.value);
                        setError(null);
                      }}
                      rows={3}
                      className={`resize-none ${fieldClass}`}
                    />

                    {error ? (
                      <p
                        role="alert"
                        style={{ color: BRAND_RED }}
                        className="text-[11px]"
                      >
                        {error}
                      </p>
                    ) : null}

                    <button
                      type="submit"
                      disabled={!valid || status === "sending"}
                      style={{ backgroundColor: BRAND_RED }}
                      className="mt-0.5 cursor-pointer rounded-xl py-2.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-30 disabled:hover:opacity-30"
                    >
                      {status === "sending" ? "Sending…" : "Send message"}
                    </button>
                  </form>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close chat" : "Open chat"}
        aria-expanded={open}
        style={{ backgroundColor: BRAND_RED }}
        className="pointer-events-auto relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.25)] transition-transform hover:scale-105"
      >
        {/* The two glyphs crossfade and quarter-turn into each other, so the
            launcher visibly becomes the close control rather than jumping. */}
        <span
          aria-hidden
          className={`absolute transition-all duration-200 ${
            open ? "rotate-90 opacity-0" : "rotate-0 opacity-100"
          }`}
        >
          <ChatBubbleIcon />
        </span>
        <span
          aria-hidden
          className={`absolute transition-all duration-200 ${
            open ? "rotate-0 opacity-100" : "-rotate-90 opacity-0"
          }`}
        >
          <CloseIcon />
        </span>
      </button>
    </div>
  );
}
