"use client";

import Image from "next/image";
import { translate, useLocale, useServerText, useT } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { describeFulfillment, useFulfillment, type Fulfillment } from "../fulfillment";
import { useCart } from "./CartContext";
import ChatCart from "./ChatCart";
import ChatCheckout from "./ChatCheckout";
import ChatConfigure from "./ChatConfigure";
import ChatTrack from "./ChatTrack";
import { MentionList, useMentions, type Mention } from "./ChatMentions";
import PurchaseComplete from "./checkout/PurchaseComplete";
import { useCheckout } from "./checkout/useCheckout";
import MergingDots from "../ui/MergingDots";
import { formatPrice, getProduct } from "./products";
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
// "What is Corner Bagel?" in place of "What's in a sandwich". The sandwich
// question was already answered by the screen behind the panel — every tile in
// the catalog lists what's in it — and it sent somebody to a chat to read a
// description. This one has no other answer on the site's shop half, and it's
// the question a first visit actually starts with.
const TOPICS = [
  "chat.topicMenu",
  "chat.topicOrdering",
  "chat.topicAbout",
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

// The four-pointed star the reference uses for its empty state. Not the bagel
// mark: the mark says "Riley", and this space is about what the panel can do
// rather than about who is in it.
function SparkIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M10 2.4c.5 3.1 1.6 4.9 4.3 5.4v.4c-2.7.5-3.8 2.3-4.3 5.4h-.4c-.5-3.1-1.6-4.9-4.3-5.4v-.4c2.7-.5 3.8-2.3 4.3-5.4h.4Z"
        fill="currentColor"
        transform="translate(0 2)"
      />
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
// Riley on the raised grey, the visitor on the blue. Inside .cb-chat-surface
// both of those are the panel's own tokens — see globals.css.
const BOT_BUBBLE =
  "w-fit max-w-[86%] rounded-2xl rounded-bl-sm bg-surface px-3 py-2 text-[13px] leading-[1.5] text-ink";
const USER_BUBBLE =
  "w-fit max-w-[86%] rounded-2xl rounded-br-sm bg-chat-accent px-3 py-2 text-[13px] leading-[1.5] text-white";

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
  const [view, setView] = useState<
    "chat" | "configure" | "cart" | "checkout" | "done" | "track"
  >("chat");
  // The item whose choices are open, if any. A slug rather than the product,
  // so this can't hold a stale copy of a catalog entry.
  const [configuring, setConfiguring] = useState<string | null>(null);
  // The order whose confirmation has been read and dismissed.
  //
  // An id rather than a boolean, and that is the whole point: useCheckout's
  // status goes to "placed" and stays there, so without this the panel showed
  // the confirmation screen for the rest of the session — every reopen, every
  // page. Closing the panel was the only way past it, which is why Done used
  // to do that. Keyed on the id so a *second* order gets its own confirmation
  // rather than inheriting the first one's dismissal.
  const [acknowledged, setAcknowledged] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
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

  // The @ picker. Owns the token being typed and the items it matches; the
  // composer below hands it keys and caret positions. See ChatMentions.tsx.
  const mentions = useMentions(draft, setDraft, inputRef);

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
  //
  // The reply streams. /api/shop-chat answers newline-delimited JSON — see the
  // note at the top of that file — and each line is a whole snapshot rather
  // than a delta: the text so far, or the attachments so far. Snapshots mean
  // this end has no reassembly to get wrong, and a dropped line costs a frame
  // rather than corrupting the message.
  //
  // Why it matters here is latency. Riley thinks, then reaches for a tool,
  // then writes; waiting for all three before showing anything is six or eight
  // seconds of a loader. Streaming doesn't make her faster, it stops the wait
  // being spent on a blank panel — the first words land in about a second and
  // the rest arrives as it's written.
  async function ask(text: string, mentioned: Mention[] = []) {
    const id = nextId.current++;
    const asked: Entry[] = [...entries, { id, role: "user", text }];
    setEntries(asked);
    setChips([]);
    setError(null);
    setThinking(true);

    // The bot entry is created on the first line that has something in it,
    // and updated in place after that. Held by id rather than by index —
    // nothing else can append to the thread mid-turn today, and this doesn't
    // become a bug the day something can.
    let replyId: number | null = null;
    let attachments: ChatAttachments = emptyAttachments();
    // How many of the actions have been run. Every attachment line carries the
    // full list, so without this a basket action would be replayed on each one
    // and three lines would put three bagels in the basket.
    let ranActions = 0;
    let sawAnything = false;

    // The id is minted out here rather than inside the updater below. A state
    // updater has to be pure — React is free to run it twice — and one that
    // also allocated an id would append two bot bubbles the second time.
    const write = (next: { text?: string; attach?: ChatAttachments }) => {
      if (next.attach) attachments = next.attach;
      const carried = attachments;
      if (replyId === null) {
        const created = nextId.current++;
        replyId = created;
        const opening = next.text ?? "";
        setEntries((prior) => [
          ...prior,
          { id: created, role: "bot", text: opening, attachments: carried },
        ]);
        return;
      }
      const target = replyId;
      setEntries((prior) =>
        prior.map((entry) =>
          entry.id === target
            ? { ...entry, text: next.text ?? entry.text, attachments: carried }
            : entry,
        ),
      );
    };

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
          // What they pinned with @. Slugs, not names: the server resolves
          // them against the catalog and ignores whatever label came with
          // them, so "@Good Lox Today" is an identity rather than a string she
          // has to match back to an item.
          mentions: mentioned.map((mention) => mention.slug),
          // So Riley answers in the language the rest of the screen is in.
          locale,
        }),
      });

      if (!response.ok || !response.body) throw new Error("api.rileyDown");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Read to the end even after the last useful line: the loop exits on
      // done, and abandoning the reader early would leave the connection open.
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Everything up to the last newline is complete; whatever follows is
        // half a line and waits for the next chunk.
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: {
            type?: string;
            text?: string;
            error?: string;
          } & Partial<ChatAttachments>;
          try {
            event = JSON.parse(line);
          } catch {
            // A malformed line is a bug on the other end, not something to
            // put in front of a customer. Skipped, and the turn carries on.
            continue;
          }

          if (event.type === "error") throw new Error(event.error ?? "api.rileyDown");

          if (event.type === "attach") {
            const next: ChatAttachments = {
              products: event.products ?? [],
              info: event.info ?? [],
              chips: event.chips ?? [],
              actions: event.actions ?? [],
            };
            // The one action Riley performs rather than proposes. It runs
            // here, in the browser, because the basket is localStorage — the
            // server has no way to reach it and no business knowing what's
            // in it.
            //
            // The confirmation is the count on the Cart tab and the total on
            // the bar at the foot, both of which move on the same render. It
            // used to be the full basket drawer flying open over the panel,
            // which buried the conversation that produced it.
            for (const action of next.actions.slice(ranActions)) {
              if (action.type === "add_to_basket") {
                addItem(action.slug, action.quantity, action.options);
              }
            }
            ranActions = next.actions.length;
            sawAnything = true;
            write({ attach: next });
            setChips(next.chips);
            continue;
          }

          if (event.type === "text" && typeof event.text === "string") {
            sawAnything = true;
            // The loader gives way to the words themselves. Running both — a
            // bubble filling up with a spinner underneath it — says the same
            // thing twice and the second one is wrong.
            setThinking(false);
            write({ text: event.text });
          }
        }
      }

      if (!sawAnything) throw new Error("api.rileyNoReply");
    } catch (askError) {
      const reason =
        askError instanceof Error ? askError.message : "checkout.somethingWentWrong";
      setError(reason);
      // Nothing arrived, so nothing happened: the turn is taken back out of
      // the thread and the composer refilled with what they typed, so retrying
      // is one tap rather than retyping. Once part of a reply is on screen it
      // stays — pulling a half-finished answer out from under someone reading
      // it is worse than leaving it with an error beneath.
      if (!sawAnything) {
        setDraft(text);
        setEntries((prior) => prior.filter((entry) => entry.id !== id));
      }
    } finally {
      setThinking(false);
    }
  }

  function sendDraft() {
    const text = draft.trim();
    if (!text || thinking) return;
    // Resolved before the box is cleared: `resolve` keeps only the mentions
    // whose text survived editing, and there is no text to check afterwards.
    const mentioned = mentions.resolve(text);
    setDraft("");
    mentions.clear();
    void ask(text, mentioned);
  }

  // The opening topics until the conversation starts, then whatever Riley
  // offered on her last reply. Either way they sit above the composer and read
  // as something you might say — which is what they are.
  // The opening topics are keys, so they are asked in the visitor's own
  // language. Riley's own follow-up chips come back from her already written
  // in it, so they pass through as they are.
  // Which view is actually on screen, derived rather than stored.
  //
  // Three rules the panel would otherwise need effects for, and effects that
  // set state from other state are how a panel ends up briefly showing the
  // wrong thing. A placed order always wins — the sheet's own status is the
  // truth about that, not a flag this component set afterwards. A cart that
  // has emptied (removed the last line, or a tab elsewhere cleared it) has no
  // cart or checkout view left to show — but it does still have a picker,
  // since filling an empty basket is exactly what that screen is for. And a
  // picker with no item in it isn't a screen at all.
  const configured = configuring ? getProduct(configuring) : undefined;
  // The order this session placed, if it placed one. It outlives the
  // confirmation screen on purpose: once that has been dismissed the bar at
  // the foot of the conversation keeps offering to track it.
  const placed = checkout.status === "placed" ? checkout.placed : null;
  const confirming = placed !== null && placed.id !== acknowledged;
  const shown =
    confirming
      ? "done"
      : view === "configure"
        ? configured
          ? "configure"
          : "chat"
        : // Tracking needs an order to track. There is one for as long as this
          // session has placed one, so this only catches a view left over
          // after the record went (a cleared history in another tab).
          view === "track"
          ? placed
            ? "track"
            : "chat"
          : // A basket that emptied under a checkout (the last line removed, or
            // another tab cleared it) falls back to the bag, not the
            // conversation. The bag has something to say about being empty; the
            // conversation would just be where you suddenly are.
            itemCount === 0 && view === "checkout"
            ? "cart"
            : view;

  const suggestions =
    entries.length === 0 ? TOPICS.map((key) => t(key)) : chips;
  // Not while the @ picker is open. Two stacked lists over one input is a
  // panel arguing with itself, and the one the visitor is actively typing into
  // wins.
  const showChips = suggestions.length > 0 && !thinking && mentions.query === null;
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
        // cb-chat-surface redefines the palette for everything inside, which
        // is what lets the basket and the whole checkout take the panel's
        // neutral greys and its blue without a second copy of any of those
        // components. It follows the theme switch like everything else — light
        // sheet in light, dark sheet in dark. See globals.css.
        className={`cb-chat-surface mb-3 flex w-[calc(100vw-2.5rem)] max-w-[344px] origin-bottom-right flex-col overflow-hidden rounded-3xl border border-line-faint bg-panel shadow-[0_16px_44px_rgba(0,0,0,0.34)] transition-all duration-200 ease-out ${
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
            
            --cb-panel rather than a fill of its own, which inside the chat
            surface is the palest ground in light and the deepest one in dark.
            Either way it sits a step apart from the thread below it without
            being the brightest object on the screen, which is the one thing a
            chat header shouldn't be. */}
        <div className="flex items-center gap-2.5 border-b border-line-faint bg-panel px-3.5 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-raise">
            <Image src="/icon.svg" alt="" width={20} height={20} unoptimized className="object-contain" />
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="m-0 text-[14px] font-medium leading-tight text-heading"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              Riley
            </p>
            <p className="m-0 text-[11px] leading-tight text-muted">
              Corner Bagel
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("chat.close")}
            className="cb-press -mr-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-raise hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Chat / Cart, as a segmented control.
            It used to appear only once there was something in the basket, on
            the grounds that an empty tab is a promise the panel hasn't earned.
            That was the wrong read: the tab isn't a promise about the basket,
            it's the map of the panel, and a control that materialises after
            your first tap is a control you have to discover twice. It's here
            from the start, with the count on it — zero included. */}
        {shown !== "done" && shown !== "configure" && shown !== "track" ? (
          <div className="flex gap-1 border-b border-line-faint bg-panel p-1.5">
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
                      {/* The green dot means "there's something in here", so
                          it only shows when there is. On an empty bag it would
                          be a status light reporting nothing. */}
                      {itemCount > 0 ? (
                        <span
                          aria-hidden
                          className="h-[6px] w-[6px] rounded-full"
                          style={{ backgroundColor: "var(--cb-chat-good)" }}
                        />
                      ) : null}
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
              // Back to Riley, not out of the panel. Closing was standing in
              // for a dismissal this component couldn't express — the order is
              // still placed, so without marking it read the confirmation just
              // came back. Now it is marked read and the conversation is where
              // you land, with the order still one tap away on the bar below.
              onDone={() => {
                if (checkout.placed) setAcknowledged(checkout.placed.id);
                setView("chat");
              }}
              // Track order goes to a full page, so the panel comes off with
              // it rather than floating over the thing it just sent you to.
              onLeave={() => {
                if (checkout.placed) setAcknowledged(checkout.placed.id);
                setView("chat");
                setOpen(false);
              }}
            />
          </div>
        ) : shown === "track" && placed ? (
          <div className="max-h-[70vh] overflow-y-auto bg-cream">
            <ChatTrack
              id={placed.id}
              onBack={() => setView("chat")}
              onLeave={() => {
                setView("chat");
                setOpen(false);
              }}
            />
          </div>
        ) : shown === "configure" && configured ? (
          <div className="max-h-[70vh] overflow-y-auto bg-cream">
            <ChatConfigure
              product={configured}
              onAdd={(options, quantity) => {
                addItem(configured.slug, quantity, options);
                // Back to the conversation rather than into the basket. The
                // thread is where they were, the cart bar at its foot has
                // already moved, and a picker that ended by showing you the
                // basket would make ordering two sandwiches a round trip
                // through a screen you didn't ask for.
                setConfiguring(null);
                setView("chat");
              }}
              onBack={() => {
                setConfiguring(null);
                setView("chat");
              }}
            />
          </div>
        ) : shown === "cart" ? (
          <div className="max-h-[62vh] overflow-y-auto bg-cream">
            <ChatCart onCheckout={() => setView("checkout")} />
          </div>
        ) : shown === "checkout" ? (
          <div className="max-h-[70vh] overflow-y-auto bg-cream">
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
          {/* Nothing said yet. A centred block rather than a greeting bubble
              from Riley: a bubble is a turn in a conversation, and the
              conversation hasn't started — it also puts the first thing you
              read hard against the top-left of an otherwise empty panel. This
              sits in the middle of the space it's explaining. */}
          {entries.length === 0 && !thinking ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
              <span
                aria-hidden
                className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-raise text-ink"
              >
                <SparkIcon />
              </span>
              <p className="m-0 text-[15px] font-medium leading-tight text-ink">
                {t("chat.emptyTitle")}
              </p>
              <p className="m-0 mt-1.5 max-w-[15rem] text-[12px] leading-[1.5] text-muted">
                {t("chat.emptyBody")}
              </p>
            </div>
          ) : null}

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
                {/* No bubble until there are words in it.

                    Attachments arrive on their own line and often land before
                    the first token of the sentence that introduces them, which
                    used to draw an empty bubble the size of its own padding —
                    a little grey tab sitting above the loader, which is
                    exactly as odd as it sounds. */}
                {entry.text.length > 0 ? (
                  <div className="flex items-end gap-2">
                    <BagelAvatar hidden={continues} />
                    {/* RichText, not raw text in a pre-wrap bubble. Models
                        write markdown by default, and printing it verbatim is
                        how "**The Veggie Stack** — $15.50" reached the screen
                        with its asterisks showing. */}
                    <div className={BOT_BUBBLE}>
                      <RichText text={entry.text} />
                    </div>
                  </div>
                ) : null}

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
                      // Anything with a choice on it opens the choices, in
                      // here. This is the last place the panel handed you off
                      // to the website: the card used to link out to
                      // /shop/product/… the moment an item needed a bagel
                      // picked, which is the one step of ordering that wasn't
                      // a conversation.
                      onConfigure={(product: ProductCard) => {
                        setConfiguring(product.slug);
                        setView("configure");
                      }}
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
              {/* The merging loader, and nothing beside it. There used to be
                  an elapsed-time counter here, on the theory that a number
                  still moving proves the wait is real — but a stopwatch on
                  somebody else's reply only ever counts upward, and now that
                  the reply streams in as it's written, the words themselves
                  arrive long before the number would have been reassuring. */}
              {/* Deliberately shorter than a reply, not the same height.
                  Matching a one-line bubble was the wrong target: a typing
                  indicator the size of a message reads as a message that
                  failed to load. This is about two thirds of one, which is
                  where every messaging app puts it.

                  leading-none is load-bearing: the bubble's 1.5 line-height
                  reserves room for descenders this box has no text in, and
                  without it the padding below is fighting six pixels of
                  invisible type. */}
              <span className={`${BOT_BUBBLE} py-[6px] leading-none text-faint`}>
                <MergingDots label={t("chat.typing")} />
              </span>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="m-0 px-1 text-[11px] leading-[1.4]" style={{ color: ERROR_RED }}>
              {st(error)}
            </p>
          ) : null}
        </div>

        {/* The @ picker takes the composer's shoulder when it's open, and the
            quick replies stand down while it does — two stacked lists above
            one input is a panel arguing with itself. */}
        <MentionList state={mentions} onSyncCaret={() => inputRef.current?.focus()} />

        {/* Quick replies, docked above the composer rather than sitting in the
            thread. In the thread they read as something Riley said; here they
            read as something you might say next, which is what they are —
            and they don't shove the greeting up the screen. */}
        {showChips ? (
          <div className="flex flex-wrap justify-end gap-1.5 border-t border-line-faint bg-panel px-3 pt-2.5">
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
          className={`flex items-center gap-2 bg-panel px-3 pb-3 ${
            showChips ? "pt-2" : "border-t border-line-faint pt-3"
          }`}
        >
          <input
            ref={inputRef}
            type="text"
            aria-label={t("chat.typeMessage")}
            // Both of these were hardcoded English, on the one screen whose
            // whole point is answering in the visitor's language.
            placeholder={thinking ? `${t("chat.typing")}…` : t("chat.askAnything")}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              mentions.syncCaret(event.target);
            }}
            // The picker owns the arrows, enter and escape while it's open;
            // everything else falls through to the form, so typing never stops
            // being typing.
            onKeyDown={(event) => mentions.onKeyDown(event)}
            onClick={(event) => mentions.syncCaret(event.currentTarget)}
            // Off, all four: an @ picker over a browser's own autofill list is
            // two menus fighting for the same rectangle, and none of the four
            // has anything useful to say about a message to a bagel shop.
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
            spellCheck={false}
            // A filled field rather than an outlined pill: the outline was a
            // third rounded rectangle in a stack of them, and the fill sets
            // the input apart from the bubbles without adding another rule.
            // 16px so iOS doesn't zoom the page when it takes focus.
            className="h-9 min-w-0 flex-1 rounded-full bg-surface px-3.5 text-[16px] text-ink outline-none transition-shadow placeholder:text-quiet focus:shadow-[inset_0_0_0_1.5px_var(--cb-chat-accent)] sm:text-[13px]"
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
                ? "cursor-pointer border-chat-accent bg-chat-accent text-white hover:opacity-90"
                : "cursor-default border-line-soft bg-transparent text-quiet"
            }`}
          >
            <SendArrowIcon />
          </button>
        </form>
        </>
        )}

        {/* The bar at the foot of the conversation, and what it says depends
            on what there is to do next.

            A basket in progress outranks an order already placed: the live
            thing is the one you are still deciding about, and by the time an
            order exists the basket it came from has been cleared, so the two
            only compete once somebody starts a second order.

            Only in the conversation. In the cart it would sit under the
            subtotal saying the same number twice, and in the checkout it would
            compete with the button that actually places the order. */}
        {shown !== "chat" ? null : itemCount > 0 ? (
          <button
            type="button"
            onClick={() => setView("cart")}
            className="cb-press flex w-full cursor-pointer items-center justify-center gap-2 border-t border-line-faint bg-chat-accent px-4 py-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          >
            {t("chat.cartTotal", { total: formatPrice(subtotalCents) })}
          </button>
        ) : placed ? (
          // Where the confirmation went. Dismissing it shouldn't lose the
          // order, and following this doesn't leave the panel either: tracking
          // is a view in here now, for the same reason the basket and the
          // checkout are. Being sent to a page for the last step of ordering
          // in a chat was the one handoff left.
          <button
            type="button"
            onClick={() => setView("track")}
            className="cb-press flex w-full cursor-pointer items-center justify-center gap-2 border-t border-line-faint bg-chat-accent px-4 py-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          >
            {t("chat.trackOrder", { id: placed.id })}
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
