"use client";

import Image from "next/image";
import { translate, useLocale, useServerText, useT } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { describeFulfillment, useFulfillment, type Fulfillment } from "../fulfillment";
import { useCart } from "./CartContext";
import ChatCart from "./ChatCart";
import ChatCheckout from "./ChatCheckout";
import PurchaseComplete from "./checkout/PurchaseComplete";
import { useCheckout } from "./checkout/useCheckout";
import { formatPrice } from "./products";
import { InfoPanel, ProductCards, RichText, ScreenButton } from "./chatContent";
import { emptyAttachments, type ChatAttachments, type ProductCard } from "./chatTypes";
import { DISPLAY_FONT } from "./shopControls";

// One line naming where the order is going, for Riley's context. English on
// purpose: this is not shown to anybody, it goes into her prompt, and her
// briefing is written in English.
function describeContext(fulfillment: Fulfillment): string {
  const { mode, where } = describeFulfillment(fulfillment);
  return `${translate("en", mode)} — ${where}`;
}

const ERROR_RED = "var(--cb-red)";

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
const TOPICS = [
  "chat.topicMenu",
  "chat.topicOrdering",
  "chat.topicSandwich",
  "chat.topicGift",
] as const;

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

// A bot turn is text plus whatever Riley attached to it — cards, an hours or
// delivery panel, a next-screen button. Held per entry rather than only for
// the latest reply, so scrolling back up shows the answer as it was given
// instead of a paragraph with its cards missing.
type Entry = {
  id: number;
  role: "bot" | "user";
  text: string;
  attachments?: ChatAttachments;
};

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
  const t = useT();
  const locale = useLocale();
  // /api/shop-chat answers with string keys, not sentences — see serverText().
  const st = useServerText();
  const [open, setOpen] = useState(false);
  // Which half of the panel is showing. "checkout" and "done" are steps of
  // the cart tab rather than tabs of their own — a segmented control that
  // grew a third and fourth segment mid-transaction would be a navigation
  // problem, and there is nowhere useful to go from a form you are halfway
  // through except back.
  const [view, setView] = useState<"chat" | "cart" | "checkout" | "done">("chat");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  // How long she has been thinking, in tenths, so the indicator can say it.
  //
  // The reference shows an elapsed time next to "Thinking", and it earns its
  // place: three bouncing dots say "something is happening" and stop being
  // reassuring at about four seconds, where a number that is still moving
  // says the wait is real rather than stuck. Tenths rather than seconds
  // because a counter that only changes once a second looks frozen for most
  // of each one.
  const [thinkingMs, setThinkingMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Riley's own quick replies, from the last thing she said. They replace the
  // opening topics once a conversation is under way.
  const [chips, setChips] = useState<string[]>([]);

  // Adding to the basket is the one thing Riley can change out here. The
  // count and the subtotal are read for the tab and the bar.
  const { addItem, itemCount, subtotalCents } = useCart();

  // The transaction, shared with /shop/checkout. Mounted for the life of the
  // panel rather than with the sheet, so a half-filled form survives flipping
  // back to the conversation to ask Riley something — which is most of the
  // reason to check out in here at all.
  const checkout = useCheckout();

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

  // The counter is zeroed by ask(), not here: resetting it in the effect body
  // would be a synchronous setState inside an effect, which is a cascading
  // render for a number nobody has looked at yet.
  useEffect(() => {
    if (!thinking) return;
    const started = Date.now();
    const timer = window.setInterval(() => setThinkingMs(Date.now() - started), 100);
    return () => window.clearInterval(timer);
  }, [thinking]);

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
    setChips([]);
    setError(null);
    setThinkingMs(0);
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
          // So Riley answers in the language the rest of the screen is in.
          locale,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | (Partial<ChatAttachments> & { reply?: string; error?: string })
        | null;

      if (!response.ok || (!body?.reply && !body?.products?.length && !body?.info?.length)) {
        throw new Error(body?.error ?? "api.rileyDown");
      }

      const attachments: ChatAttachments = {
        ...emptyAttachments(),
        products: body.products ?? [],
        info: body.info ?? [],
        chips: body.chips ?? [],
        actions: body.actions ?? [],
      };

      // The one action Riley performs rather than proposes. It runs here, in
      // the browser, because the basket is localStorage — the server has no
      // way to reach it and no business knowing what's in it.
      //
      // The confirmation used to be the full basket drawer flying open over
      // the panel: proof that something was added is seeing it sitting there,
      // not a sentence claiming it. That reasoning still holds, but the panel
      // has its own cart now, so the proof is the count on the Cart tab and
      // the total on the bar at the foot — both of which move on the same
      // render, without burying the conversation that produced them.
      for (const action of attachments.actions) {
        if (action.type === "add_to_basket") {
          addItem(action.slug, action.quantity, action.options);
        }
      }

      setChips(attachments.chips);
      setEntries((prior) => [
        ...prior,
        {
          id: nextId.current++,
          role: "bot",
          text: body.reply ?? "",
          attachments,
        },
      ]);
    } catch (askError) {
      // The failed turn is left out of the thread and the composer refilled
      // with what they typed, so retrying is one tap rather than retyping.
      setError(
        askError instanceof Error ? askError.message : "checkout.somethingWentWrong",
      );
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

  // The opening topics until the conversation starts, then whatever Riley
  // offered on her last reply. Either way they sit above the composer and read
  // as something you might say — which is what they are.
  // The opening topics are keys, so they are asked in the visitor's own
  // language. Riley's own follow-up chips come back from her already written
  // in it, so they pass through as they are.
  // Which view is actually on screen, derived rather than stored.
  //
  // Two rules the panel would otherwise need effects for, and effects that
  // set state from other state are how a panel ends up briefly showing the
  // wrong thing. A placed order always wins — the sheet's own status is the
  // truth about that, not a flag this component set afterwards. And a cart
  // that has emptied (removed the last line, or a tab elsewhere cleared it)
  // has no cart or checkout view left to show.
  const shown =
    checkout.status === "placed"
      ? "done"
      : itemCount === 0 && view !== "chat"
        ? "chat"
        : view;

  const suggestions =
    entries.length === 0 ? TOPICS.map((key) => t(key)) : chips;
  const showChips = suggestions.length > 0 && !thinking;
  const canSend = draft.trim().length > 0 && !thinking;

  return (
    // pointer-events-none on the container: with the panel always mounted
    // for its open/close animation, the container's (invisible) box spans
    // the panel's full footprint even while closed, and would otherwise
    // swallow clicks meant for the page under it. Only the launcher and the
    // open panel opt back in.
    <div
      className="pointer-events-none fixed right-5 z-[150] flex flex-col items-end transition-[bottom] duration-200 sm:right-6"
      style={{
        // Sits above the cookie banner while it's up and settles into the
        // corner once it's dismissed. --cb-consent-h is the banner's own
        // measured height (see app/CookieConsent.tsx); this used to be a pair
        // of hardcoded pixel values, 136 and 96, which were right for the two
        // shapes the banner had then and wrong the moment its copy rewrapped
        // at a different width.
        //
        // env(safe-area-inset-bottom) is inert on an ordinary page but keeps
        // the launcher clear of the home-indicator area, which /shop's
        // viewport-fit=cover puts in play.
        bottom:
          "calc(20px + env(safe-area-inset-bottom) + var(--cb-consent-h, 0px))",
      }}
    >
      {/* Always mounted so it can animate closed as well as open; inert
          keeps focus and clicks out while it's hidden. The hairline border is
          load-bearing in dark mode, where a drop shadow against a dark ground
          does nothing and the panel would otherwise have no edge. */}
      <div
        inert={!open}
        role="dialog"
        aria-label={t("chat.withRiley")}
        className={`mb-3 flex w-[calc(100vw-2.5rem)] max-w-[344px] origin-bottom-right flex-col overflow-hidden rounded-3xl border border-line-faint bg-surface shadow-[0_16px_44px_rgba(0,0,0,0.20)] transition-all duration-200 ease-out ${
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-2 scale-95 opacity-0"
        }`}
        style={{
          // See Modal.tsx: opacity-0 is invisible to a person and still a
          // composited layer to the browser. This panel sits on every page of
          // the shop, so leaving it composited is a permanent cost for a thing
          // most visits never open.
          //
          // The closed transition restates `transition-all duration-200` from
          // the class list rather than only naming visibility, because an
          // inline transition replaces the class one outright, and naming just
          // visibility would take the fade out with it.
          visibility: open ? "visible" : "hidden",
          transition: open ? undefined : "all 200ms ease-out, visibility 0s linear 200ms",
        }}
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
            aria-label={t("chat.close")}
            className="cb-press -mr-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-on-ink/80 transition-colors hover:bg-white/10 hover:text-on-ink dark:text-muted dark:hover:bg-raise dark:hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Chat / Cart, as a segmented control.
            Only once there is something to check out. An empty second tab on
            a first visit is a promise the panel hasn't earned yet, and it
            pushes the greeting down the screen to make room for nothing. It
            appears the moment Riley puts something in. */}
        {itemCount > 0 && shown !== "done" ? (
          <div className="flex gap-1 border-b border-line-faint bg-surface p-1.5">
            {(["chat", "cart"] as const).map((id) => {
              // "checkout" is a step of the cart, so the Cart segment stays
              // lit through it rather than the control appearing to lose its
              // place halfway through a form.
              const active = id === "chat" ? shown === "chat" : shown !== "chat";
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setView(id)}
                  className={`flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full text-[13px] font-medium transition-colors ${
                    active ? "bg-raise text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  {id === "cart" ? (
                    <>
                      <span
                        aria-hidden
                        className="h-[6px] w-[6px] rounded-full"
                        style={{ backgroundColor: "var(--cb-olive)" }}
                      />
                      <span className="tabular-nums">{itemCount}</span>
                      <span>{t("chat.tabCart")}</span>
                    </>
                  ) : (
                    t("chat.tabChat")
                  )}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* One scrolling body, whichever view is in it. The height is capped
            rather than fixed so a two-line conversation doesn't open a
            half-screen panel, and the cap is generous enough that the
            checkout form isn't read through a letterbox. */}
        {shown === "done" ? (
          <div className="max-h-[70vh] overflow-y-auto bg-cream">
            <PurchaseComplete
              order={checkout.placed}
              where={checkout.where}
              tender={checkout.tender}
              onDone={() => {
                setView("chat");
                setOpen(false);
              }}
            />
          </div>
        ) : shown === "cart" ? (
          <div className="max-h-[62vh] overflow-y-auto bg-surface">
            <ChatCart onCheckout={() => setView("checkout")} />
          </div>
        ) : shown === "checkout" ? (
          <div className="max-h-[70vh] overflow-y-auto bg-surface">
            <ChatCheckout checkout={checkout} onBack={() => setView("chat")} />
          </div>
        ) : (
        <>
        {/* The thread, on its own ground so the composer below reads as a
            separate surface rather than more of the same panel. */}
        <div
          ref={threadRef}
          className="flex max-h-[52vh] min-h-[86px] flex-col gap-2 overflow-y-auto bg-cream px-3.5 py-3.5"
        >
          <div className="flex items-end gap-2">
            <BagelAvatar />
            <p className={BOT_BUBBLE}>{t("chat.greeting")}</p>
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
            const attached = entry.attachments;
            const openAction = attached?.actions.find((action) => action.type === "open");
            return (
              <div key={entry.id} className="flex flex-col gap-2">
                <div className="flex items-end gap-2">
                  <BagelAvatar hidden={continues} />
                  {/* RichText, not raw text in a pre-wrap bubble. Models write
                      markdown by default, and printing it verbatim is how
                      "**The Veggie Stack** — $15.50" reached the screen with
                      its asterisks showing. */}
                  <div className={BOT_BUBBLE}>
                    <RichText text={entry.text} />
                  </div>
                </div>

                {/* Attachments sit under the bubble at full width rather than
                    inside it: a card rail in a 86%-width bubble is a card rail
                    with no room. Indented to the avatar's gutter so they still
                    read as part of what she said. */}
                {attached && (attached.products.length > 0 || attached.info.length > 0 || openAction) ? (
                  <div className="ml-8 flex flex-col gap-2">
                    {attached.info.map((card, cardIndex) => (
                      <InfoPanel key={cardIndex} card={card} />
                    ))}
                    <ProductCards
                      products={attached.products}
                      // No requestOpenBasket() any more. Throwing the
                      // full-screen basket drawer over the panel was the right
                      // answer when the chat had no cart of its own and you
                      // needed somewhere to see what she'd added — now it
                      // buries the conversation you were having, which is the
                      // one thing checking out in here exists to avoid. The
                      // card says "Added" and the bar at the foot moves; that
                      // is the confirmation, and the Cart tab is one tap away.
                      onAdd={(product: ProductCard) => addItem(product.slug, 1)}
                    />
                    {openAction ? (
                      <ScreenButton
                        action={openAction}
                        onNavigate={() => setOpen(false)}
                        // The handoff. Riley offering "check out" now opens
                        // the sheet in this panel instead of navigating to
                        // /shop/checkout, which is the whole point of her
                        // being able to fill a basket in here.
                        openHere={(screen) => {
                          setView(screen === "checkout" ? "checkout" : "cart");
                          return true;
                        }}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}

          {thinking ? (
            <div className="flex items-end gap-2">
              <BagelAvatar hidden={entries.at(-1)?.role === "bot"} />
              <span className={BOT_BUBBLE} role="status" aria-label={t("chat.typing")}>
                <span className="flex items-center gap-2 py-0.5">
                  <span className="flex items-center gap-[3px]">
                    {[0, 1, 2].map((index) => (
                      <span
                        key={index}
                        className="block h-[5px] w-[5px] animate-bounce rounded-full bg-faint motion-reduce:animate-none"
                        style={{ animationDelay: `${index * 140}ms`, animationDuration: "900ms" }}
                      />
                    ))}
                  </span>
                  {/* Held back for the first second. Showing "Thinking 0.1s"
                      the instant she starts makes a fast answer look like it
                      needed timing, and the number is only reassuring once
                      there is something to reassure about. */}
                  {thinkingMs >= 1000 ? (
                    <span className="text-[11px] tabular-nums text-quiet">
                      {t("chat.thinkingFor", { seconds: (thinkingMs / 1000).toFixed(1) })}
                    </span>
                  ) : null}
                </span>
              </span>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="m-0 px-1 text-[11px] leading-[1.4]" style={{ color: ERROR_RED }}>
              {st(error)}
            </p>
          ) : null}
        </div>

        {/* Quick replies, docked above the composer rather than sitting in the
            thread. In the thread they read as something Riley said; here they
            read as something you might say next, which is what they are —
            and they don't shove the greeting up the screen. */}
        {showChips ? (
          <div className="flex flex-wrap justify-end gap-1.5 border-t border-line-faint bg-surface px-3 pt-2.5">
            {suggestions.map((option) => (
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
            aria-label={t("chat.typeMessage")}
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
            aria-label={t("chat.send")}
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
        </>
        )}

        {/* The persistent cart bar from the reference. Only in the
            conversation: in the cart it would sit under the subtotal saying
            the same number twice, and in the checkout it would compete with
            the button that actually places the order. */}
        {shown === "chat" && itemCount > 0 ? (
          <button
            type="button"
            onClick={() => setView("cart")}
            className="cb-press flex w-full cursor-pointer items-center justify-center gap-2 border-t border-line-faint bg-ink px-4 py-3 text-[13px] font-medium text-on-ink transition-opacity hover:opacity-90"
          >
            {t("chat.cartTotal", { total: formatPrice(subtotalCents) })}
          </button>
        ) : null}
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
        aria-label={t("chat.open")}
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
