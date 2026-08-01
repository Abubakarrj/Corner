"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { COOKIE_CONSENT_CHANGED_EVENT } from "../CookieConsent";

// Produce palette — deep olive carries the widget, sage is the visitor's
// bubble, and the old brand red survives only as the error-text colour.
const OLIVE = "#3E4A30";
const SAGE = "#B7C9A2";
const ERROR_RED = "#BE1923";

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

// The minimal square speech bubble from the user's reference — clean
// outline, tail at the bottom-left, no dots.
function ChatBubbleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 6A1.5 1.5 0 0 1 6.5 4.5h11A1.5 1.5 0 0 1 19 6v7.5a1.5 1.5 0 0 1-1.5 1.5H8.8L5 18.6V6Z"
        stroke="white"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
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

function SendArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BagelAvatar() {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#E7E2D2] bg-white">
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
  "w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-[#EFEBDD] px-3.5 py-2.5 text-[13px] leading-[1.45] text-[#3E4A30]";
const userBubbleClass =
  "w-fit max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-[13px] leading-[1.45] text-[#2F3A24]";

const contactFieldClass =
  "rounded-xl border border-[#DDD6C2] px-3.5 py-2.5 text-[16px] text-[#3E4A30] outline-none placeholder:text-[#9A9A9A] focus:border-[#3E4A30] sm:text-[14px]";

type Entry = { id: number; role: "bot" | "user"; text: string };

// A placeholder chat widget — no live agent behind it yet. Leaving a message
// here logs it (same "log now, wire the real vendor later" pattern as the
// signup/catering/order forms) instead of reaching anyone in real time. Swap
// this whole component for a real provider's embed (Intercom, Gorgias,
// Zendesk, ...) once one is chosen.
//
// The flow copies the concierge widget the user referenced: greeting +
// quick-reply topics, an automated follow-up asking for details, a
// "Type a message…" composer pinned at the bottom, and — since there's no
// live agent to answer — one extra automated step that collects name/email
// so the reply can actually reach the visitor.
export default function ChatWidget() {
  const bannerVisible = useSyncExternalStore(
    subscribeCookieBanner,
    cookieBannerVisible,
    getCookieBannerServerSnapshot,
  );
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [askedContact, setAskedContact] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [entries, askedContact, status, open]);

  function push(role: Entry["role"], text: string) {
    setEntries((prior) => [...prior, { id: nextId.current++, role, text }]);
  }

  function pickTopic(option: string) {
    setTopic(option);
    push("user", option);
    // 1:1 with the reference concierge's automated follow-up.
    push("bot", "Do you have any additional details to share to help us assist you?");
  }

  const typedMessages = entries.filter((entry) => entry.role === "user" && entry.text !== topic);

  function sendDraft() {
    const text = draft.trim();
    if (!text || status === "sent") return;
    push("user", text);
    setDraft("");
    if (!askedContact) {
      push("bot", "Got it — where should we email our reply?");
      setAskedContact(true);
    }
  }

  const contactValid =
    name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function submitContact(event: React.FormEvent) {
    event.preventDefault();
    if (!contactValid || status !== "idle") return;

    setStatus("sending");
    setError(null);

    try {
      const response = await fetch("/api/shop-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          message: typedMessages.map((entry) => entry.text).join("\n"),
          topic,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Something went wrong.");
      }
      setStatus("sent");
      push("bot", "Thanks — message received. We'll email you back shortly.");
    } catch (submitError) {
      setStatus("idle");
      setError(
        submitError instanceof Error ? submitError.message : "Something went wrong.",
      );
    }
  }

  function resetThread() {
    setEntries([]);
    setTopic(null);
    setDraft("");
    setAskedContact(false);
    setStatus("idle");
    setError(null);
  }

  const showChips = topic === null && typedMessages.length === 0 && status === "idle";

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
        className={`mb-3 flex w-[calc(100vw-2.5rem)] max-w-[350px] origin-bottom-right flex-col overflow-hidden rounded-2xl bg-white shadow-[0_12px_40px_rgba(0,0,0,0.18)] transition-all duration-200 ease-out ${
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-2 scale-95 opacity-0"
        }`}
      >
        <div
          style={{ backgroundColor: OLIVE }}
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
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
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

        {/* The thread. Bot messages on the left, the visitor's replies on
            the right, newest kept in view. */}
        <div ref={threadRef} className="max-h-[50vh] overflow-y-auto p-4">
          <p
            className="mb-1.5 ml-9 text-[11px] font-bold text-[#8A8672]"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
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

          {showChips ? (
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {TOPICS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => pickTopic(option)}
                  className="cursor-pointer rounded-full border border-[#DDD6C2] px-3.5 py-2 text-[13px] text-[#3E4A30] transition-colors hover:border-[#3E4A30] hover:bg-[#EFEBDD]"
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}

          {entries.map((entry) =>
            entry.role === "user" ? (
              <div key={entry.id} className="mt-3 flex justify-end">
                <span
                  style={{ backgroundColor: SAGE }}
                  className={userBubbleClass}
                >
                  {entry.text}
                </span>
              </div>
            ) : (
              <div key={entry.id} className="mt-3">
                <div className="flex items-end gap-2">
                  <BagelAvatar />
                  <p className={botBubbleClass}>{entry.text}</p>
                </div>
                <p className="ml-9 mt-1 text-[11px] text-[#9A9A9A]">Automated</p>
              </div>
            ),
          )}

          {askedContact && status !== "sent" ? (
            <form
              onSubmit={submitContact}
              noValidate
              className="ml-9 mt-3 flex flex-col gap-2.5 rounded-2xl border border-[#E7E2D2] p-3"
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
                className={contactFieldClass}
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
                className={contactFieldClass}
              />
              {error ? (
                <p role="alert" style={{ color: ERROR_RED }} className="text-[11px]">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={!contactValid || status === "sending"}
                style={{ backgroundColor: OLIVE }}
                className="cursor-pointer rounded-xl py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-30 disabled:hover:opacity-30"
              >
                {status === "sending" ? "Sending…" : "Send message"}
              </button>
            </form>
          ) : null}

          {status === "sent" ? (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={resetThread}
                className="cursor-pointer text-[12px] text-[#575757] underline transition-opacity hover:opacity-70"
              >
                Send another message
              </button>
            </div>
          ) : null}
        </div>

        {/* The composer, pinned under the thread like the reference —
            free-typing works alongside (or instead of) the topic buttons. */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            sendDraft();
          }}
          className="flex items-center gap-2 border-t border-[#E7E2D2] p-3"
        >
          <input
            type="text"
            aria-label="Type a message"
            placeholder={status === "sent" ? "Message sent" : "Type a message…"}
            value={draft}
            disabled={status === "sent"}
            onChange={(e) => setDraft(e.target.value)}
            className="min-w-0 flex-1 rounded-full border border-[#DDD6C2] px-4 py-2.5 text-[16px] text-[#3E4A30] outline-none placeholder:text-[#9A9A9A] focus:border-[#3E4A30] disabled:bg-[#FAF8F0] sm:text-[14px]"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={draft.trim().length === 0 || status === "sent"}
            style={{ backgroundColor: OLIVE }}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-30 disabled:hover:opacity-30"
          >
            <SendArrowIcon />
          </button>
        </form>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close chat" : "Open chat"}
        aria-expanded={open}
        // Deep olive launcher — same glyph as before, recoloured with the
        // rest of the widget for the produce palette.
        style={{ backgroundColor: OLIVE }}
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
