"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { COOKIE_CONSENT_CHANGED_EVENT } from "../CookieConsent";
import { describeFulfillment, useFulfillment, type Fulfillment } from "../fulfillment";
import { DISPLAY_FONT } from "./shopControls";

// One line naming where the order is going, for Riley's context.
function describeContext(fulfillment: Fulfillment): string {
  const { mode, where } = describeFulfillment(fulfillment);
  return `${mode} — ${where}`;
}

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
// sends it as the visitor's first message — Riley answers it like anything
// else they might have typed.
//
// "Track my order" is deliberately not here any more: Riley can't see orders,
// so a button promising she can would be the first thing a visitor tapped and
// the first thing that disappointed them.
const TOPICS = [
  "What's on the menu?",
  "How does ordering work?",
  "What's in a sandwich?",
  "Something else",
] as const;

// The minimal square speech bubble from the user's reference — clean
// outline, tail at the bottom-left, no dots.
function ChatBubbleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 6A1.5 1.5 0 0 1 6.5 4.5h11A1.5 1.5 0 0 1 19 6v7.5a1.5 1.5 0 0 1-1.5 1.5H8.8L5 18.6V6Z"
        stroke="white"
        strokeWidth="1.9"
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

type Entry = { id: number; role: "bot" | "user"; text: string };

