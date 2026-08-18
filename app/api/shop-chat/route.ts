import Anthropic from "@anthropic-ai/sdk";
import { formatPrice, getProduct } from "../../shop/products";
import { shopPhoneLabel } from "../../shopFacts";
import { buildSystemPrompt, languageInstruction, RILEY_MAX_TOKENS } from "./riley";
import { noEmDashes, scrubPartial } from "./scrub";
import { clientIp, throttle } from "../../rateLimit";
import { readContext } from "./context";
import { translate } from "../../i18n/strings";
import { localeById } from "../../localeScript";
import {
  emptyAttachments,
  RILEY_TOOLS,
  runTool,
  type ChatAttachments,
  type ToolContext,
} from "./tools";

// Riley — the shop's chat, answered by Claude rather than by the team.
//
// The widget (app/shop/ChatWidget.tsx) posts the whole visible thread here on
// every turn. That's deliberate: the API is stateless, there is no session
// store, and the thread is short enough that resending it costs less than
// standing up somewhere to keep it. It also means a reload starts fresh,
// which is the honest behaviour — nothing was being remembered anyway.
//
// She has tools (see ./tools.ts), so this runs an agentic loop rather than a
// single call: ask, run whatever she reaches for, hand the results back, ask
// again, until she has an answer. Two things fall out of that.
//
// First, the answer is grounded. Prices, allergens, opening hours and delivery
// quotes come from the same modules the shop itself uses, so "that's $17.00"
// is the number the till will ring rather than a number she remembered.
//
// Second, the reply is more than text. Tool calls also carry *attachments* —
// product cards, an hours card, a delivery quote, quick replies, a basket
// action — which the widget renders instead of Riley describing a menu in
// prose with asterisks around the names.
//
// ——— On the wire ———
//
// This answers newline-delimited JSON rather than one object at the end, and
// that is the whole latency story. A turn is: think, reach for a tool, read
// the result, write. Holding all of it back means six to eight seconds of a
// visitor watching a loader with nothing in it. Streaming doesn't make any of
// those steps quicker; it stops the wait being spent on a blank panel.
//
// Every line is a *snapshot*, not a delta:
//
//   {"type":"text","text":"…the whole reply so far…"}
//   {"type":"attach","products":[…],"info":[…],"chips":[…],"actions":[…]}
//   {"type":"error","error":"api.rileyDown"}
//
// Snapshots because the client then has no reassembly to get wrong, a dropped
// line costs a frame instead of corrupting a sentence, and the em-dash scrub
// below can rewrite text it has already sent. They are small — a reply is a
// few hundred bytes — so sending the whole thing each time is cheaper than the
// bugs the alternative buys.
//
// Errors travel as events on a 200 rather than as status codes, because by the
// time one happens the response has usually started. One shape for the client
// to handle beats two.

// Sonnet rather than Opus, and this is the second half of the latency work.
//
// Riley is a shop concierge: she looks things up with tools and writes three
// sentences about a bagel. The reasoning that Opus is worth paying for doesn't
// show up in that job, and the difference in time-to-first-token does — it is
// the single biggest lever on this route after streaming. The tools are what
// make her answers right; the model mostly has to write them down.
//
// Overridable, so this is a config decision rather than a code one: set
// RILEY_MODEL to any model id to move her without a deploy of this file.
const MODEL = process.env.RILEY_MODEL ?? "claude-sonnet-5";

// Where a turn goes when the one above doesn't answer at all. Opus, because
// it is what this route ran on before and is known to work against this key —
// a fallback whose only job is to be the boring option.
const FALLBACK_MODEL = process.env.RILEY_FALLBACK_MODEL ?? "claude-opus-5";

// Bounds one conversation. Long enough for a real back-and-forth about an
// order, short enough that a stuck loop or a pasted wall of text can't run up
// a bill. Trimmed from the front, so the recent turns survive.
const MAX_TURNS = 24;
const MAX_MESSAGE_CHARS = 2000;

// Bounds one *reply*. Riley's tools are all cheap reads, so a well-behaved
// turn is one or two rounds — search the menu, then show the cards. Six is
// generous headroom; past that something is looping, and the loop is on our
// bill and the visitor's clock.
const MAX_TOOL_ROUNDS = 6;

