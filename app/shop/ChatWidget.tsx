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

const ERROR_RED = "var(--cb-red)";

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

// The quick replies. Picking one sends it as the visitor's first message —
// Riley answers it like anything else they might have typed.
//
// Short on purpose. These were full sentences set at 13px with generous
// padding, which made four buttons that dwarfed the greeting above them and
// turned the opening screen into a menu rather than a conversation. They're
// prompts, not navigation: they should read as something you could have said.
//
// "Track my order" is deliberately not here: Riley can't see orders, so a
// button promising she can would be the first thing a visitor tapped and the
// first thing that disappointed them.
const TOPICS = ["The menu", "How ordering works", "What's in a sandwich", "Gift cards"] as const;

function ChatBubbleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 6A1.5 1.5 0 0 1 6.5 4.5h11A1.5 1.5 0 0 1 19 6v7.5a1.5 1.5 0 0 1-1.5 1.5H8.8L5 18.6V6Z"
        stroke="var(--cb-on-ink)"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SendArrowIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Riley's face. `hidden` is how a bubble in a run keeps its indent without
// stamping the avatar again — see the run logic in the thread below.
function BagelAvatar({ hidden = false }: { hidden?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-faint bg-surface ${
        hidden ? "invisible" : ""
      }`}
    >
      <Image src="/icon.svg" alt="" width={15} height={15} unoptimized className="object-contain" />
    </span>
  );
}

// The two bubble shapes. Both sit at 13px with 1.5 leading — the size the rest
// of the shop uses for a product description, which is the right register for
// something you read once and act on.
//
// The visitor's bubble is the app's primary fill (--cb-ink on --cb-on-ink),
// not sage. Sage is a mid green: in dark mode the light ink sitting on it came
// out at around 2:1, and the whole point of a filled bubble is that you can
// read it.
//
// Riley's is --cb-surface on the thread's --cb-cream, so it sits a half-step
// *above* the ground like a card. It was --cb-raise, which is a half-step
// below: the bubbles were darker than the thread and barely separated from it,
// which is the difference between a conversation and a block of text.
const BOT_BUBBLE =
  "w-fit max-w-[86%] rounded-2xl rounded-bl-sm bg-surface px-3 py-2 text-[13px] leading-[1.5] text-ink";
const USER_BUBBLE =
  "w-fit max-w-[86%] rounded-2xl rounded-br-sm bg-ink px-3 py-2 text-[13px] leading-[1.5] text-on-ink";

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
// the quick replies deliberately don't imply otherwise.
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
  const inputRef = useRef<HTMLInputElement>(null);
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
  }, [entries, thinking, open]);

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
      // The failed turn is left out of the thread and the composer refilled
      // with what they typed, so retrying is one tap rather than retyping.
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
  const canSend = draft.trim().length > 0 && !thinking;

  return (
    // pointer-events-none on the container: with the panel always mounted
    // for its open/close animation, the container's (invisible) box spans
    // the panel's full footprint even while closed, and would otherwise
    // swallow clicks meant for the page under it. Only the launcher and the
    // open panel opt back in.
    <div
      className={`pointer-events-none fixed right-5 z-[150] flex flex-col items-end transition-[bottom] duration-200 sm:right-6 ${
        // Clears the cookie banner's measured height plus a gap while it's up;
        // settles into the corner once it's dismissed. Each offset adds
        // env(safe-area-inset-bottom) on top of its usual value — inert on
        // ordinary pages, but keeps the launcher clear of the home-indicator
        // area now that /shop's viewport-fit=cover puts it in play.
        bannerVisible
          ? "bottom-[calc(136px+env(safe-area-inset-bottom))] sm:bottom-[calc(96px+env(safe-area-inset-bottom))]"
          : "bottom-[calc(20px+env(safe-area-inset-bottom))] sm:bottom-[calc(24px+env(safe-area-inset-bottom))]"
      }`}
    >
      {/* Always mounted so it can animate closed as well as open; inert
          keeps focus and clicks out while it's hidden. The hairline border is
          load-bearing in dark mode, where a drop shadow against a dark ground
          does nothing and the panel would otherwise have no edge. */}
      <div
        inert={!open}
        role="dialog"
        aria-label="Chat with Riley"
        className={`mb-3 flex w-[calc(100vw-2.5rem)] max-w-[344px] origin-bottom-right flex-col overflow-hidden rounded-3xl border border-line-faint bg-surface shadow-[0_16px_44px_rgba(0,0,0,0.20)] transition-all duration-200 ease-out ${
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-2 scale-95 opacity-0"
        }`}
      >
        {/* Header. Slimmer than it was — it used to be a 72px olive slab with
            a 40px disc in it, which is a lot of furniture above a one-line
            greeting.
            
            Olive in light, and a raised dark tone in dark rather than the
            light end of the ramp --cb-ink flips to. Inverting it there is
            token-consistent but puts the brightest object on the screen above
            the conversation, which is the one thing a chat header shouldn't
            do. One of the few places the two themes want different structure
            rather than a different shade — see the dark variant in
            globals.css. */}
        <div className="flex items-center gap-2.5 border-b border-transparent bg-ink px-3.5 py-3 dark:border-line-faint dark:bg-panel">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface dark:bg-raise">
            <Image src="/icon.svg" alt="" width={20} height={20} unoptimized className="object-contain" />
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="m-0 text-[14px] font-medium leading-tight text-on-ink dark:text-heading"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              Riley
            </p>
            <p className="m-0 text-[11px] leading-tight text-on-ink/70 dark:text-muted">
              Corner Bagel
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close chat"
            className="cb-press -mr-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-on-ink/80 transition-colors hover:bg-white/10 hover:text-on-ink dark:text-muted dark:hover:bg-raise dark:hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>

        {/* The thread, on its own ground so the composer below reads as a
            separate surface rather than more of the same panel. */}
        <div
          ref={threadRef}
          className="flex max-h-[52vh] min-h-[86px] flex-col gap-2 overflow-y-auto bg-cream px-3.5 py-3.5"
        >
          <div className="flex items-end gap-2">
            <BagelAvatar />
            <p className={BOT_BUBBLE}>Hey, how can I help?</p>
          </div>

          {entries.map((entry, index) => {
            if (entry.role === "user") {
              return (
                <div key={entry.id} className="flex justify-end">
                  <span className={USER_BUBBLE}>{entry.text}</span>
                </div>
              );
            }
            // The avatar marks who is speaking, and it only needs to do that
            // once per run. Stamping it beside every bubble in a multi-part
            // answer is the sort of repetition that makes a thread look
            // machine-generated.
            const previous = index === 0 ? null : entries[index - 1];
            const continues = previous?.role === "bot";
            return (
              <div key={entry.id} className="flex items-end gap-2">
                <BagelAvatar hidden={continues} />
                {/* whitespace-pre-wrap because Riley writes in paragraphs and
                    occasionally a short list; collapsing those into one run
                    is the difference between a readable answer and a wall. */}
                <p className={`${BOT_BUBBLE} whitespace-pre-wrap`}>{entry.text}</p>
              </div>
            );
          })}

          {thinking ? (
            <div className="flex items-end gap-2">
              <BagelAvatar hidden={entries.at(-1)?.role === "bot"} />
              <span className={BOT_BUBBLE} role="status" aria-label="Riley is typing">
                <span className="flex items-center gap-[3px] py-1">
                  {[0, 1, 2].map((index) => (
                    <span
                      key={index}
                      className="block h-[5px] w-[5px] animate-bounce rounded-full bg-faint motion-reduce:animate-none"
                      style={{ animationDelay: `${index * 140}ms`, animationDuration: "900ms" }}
                    />
                  ))}
                </span>
              </span>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="m-0 px-1 text-[11px] leading-[1.4]" style={{ color: ERROR_RED }}>
              {error}
            </p>
          ) : null}
        </div>

        {/* Quick replies, docked above the composer rather than sitting in the
            thread. In the thread they read as something Riley said; here they
            read as something you might say next, which is what they are —
            and they don't shove the greeting up the screen. */}
        {showChips ? (
          <div className="flex flex-wrap justify-end gap-1.5 border-t border-line-faint bg-surface px-3 pt-2.5">
            {TOPICS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => void ask(option)}
                className="cb-press cursor-pointer rounded-full border border-line-soft px-2.5 py-1.5 text-[12px] leading-none text-muted transition-colors hover:border-ink hover:text-ink"
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}

        {/* The composer, pinned under the thread — free-typing works
            alongside (or instead of) the quick replies, and never locks: the
            conversation has no end state to disable it at. */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            sendDraft();
          }}
          className={`flex items-center gap-2 bg-surface px-3 pb-3 ${
            showChips ? "pt-2" : "border-t border-line-faint pt-3"
          }`}
        >
          <input
            ref={inputRef}
            type="text"
            aria-label="Type a message"
            placeholder={thinking ? "Riley is typing…" : "Message Riley"}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            // A filled field rather than an outlined pill: the outline was a
            // third rounded rectangle in a stack of them, and the fill sets
            // the input apart from the bubbles without adding another rule.
            // 16px so iOS doesn't zoom the page when it takes focus.
            className="h-9 min-w-0 flex-1 rounded-full bg-raise px-3.5 text-[16px] text-ink outline-none transition-shadow placeholder:text-quiet focus:shadow-[inset_0_0_0_1.5px_var(--cb-ink)] sm:text-[13px]"
          />
          {/* Outlined at rest, filled once there's something to send — the
              same white-then-olive language as the app's buttons. It used to
              be a filled circle at 30% opacity, which reads as a broken
              control rather than one waiting for input. */}
          <button
            type="submit"
            aria-label="Send"
            disabled={!canSend}
            className={`cb-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
              canSend
                ? "cursor-pointer border-ink bg-ink text-on-ink hover:opacity-90"
                : "cursor-default border-line-soft bg-transparent text-quiet"
            }`}
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
        // 44px. Not smaller than this: 44 is the floor for a reliable thumb
        // target, and the launcher sits in the corner a thumb sweeps past —
        // shaving the last few pixels off buys a little more catalog and
        // costs mis-taps on the one control that isn't part of the page.
        className={`relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-ink shadow-[0_3px_12px_rgba(0,0,0,0.22)] transition-transform hover:scale-105 active:scale-95 ${
          open ? "invisible" : "pointer-events-auto"
        }`}
      >
        <ChatBubbleIcon />
      </button>
    </div>
  );
}