// The shop's chat, answered by Riley — see app/api/shop-chat/riley.ts.
//
// A real conversation, not a contact form: the visitor types, Riley answers
// in the same window, and the thread stays open as long as they keep it open.
// Nothing here collects a name or an email, because the reply comes back
// here rather than to an inbox.
//
// The whole visible thread is posted on every turn — the API is stateless and
// there's nowhere to keep a session, so the transcript in this component *is*
// the conversation. It follows that a reload starts over, which is the
// honest behaviour: nothing was being remembered.
//
// Riley can answer about the menu, ordering, and how the app works. She
// cannot see orders, take payment, or issue a refund. Her briefing says so;
// the quick-reply buttons above deliberately don't imply otherwise.
export default function ChatWidget() {
  const bannerVisible = useSyncExternalStore(
    subscribeCookieBanner,
    cookieBannerVisible,
    getCookieBannerServerSnapshot,
  );
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Where the order is going, if it's been chosen — the difference between
  // "when will it arrive" and "when can I collect it". Sent as context so
  // Riley doesn't have to ask.
  const fulfillment = useFulfillment();

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
  }, [entries, open]);

  // Riley's turn. The thread as it stands goes up, her reply comes back, and
  // both ends of that are derived from `entries` rather than tracked
  // separately — one source of truth for what the conversation is.
  async function ask(text: string) {
    const id = nextId.current++;
    const asked: Entry[] = [...entries, { id, role: "user", text }];
    setEntries(asked);
    setError(null);
    setThinking(true);

    try {
      const response = await fetch("/api/shop-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: asked.map((entry) => ({
            role: entry.role === "bot" ? "assistant" : "user",
            text: entry.text,
          })),
          context: fulfillment ? describeContext(fulfillment) : undefined,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        reply?: string;
        error?: string;
      } | null;

      if (!response.ok || !body?.reply) {
        throw new Error(body?.error ?? "Riley couldn't answer just now.");
      }
      setEntries((prior) => [
        ...prior,
        { id: nextId.current++, role: "bot", text: body.reply as string },
      ]);
    } catch (askError) {
      // The failed turn is left in the thread and the composer refilled with
      // what they typed, so retrying is one tap rather than retyping.
      setError(askError instanceof Error ? askError.message : "Something went wrong.");
      setDraft(text);
      setEntries((prior) => prior.filter((entry) => entry.id !== id));
    } finally {
      setThinking(false);
    }
  }

  function sendDraft() {
    const text = draft.trim();
    if (!text || thinking) return;
    setDraft("");
    void ask(text);
  }

  const showChips = entries.length === 0 && !thinking;

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
        // it's dismissed. Each offset adds env(safe-area-inset-bottom) on
        // top of its usual value — inert on ordinary pages, but keeps the
        // launcher clear of the home-indicator area now that /shop's
        // viewport-fit=cover puts it in play.
        bannerVisible
          ? "bottom-[calc(136px+env(safe-area-inset-bottom))] sm:bottom-[calc(96px+env(safe-area-inset-bottom))]"
          : "bottom-[calc(20px+env(safe-area-inset-bottom))] sm:bottom-[calc(24px+env(safe-area-inset-bottom))]"
      }`}
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
              className="text-[15px] font-medium leading-tight text-white"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              Riley
            </p>
            <p className="text-[12px] leading-tight text-white/80">
              Corner Bagel
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
            className="mb-1.5 ml-9 text-[11px] font-medium text-[#8A8672]"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            Riley
          </p>
          <div className="mb-2 ml-9">
            <p className={botBubbleClass}>
              Hi, I&rsquo;m Riley. I look after ordering and anything else
              Corner Bagel.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <BagelAvatar />
            <p className={botBubbleClass}>What can I help you with?</p>
          </div>
          {/* Said once, up front, rather than under every reply: a label on
              each bubble is noise, and the thing worth disclosing is that
              nobody is reading this — not that a given sentence was
              generated. */}
          <p className="ml-9 mt-1 text-[11px] text-[#9A9A9A]">
            AI assistant &middot; not a person
          </p>

          {showChips ? (
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {TOPICS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => void ask(option)}
                  className="cursor-pointer rounded-full border border-[#DDD6C2] px-3.5 py-2 text-[13px] text-[#3E4A30] transition-colors hover:border-[#3E4A30] hover:bg-[#EFEBDD]"
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}

          {entries.map((entry) =>
            entry.role === "user" ? (
              <div key={entry.id} className="mt-3 flex flex-col items-end">
                <span
                  style={{ backgroundColor: SAGE }}
                  className={userBubbleClass}
                >
                  {entry.text}
                </span>
              </div>
            ) : (
              <div key={entry.id} className="mt-3 flex items-end gap-2">
                <BagelAvatar />
                {/* whitespace-pre-wrap because Riley writes in paragraphs and
                    occasionally a short list; collapsing those into one run
                    is the difference between a readable answer and a wall. */}
                <p className={`${botBubbleClass} whitespace-pre-wrap`}>{entry.text}</p>
              </div>
            ),
          )}

          {thinking ? (
            <div className="mt-3 flex items-end gap-2">
              <BagelAvatar />
              <span
                className={botBubbleClass}
                role="status"
                aria-label="Riley is typing"
              >
                <span className="flex items-center gap-1 py-0.5">
                  {[0, 1, 2].map((index) => (
                    <span
                      key={index}
                      className="block h-1.5 w-1.5 animate-pulse rounded-full bg-[#8A8672] motion-reduce:animate-none"
                      style={{ animationDelay: `${index * 160}ms` }}
                    />
                  ))}
                </span>
              </span>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="mt-3 text-[11px]" style={{ color: ERROR_RED }}>
              {error}
            </p>
          ) : null}

        </div>

        {/* The composer, pinned under the thread — free-typing works
            alongside (or instead of) the topic buttons, and never locks:
            the conversation has no end state to disable it at. */}
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
            placeholder={thinking ? "Riley is typing…" : "Type a message…"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-w-0 flex-1 rounded-full border border-[#DDD6C2] px-4 py-2.5 text-[16px] text-[#3E4A30] outline-none placeholder:text-[#9A9A9A] focus:border-[#3E4A30] sm:text-[14px]"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={draft.trim().length === 0 || thinking}
            style={{ backgroundColor: OLIVE }}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-30 disabled:hover:opacity-30"
          >
            <SendArrowIcon />
          </button>
        </form>
      </div>

      {/* The launcher used to morph into an ✕ while the panel was open, which
          put two close buttons on screen for the same panel — this one and
          the ✕ in the panel's own header. The header ✕ is the one people
          look for, so the launcher hides instead. `invisible` rather than
          `hidden` keeps its box in the column, so the panel doesn't jump
          down by the launcher's height when it opens. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open chat"
        aria-expanded={open}
        aria-hidden={open}
        tabIndex={open ? -1 : undefined}
        style={{ backgroundColor: OLIVE }}
        // 44px, down from 56px. Not smaller than this: 44 is the floor for a
        // reliable thumb target, and the launcher sits in the corner a thumb
        // sweeps past — shaving the last few pixels off buys a little more
        // catalog and costs mis-taps on the one control that isn't part of
        // the page.
        className={`relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-full shadow-[0_3px_12px_rgba(0,0,0,0.22)] transition-transform hover:scale-105 ${
          open ? "invisible" : "pointer-events-auto"
        }`}
      >
        <ChatBubbleIcon />
      </button>
    </div>
  );
}
