import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, RILEY_MAX_TOKENS } from "./riley";

// Riley — the shop's chat, answered by Claude rather than by the team.
//
// The widget (app/shop/ChatWidget.tsx) posts the whole visible thread here on
// every turn. That's deliberate: the API is stateless, there is no session
// store, and the thread is short enough that resending it costs less than
// standing up somewhere to keep it. It also means a reload starts fresh,
// which is the honest behaviour — nothing was being remembered anyway.
//
// Riley handles ordering, the menu, and how the app works. She cannot see
// orders, take payment, or issue refunds, and her briefing (riley.ts) says so
// in as many words — the failure worth guarding against here is not rudeness,
// it's a confident wrong answer about a price or an order.

const MODEL = "claude-opus-5";

// Bounds one conversation. Long enough for a real back-and-forth about an
// order, short enough that a stuck loop or a pasted wall of text can't run up
// a bill. Trimmed from the front, so the recent turns survive.
const MAX_TURNS = 24;
const MAX_MESSAGE_CHARS = 2000;

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

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const body = payload as { messages?: unknown; context?: unknown } | null;

  const rawTurns = Array.isArray(body?.messages) ? body.messages : [];
  const turns = rawTurns
    .filter(isTurn)
    .map((turn) => ({ role: turn.role, text: turn.text.slice(0, MAX_MESSAGE_CHARS) }))
    .slice(-MAX_TURNS);

  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    return Response.json({ error: "Type a message first." }, { status: 400 });
  }

  const anthropic = client();
  if (!anthropic) {
    // No key configured. Answering 200 with a plain message, not a 500: the
    // widget renders this as Riley's reply, so a visitor gets a sentence they
    // can act on rather than a red error next to a bubble they just sent.
    return Response.json(
      {
        reply:
          "Chat isn't switched on yet, so there's nobody in this window right now. Email cornerbagel@publicentity.co and a person will get back to you.",
        configured: false,
      },
      { status: 200 },
    );
  }

  // Where the order is going, if the visitor has chosen — the difference
  // between "when will it get here" and "when can I collect it". Sent as a
  // system message rather than folded into the system prompt so the cached
  // prefix (the whole menu) stays byte-identical across every conversation.
  const where = typeof body?.context === "string" ? body.context.slice(0, 200) : "";

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: RILEY_MAX_TOKENS,
      // Thinking stays on — disabling it on this model can leak <thinking>
      // tags into the visible reply. Low effort is the right lever for a chat
      // window instead: this is latency-sensitive, not intelligence-sensitive.
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      // The briefing is the same on every request and is most of the tokens,
      // so it's cached. Anything that varies goes after it, never inside it.
      system: [
        {
          type: "text",
          text: buildSystemPrompt(),
          cache_control: { type: "ephemeral" },
        },
      ],
      // If the model's safety classifiers decline a request, this reruns it on
      // Anthropic's recommended fallback rather than handing the visitor a
      // dead end. Vanishingly unlikely for bagel questions; it costs nothing
      // when it doesn't fire.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [
        ...turns.map((turn) => ({ role: turn.role, content: turn.text })),
        ...(where
          ? [{ role: "system" as const, content: `Customer's order is set to: ${where}.` }]
          : []),
      ],
    });

    // stop_reason first, always: on a refusal `content` is empty or partial,
    // and reading content[0] would throw on the one path that most needs to
    // return something sensible.
    if (response.stop_reason === "refusal") {
      return Response.json(
        {
          reply:
            "I can't help with that one, sorry. If it's about an order, email cornerbagel@publicentity.co and a person will pick it up.",
        },
        { status: 200 },
      );
    }

    const reply = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!reply) {
      return Response.json(
        { error: "Riley didn't have a reply for that — try rephrasing?" },
        { status: 502 },
      );
    }

    return Response.json({ reply }, { status: 200 });
  } catch (error) {
    // Logged, not returned: an upstream error message can name the model, the
    // account, or the request — none of which belongs in a chat bubble.
    console.error("[shop-chat] Riley failed to reply", error);
    return Response.json(
      { error: "Riley couldn't answer just now. Try again in a moment." },
      { status: 502 },
    );
  }
}