// ——— And bounds one *caller* ———
//
// Everything above bounds a conversation somebody is having. None of it bounds
// a script, and until this existed there was nothing that did: the route takes
// no session, asks for no key, and every turn spends money. One turn is up to
// seven model rounds with the whole menu in the prompt, and the tools reach
// Google and Uber on top of that. A loop against this endpoint spends three
// vendors' budgets at once.
//
// Two counts, because the two costs are different sizes. A turn is cents; a
// courier quote is a billed call to Uber and it is the one thing here that a
// script could point at a list of ten thousand addresses. So the quote gets
// its own, much smaller allowance, and a caller who burns it can still talk to
// Riley about the menu.
//
// Both are generous against a real visitor. Thirty messages in ten minutes is
// a long conversation typed fast; six delivery checks in an hour is somebody
// who moved house twice. See app/rateLimit.ts for why an in-memory limiter is
// worth having anyway.
const TURNS = throttle({ windowMs: 10 * 60_000, max: 30 });
const QUOTES = throttle({ windowMs: 60 * 60_000, max: 6 });

// Tools that hand nothing back to Riley.
//
// These three put something on the visitor's screen and return {ok: true} or
// a list of the names she just chose herself. Nothing in that is new
// information, which means a round that called only these has taught her
// nothing and the next round has nothing to go on.
//
// ——— The doubled sentence ———
//
// That round used to run anyway, and what came back was the visitor reading
// "What sounds good today? What sounds good today?". She had written her
// reply, called suggest_replies to put chips on screen, been handed {ok:
// true}, and had nothing left to say but her own closing line a second time.
// Both halves landed in the same bubble because the reply accumulates across
// rounds.
//
// Ending the turn here is not only the fix, it is the cheaper path: that
// round was a whole model request, with the menu in the prompt, spent on
// restating a sentence already on screen.
const SILENT_TOOLS = new Set(["suggest_replies", "open_screen", "show_items"]);

type Turn = { role: "user" | "assistant"; text: string };

function isTurn(value: unknown): value is Turn {
  if (typeof value !== "object" || value === null) return false;
  const turn = value as Partial<Turn>;
  return (
    (turn.role === "user" || turn.role === "assistant") &&
    typeof turn.text === "string" &&
    turn.text.trim().length > 0
  );
}

// The key is read per-request rather than at module load so the route can
// answer honestly when it's missing, instead of the whole module failing to
// import and every message returning a 500 with nothing to explain it.
function client(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return apiKey ? new Anthropic({ apiKey }) : null;
}

function merge(into: ChatAttachments, from: Partial<ChatAttachments> | undefined) {
  if (!from) return;
  if (from.products) {
    // Deduplicated by slug, because these accumulate across rounds and the
    // rail keys its cards on the slug. Riley calling show_items twice in one
    // turn with an item in common — "a sandwich and a drink", then "and this
    // one goes well with it" — put the same card in twice, which is two React
    // children with the same key and two Add buttons for one bagel. The first
    // mention wins, so the order she chose is kept.
    const seen = new Set(into.products.map((card) => card.slug));
    for (const card of from.products) {
      if (seen.has(card.slug)) continue;
      seen.add(card.slug);
      into.products.push(card);
    }
  }
  if (from.info) {
    // Identical panels collapse, for the same reason. check_hours asked twice
    // in one turn returns the same answer twice, and two copies of "Open now"
    // stacked under one reply is not more information. Compared by content, so
    // two delivery panels for two different addresses both stand.
    const seen = new Set(into.info.map((card) => JSON.stringify(card)));
    for (const card of from.info) {
      const key = JSON.stringify(card);
      if (seen.has(key)) continue;
      seen.add(key);
      into.info.push(card);
    }
  }
  if (from.actions) into.actions.push(...from.actions);
  // Chips replace rather than accumulate: two sets of quick replies stacked
  // under one message is a menu, and the last word should win.
  if (from.chips) into.chips = from.chips;
}

