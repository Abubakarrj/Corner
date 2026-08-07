import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, languageInstruction, RILEY_MAX_TOKENS } from "./riley";
import {
  emptyAttachments,
  RILEY_TOOLS,
  runTool,
  type ChatAttachments,
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

// No em dashes, ever.
//
// The instruction is in Riley's briefing twice, and stripping them out of the
// briefing itself does most of the work: a model mirrors the punctuation of
// the text it's given, so a prompt full of dashes is a prompt that teaches
// them. This is the belt to that pair of braces. It runs on her visible text
// only, never on tool inputs, so a dash inside an address she's looking up is
// left alone.
//
// The replacement is picked by what sits either side. A sentence already
// closed by its own punctuation just needs the space ("Good Lox Today!, the
// best one" is worse than the dash was). A capital letter after it means the
// dash was joining two sentences, so it becomes a full stop. Anything else was
// parenthetical, so it becomes a comma.
//
// A spaced en dash is doing an em dash's job and gets the same treatment. An
// unspaced one is a range ("7am-2pm") and is left alone.
const DASH = /([^\s])?\s*[\u2014\u2015]\s*(.?)/g;

export function noEmDashes(text: string): string {
  return text
    .replace(DASH, (_match, before: string | undefined, after: string) => {
      const lead = before ?? "";
      if (/[.!?:;,]/.test(lead)) return `${lead} ${after}`;
      const joinsSentences =
        after.length > 0 && after === after.toUpperCase() && after !== after.toLowerCase();
      return `${lead}${joinsSentences ? ". " : ", "}${after}`;
    })
    .replace(/ \u2013 /g, ", ");
}

// The scrub above decides what to put in a dash's place by looking at the
// character *after* it — which, mid-stream, may not have arrived. A dash at
// the very end would become a comma on one frame and a full stop on the next,
// visibly, so a trailing one is held back until the next chunk says what it
// was joining.
function scrubPartial(text: string): string {
  return noEmDashes(text.replace(/[\u2014\u2015\u2013]\s*$/, ""));
}

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
  if (from.products) into.products.push(...from.products);
  if (from.info) into.info.push(...from.info);
  if (from.actions) into.actions.push(...from.actions);
  // Chips replace rather than accumulate: two sets of quick replies stacked
  // under one message is a menu, and the last word should win.
  if (from.chips) into.chips = from.chips;
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

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return ndjson(async (send) => send({ type: "error", error: "api.badJson" }));
  }

  const body = payload as {
    messages?: unknown;
    context?: unknown;
    locale?: unknown;
  } | null;

  const rawTurns = Array.isArray(body?.messages) ? body.messages : [];
  const turns = rawTurns
    .filter(isTurn)
    .map((turn) => ({ role: turn.role, text: turn.text.slice(0, MAX_MESSAGE_CHARS) }))
    .slice(-MAX_TURNS);

  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    return ndjson(async (send) => send({ type: "error", error: "api.typeMessage" }));
  }

  const language =
    typeof body?.locale === "string" ? languageInstruction(body.locale) : null;

  const anthropic = client();
  if (!anthropic) {
    // No key configured. Sent as Riley's own reply rather than as an error, so
    // a visitor gets a sentence they can act on instead of a red line next to
    // the bubble they just sent.
    return ndjson(async (send) =>
      send({
        type: "text",
        text: "Riley can't answer right now. Email cornerbagel@publicentity.co and a person will get back to you.",
      }),
    );
  }

  // Where the order is going, if the visitor has chosen — the difference
  // between "when will it get here" and "when can I collect it". Sent as a
  // mid-conversation system message rather than folded into the system prompt
  // so the cached prefix (the tools and the whole menu) stays byte-identical
  // across every conversation. It has to follow a user turn and be last, which
  // is exactly where it sits.
  const where = typeof body?.context === "string" ? body.context.slice(0, 200) : "";

  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((turn) => ({
    role: turn.role,
    content: turn.text,
  }));
  if (where) {
    messages.push({
      role: "system",
      content: `The customer's order is set to: ${where}.`,
    });
  }

  return ndjson(async (send) => {
    const attachments = emptyAttachments();
    // Across rounds, not per round: she may write a line, look something up,
    // and carry on writing, and that is one reply to whoever is reading it.
    let written = "";
    let sent = "";

    const flush = () => {
      const next = scrubPartial(written);
      if (next === sent) return;
      sent = next;
      send({ type: "text", text: next });
    };

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const stream = anthropic.beta.messages.stream({
        model: MODEL,
        max_tokens: RILEY_MAX_TOKENS,
        // Thinking stays on — disabling it on these models can leak <thinking>
        // tags into the visible reply, and worse for a tool-using chat, it can
        // put a tool call in the visible text where it silently never runs.
        thinking: { type: "adaptive" },
        // medium, not low. Low scopes work to exactly what was asked and
        // reaches for tools noticeably less — the wrong trade now that
        // reaching for a tool is how she gets a price right.
        output_config: { effort: "medium" },
        // Tools render *before* system, so this array is frozen and ordered:
        // any churn in it invalidates the cached menu behind it.
        tools: RILEY_TOOLS,
        // The briefing is the same on every request and is most of the tokens,
        // so it's cached. The breakpoint on the last system block covers the
        // tools too. Anything that varies goes after it, never inside it.
        system: [
          {
            type: "text",
            text: buildSystemPrompt(),
            cache_control: { type: "ephemeral" },
          },
          // After the breakpoint, and only when there is one: the chosen
          // language. Putting it inside the block above would give every
          // language its own cache entry of the whole menu, and English —
          // which needs no instruction at all — would pay for the machinery
          // on every request.
          ...(language ? [{ type: "text" as const, text: language }] : []),
        ],
        // If the model's safety classifiers decline a request, this reruns it
        // on Anthropic's recommended fallback rather than handing the visitor
        // a dead end. Vanishingly unlikely for bagel questions; it costs
        // nothing when it doesn't fire.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages,
      });

      // The only place text reaches the visitor. Fires as tokens land, so a
      // reply appears at reading speed rather than all at once when it ends.
      stream.on("text", (chunk) => {
        written += chunk;
        flush();
      });

      const response = await stream.finalMessage();

      // stop_reason first, always: on a refusal `content` is empty or partial,
      // and reading content[0] would throw on the one path that most needs to
      // return something sensible.
      if (response.stop_reason === "refusal") {
        send({
          type: "text",
          text: "I can't help with that one, sorry. If it's about an order, email cornerbagel@publicentity.co and a person will pick it up.",
        });
        return;
      }

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
            const outcome = await runTool(call.name, call.input);
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
    }

    // Out of rounds. Whatever she attached along the way is already on screen;
    // this is the sentence to go with it.
    console.warn("[shop-chat] hit the tool-round ceiling");
    written = `${written}${written ? "\n\n" : ""}That took longer than it should have, ask me again?`;
    flush();
  });
}