// An upstream failure, reduced to the two things worth knowing and nothing
// else. A status and an error type ("not_found_error", "invalid_request_error",
// "authentication_error") say what went wrong; the message that comes with them
// can name the model, the account or the request, so it is logged and never
// returned.
function describeFailure(error: unknown): { status?: number; type?: string } {
  if (error instanceof Anthropic.APIError) {
    const body = error.error as { type?: string; error?: { type?: string } } | undefined;
    return { status: error.status, type: body?.error?.type ?? body?.type };
  }
  return {};
}

type Send = (event: Record<string, unknown>) => void;

// Runs `turn` against a stream of NDJSON lines.
//
// Everything is enqueued through `send`, and the stream closes exactly once —
// including when `turn` throws, which is what keeps a browser from sitting on
// an open connection to a route that has already given up.
function ndjson(turn: (send: Send) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send: Send = (event) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        await turn(send);
      } catch (error) {
        // Logged, not returned: an upstream error message can name the model,
        // the account, or the request — none of which belongs in a chat
        // bubble.
        console.error("[shop-chat] Riley failed to reply", error);
        send({ type: "error", error: "api.rileyDown" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Tells an nginx in front of this not to sit on the response until it's
      // complete, which would undo the streaming entirely and be invisible in
      // development.
      "X-Accel-Buffering": "no",
    },
  });
}

// A bisection of Riley's own request, one addition at a time.
//
// The first version of this asked three questions — can the key reach the
// model, can it stream, can it reach the fallback — and all three came back
// yes while the chat stayed broken. That is exactly as useful as it sounds,
// and the lesson is that a probe which doesn't send what the real request
// sends can only ever rule things out.
//
// So each rung below is the one above it plus one thing: the thinking budget,
// then the effort, then the tools, then the cached briefing, then a
// conversation that ends the way a real one does. Whichever rung is the first
// to fail names the feature that broke, and the last two rungs are the real
// request in both shapes.
//
// Safe to expose. Every failure is reduced to a status and an error type; the
// message that comes with one can name the model, the account or the request,
// so it is logged and never returned. A handful of small calls, and after the
// first the briefing is a cache hit.
export async function GET() {
  const configured = client();
  if (!configured) return Response.json({ configured: false });
  const anthropic = configured;

  const hello = [{ role: "user" as const, content: "Say ok." }];

  const rungs: [string, Anthropic.Beta.MessageCreateParamsNonStreaming][] = [
    ["plain", { model: MODEL, max_tokens: 16, messages: hello }],
    [
      "thinking",
      {
        model: MODEL,
        max_tokens: RILEY_MAX_TOKENS,
        thinking: { type: "adaptive" },
        messages: hello,
      },
    ],
    [
      "effort",
      {
        model: MODEL,
        max_tokens: RILEY_MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        messages: hello,
      },
    ],
    [
      "tools",
      {
        model: MODEL,
        max_tokens: RILEY_MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        tools: RILEY_TOOLS,
        messages: hello,
      },
    ],
    [
      "briefing",
      {
        model: MODEL,
        max_tokens: RILEY_MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        tools: RILEY_TOOLS,
        system: [
          {
            type: "text",
            text: buildSystemPrompt(),
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: "The customer's order is set to: Pickup, Corner Bagel." },
        ],
        messages: hello,
      },
    ],
  ];

  async function run(params: Anthropic.Beta.MessageCreateParamsNonStreaming, streaming: boolean) {
    try {
      if (streaming) {
        await anthropic.beta.messages.stream(params).finalMessage();
      } else {
        await anthropic.beta.messages.create(params);
      }
      return { ok: true };
    } catch (error) {
      console.error("[shop-chat] probe failed", describeFailure(error), error);
      return { ok: false, ...describeFailure(error) };
    }
  }

  const results: Record<string, unknown> = {};
  for (const [name, params] of rungs) results[name] = await run(params, false);
  // The top rung in the shape a real turn uses.
  results.streaming = await run(rungs[rungs.length - 1][1], true);
  results.fallbackModel = await run(
    { ...rungs[rungs.length - 1][1], model: FALLBACK_MODEL },
    false,
  );

  return Response.json({
    configured: true,
    model: MODEL,
    fallback: FALLBACK_MODEL,
    ...results,
  });
}

export async function POST(request: Request) {
  // Before the body is even read: the parse is the cheapest thing here and
  // refusing early is the point.
  const caller = clientIp(request);
  if (TURNS.exceeded(caller)) {
    // As an ndjson error rather than a 429, like every other failure on this
    // route. The widget throws away the status and reads the event, so a 429
    // would reach the visitor as the generic "Riley couldn't answer" instead
    // of the sentence that tells them what actually happened.
    return ndjson(async (send) => send({ type: "error", error: "api.rileyTooFast" }));
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return ndjson(async (send) => send({ type: "error", error: "api.badJson" }));
  }

  const body = payload as {
    messages?: unknown;
    context?: unknown;
    mentions?: unknown;
    locale?: unknown;
  } | null;

  const rawTurns = Array.isArray(body?.messages) ? body.messages : [];
  const kept = rawTurns
    .filter(isTurn)
    .map((turn) => ({ role: turn.role, text: turn.text.slice(0, MAX_MESSAGE_CHARS) }));
  const turns = kept.slice(-MAX_TURNS);
  // Whether the front of the conversation was cut off. Riley is told, further
  // down, because otherwise she can't tell: a trimmed thread looks exactly
  // like a short one, and the thing most likely to have been said at the top
  // and needed at the bottom is a diet or an allergy. Her briefing tells her
  // to hold on to those for the whole conversation, and silently deleting the
  // turn where somebody said "I'm vegan" is how she offers them the lox.
  const trimmed = kept.length > turns.length;

  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    return ndjson(async (send) => send({ type: "error", error: "api.typeMessage" }));
  }

  // What they pinned with @, resolved here rather than trusted.
  //
  // The request carries slugs; the names come from the catalog. That ordering
  // is the whole security of it — a crafted request can name a slug that
  // doesn't exist (dropped) but cannot put words in the visitor's message,
  // because nothing the client sent is echoed into the prompt.
  //
  // Capped at six. Anything past that is not somebody talking about their
  // breakfast.
  const mentioned = (Array.isArray(body?.mentions) ? body.mentions : [])
    .filter((slug): slug is string => typeof slug === "string")
    .slice(0, 6)
    .map((slug) => getProduct(slug))
    .filter((product): product is NonNullable<typeof product> => product !== undefined);

  if (mentioned.length > 0) {
    // Appended to the message it belongs to rather than sent as its own turn:
    // it is a footnote on what they just said, and a separate turn would read
    // as a second thing they said.
    const last = turns[turns.length - 1];
    const named = mentioned
      .map((product) => `${product.name} (${product.slug}, ${formatPrice(product.priceCents)})`)
      .join("; ");
    last.text = `${last.text}\n\n[They picked these off the menu with @: ${named}. Those are the exact items, so you don't need to search for them.]`;
  }

  const language =
    typeof body?.locale === "string" ? languageInstruction(body.locale) : null;

  // ——— The one route that does know the visitor's language ———
  //
  // Every other route answers with a key and lets the screen say the words,
  // because a route has no locale. This one has: the widget sends it so Riley
  // knows which language to answer in. Which makes the four sentences below
  // *hers*, written here rather than by the model, the only place in the app
  // where a server can and therefore must translate. They shipped as English
  // literals and went into the bubble that way, so a Korean conversation
  // ended in "That took longer than it should have, ask me again?".
  const locale = localeById(typeof body?.locale === "string" ? body.locale : "en").id;
  const say = (key: Parameters<typeof translate>[1], vars?: Record<string, string>) =>
    translate(locale, key, vars);

  const anthropic = client();
  if (!anthropic) {
    // No key configured. Sent as Riley's own reply rather than as an error, so
    // a visitor gets a sentence they can act on instead of a red line next to
    // the bubble they just sent.
    return ndjson(async (send) =>
      send({
        type: "text",
        text: say("chat.rileyUnavailable", { phone: shopPhoneLabel() }),
      }),
    );
  }

  // Where the order is going, if the visitor has chosen — the difference
  // between "when will it get here" and "when can I collect it".
  //
  // A system *block* after the cache breakpoint, not a message. It used to be
  // pushed onto the end of `messages` as a `role: "system"` turn, on the
  // reasoning that keeping it out of the system prompt keeps the cached prefix
  // (the tools and the whole menu) byte-identical across conversations. The
  // reasoning was right and the mechanism was wrong: a conversation has to end
  // on a user turn, and this left every request ending on a system one — for
  // exactly the visitors who had chosen a location, which is everyone past the
  // fulfillment gate. That is the shape of the bug that made Riley go quiet
  // while a plain call to the same model on the same key answered fine.
  //
  // A block after the breakpoint gets the same property for free: the prefix
  // above it is untouched, so the menu stays cached, and nothing varies inside
  // the part that is.
  //
  // The sentence is composed here from a checked mode and a flattened label,
  // not taken from the caller. See readContext above.
  const context = readContext(body?.context);
  const where = context?.sentence ?? "";

  // What the tools need that the model can't be asked for: who is calling, so
  // the billed lookups can be counted against them, and where their order is
  // already going, so a delivery check about that address doesn't geocode it
  // a second time.
  const tools: ToolContext = {
    quotesLeft: () => !QUOTES.exceeded(caller),
    destination: context?.destination,
    orderAt: context?.orderAt,
  };

  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((turn) => ({
    role: turn.role,
    content: turn.text,
  }));

  return ndjson(async (send) => {
    const attachments = emptyAttachments();
    // Across rounds, not per round: she may write a line, look something up,
    // and carry on writing, and that is one reply to whoever is reading it.
    //
    // Two buffers, not one. `written` is what she has finished saying;
    // `pending` is the round in flight, which is not folded in until the round
    // ends and it has been checked. See append() and settle().
    let written = "";
    let pending = "";
    let sent = "";

    // The reply as it stands. Rounds are paragraphs: glued, the last sentence
    // of one ran into the first of the next, and then SENTENCE_RUN_ON in the
    // scrub — which exists to repair "checkout?Just tap" — inserted a space
    // and made the join invisible. A repair applied across a seam hides the
    // seam, so the break goes in first.
    const joined = () =>
      pending && written && !written.endsWith("\n\n")
        ? `${written}\n\n${pending}`
        : `${written}${pending}`;

    const flush = () => {
      const next = scrubPartial(joined());
      if (next === sent) return;
      sent = next;
      send({ type: "text", text: next });
    };

    // ——— What streams live, and what waits ———
    //
    // The first thing she writes in a turn streams token by token: that is the
    // whole latency story on this route, and it covers the common shape where
    // she looks something up in round one and writes the answer in round two,
    // because nothing is on screen yet when that answer starts.
    //
    // A round that writes *after* she has already written does not stream. It
    // is held until the round ends, because until then there is no way to know
    // it is not a restatement — and a restatement that streams appears on
    // screen in full and is then taken back, which is a flicker of doubled
    // text where there used to be a permanently doubled sentence. The cost is
    // that a continuation lands in one go; it is a sentence, and it comes
    // after a tool call the visitor already waited on.
    const append = (chunk: string) => {
      if (!chunk) return;
      pending += chunk;
      if (!written) flush();
    };

    // End of a round: keep what it wrote, or drop it if it only said again
    // what is already on screen. There is no reading of a chat reply where the
    // same sentence twice in one bubble was meant, so this does not have to be
    // clever to be safe.
    const settle = () => {
      const said = pending.trim();
      if (said && !written.trimEnd().endsWith(said)) written = joined();
      pending = "";
      flush();
    };

    // One turn's request, minus the two things that are allowed to vary when
    // the first attempt fails. Everything above `model` is frozen and ordered
    // because tools render before system, and churn in either invalidates the
    // cached menu behind them.
    const request = (model: string) =>
      ({
        model,
        max_tokens: RILEY_MAX_TOKENS,
        // Thinking stays on — disabling it on these models can leak <thinking>
        // tags into the visible reply, and worse for a tool-using chat, it can
        // put a tool call in the visible text where it silently never runs.
        thinking: { type: "adaptive" as const },
        // medium, not low. Low scopes work to exactly what was asked and
        // reaches for tools noticeably less — the wrong trade now that
        // reaching for a tool is how she gets a price right.
        output_config: { effort: "medium" as const },
        tools: RILEY_TOOLS,
        // The briefing is the same on every request and is most of the tokens,
        // so it's cached. The breakpoint on the last system block covers the
        // tools too. Anything that varies goes after it, never inside it.
        system: [
          {
            type: "text" as const,
            text: buildSystemPrompt(),
            cache_control: { type: "ephemeral" as const },
          },
          // After the breakpoint, and only when there is one: the chosen
          // language, and where the order is going. Putting either inside the
          // block above would give every language and every pickup counter its
          // own cache entry of the whole menu, and English collecting from the
          // flagship — which needs no instruction at all — would pay for the
          // machinery on every request.
          ...(language ? [{ type: "text" as const, text: language }] : []),
          ...(where ? [{ type: "text" as const, text: where }] : []),
          ...(trimmed
            ? [
                {
                  type: "text" as const,
                  text:
                    "This conversation is longer than what you can see. The earliest " +
                    "turns have been dropped to keep it a manageable length, so if " +
                    "something they told you seems to be missing, an allergy, a diet, a " +
                    "name, ask again rather than assuming they never said it.",
                },
              ]
            : []),
        ],
        messages,
      }) satisfies Anthropic.Beta.MessageCreateParamsNonStreaming;

    // One round, streaming or not.
    //
    // The non-streaming branch exists as a recovery path, not as a feature —
    // see the retry below. It accumulates the same `written` so everything
    // downstream is identical either way; the only difference is that the
    // whole reply lands in one go instead of at reading speed.
    const round = async (model: string, streaming: boolean) => {
      pending = "";
      if (!streaming) {
        const answer = await anthropic.beta.messages.create(request(model));
        append(
          answer.content
            .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
            .map((block) => block.text)
            .join(""),
        );
        return answer;
      }
      const stream = anthropic.beta.messages.stream(request(model));
      // The only place text reaches the visitor. Fires as tokens land, so a
      // reply appears at reading speed rather than all at once when it ends.
      stream.on("text", (chunk) => append(chunk));
      return stream.finalMessage();
    };

    // What to try, and what to try if that fails.
    //
    // Riley stopped answering the moment this route started streaming on a
    // different model, and those are the only two things that changed — so
    // rather than guess which, the turn falls back across both at once: if the
    // first attempt throws before a single character has been written, it runs
    // again, not streaming, on the model that was working before.
    //
    // Once, and only once. A retry that can retry is a way to spend somebody's
    // money twice on a failure that isn't transient. GET /api/shop-chat says
    // which combination the key can actually do.
    //
    // ——— Why it no longer gives up once she's started writing ———
    //
    // The guard used to be `recovered || written`: a failure after the first
    // character rethrew, full stop. That was the right instinct and the wrong
    // rule, because it only holds for a *round* that has already put text on
    // screen. Riley's turns are several rounds long — write a line, look
    // something up, carry on writing — and a throw in round three used to end
    // the turn on whatever half-sentence had landed, with an error under it.
    // The visitor cannot tell a truncated answer from a finished one, which is
    // the failure worth caring about here.
    //
    // What made the old rule necessary was duplication: the failed attempt's
    // partial text is already in `written`, so running the round again appends
    // it twice. So `written` is snapshotted before each round and restored on
    // the way into the retry. The bubble rewinds to the last complete thought
    // and is written forward again, which is visible for a frame and correct.
    let model = MODEL;
    let streaming = true;
    let recovered = false;

    for (let index = 0; index <= MAX_TOOL_ROUNDS; index++) {
      // What is already on screen when this round starts. `written` only moves
      // at settle(), so a failed attempt cannot have changed it.
      const before = written;
      let response: Anthropic.Beta.BetaMessage | null = null;

      for (let attempt = 0; attempt < 2 && response === null; attempt++) {
        try {
          response = await round(model, streaming);
        } catch (error) {
          // `recovered` carries across rounds: once the fallback has been
          // spent, a later failure is final wherever it happens.
          const final = recovered || attempt > 0;
          console.error(
            `[shop-chat] ${model} failed on round ${index}`,
            describeFailure(error),
            final ? "— giving up" : `— retrying on ${FALLBACK_MODEL} without streaming`,
          );
          if (final) {
            // Nothing on screen at all: rethrow, so ndjson sends the error and
            // the widget takes the turn back out of the thread and refills the
            // composer. Anything else leaves an empty bubble behind.
            if (!before && attachments.products.length === 0 && attachments.info.length === 0) {
              throw error;
            }
            written = `${written}${written ? "\n\n" : ""}${say("chat.rileyLostThread")}`;
            flush();
            return;
          }
          recovered = true;
          model = FALLBACK_MODEL;
          streaming = false;
          // Drop whatever the failed attempt managed to write, so the retry
          // doesn't say the same half-sentence twice. `written` needs no
          // rewinding: a round only folds into it once it has finished.
          pending = "";
          flush();
        }
      }
      // Unreachable: the loop above either sets `response` or returns. Here to
      // convince the type checker, which can't see that.
      if (!response) return;

      // stop_reason first, always: on a refusal `content` is empty or partial,
      // and reading content[0] would throw on the one path that most needs to
      // return something sensible.
      if (response.stop_reason === "refusal") {
        send({
          type: "text",
          text: say("chat.rileyRefused", { phone: shopPhoneLabel() }),
        });
        return;
      }

      // The round is over: keep what it wrote, or drop a restatement.
      settle();

      const calls = response.content.filter(
        (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use",
      );

      if (calls.length === 0) {
        // Everything she wrote is already on screen; the trailing dash the
        // partial scrub was holding back is now safe to resolve.
        written = noEmDashes(written).trim();
        flush();
        if (!sent && attachments.products.length === 0 && attachments.info.length === 0) {
          send({ type: "error", error: "api.rileyNoReply" });
        }
        return;
      }

      // Everything she asked for in this turn, run together. The results go
      // back as one user message — splitting them across several is what
      // quietly teaches the model to stop asking for things in parallel.
      messages.push({ role: "assistant", content: response.content });

      const results = await Promise.all(
        calls.map(async (call) => {
          try {
            const outcome = await runTool(call.name, call.input, tools);
            merge(attachments, outcome.attach);
            return {
              type: "tool_result" as const,
              tool_use_id: call.id,
              content: JSON.stringify(outcome.forModel),
            };
          } catch (toolError) {
            // Returned rather than thrown: a failed lookup is something Riley
            // can work around ("I can't check that right now"), and dropping
            // the result instead would leave the conversation malformed.
            console.error(`[shop-chat] tool ${call.name} failed`, toolError);
            return {
              type: "tool_result" as const,
              tool_use_id: call.id,
              content: "That lookup failed. Tell them you couldn't check, don't guess.",
              is_error: true,
            };
          }
        }),
      );

      messages.push({ role: "user", content: results });

      // Cards, panels and basket actions go out as soon as the round that
      // produced them finishes, rather than waiting for the sentence that
      // introduces them. The rail appearing a beat before "here are three"
      // is the right way round: it's the answer, and the sentence is the
      // caption.
      send({ type: "attach", ...attachments });

      // Nothing came back that she could read, and she has already written her
      // reply. The next round would be a whole model request whose only
      // possible contribution is more of a sentence already on screen, which
      // is precisely what it used to contribute. See SILENT_TOOLS.
      //
      // Guarded on having written something: "show me sandwiches" is answered
      // by show_items alone, and that turn does need one more round to put a
      // caption under the rail.
      if (written.trim() && calls.every((call) => SILENT_TOOLS.has(call.name))) {
        written = noEmDashes(written).trim();
        flush();
        return;
      }
    }

    // Out of rounds. Whatever she attached along the way is already on screen;
    // this is the sentence to go with it.
    console.warn("[shop-chat] hit the tool-round ceiling");
    written = `${written}${written ? "\n\n" : ""}${say("chat.rileyTooLong")}`;
    flush();
  });
}
