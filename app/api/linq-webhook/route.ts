// Inbound webhook for the number Abu texts from. Linq POSTs here whenever
// someone replies; this route verifies the request really came from Linq,
// asks Claude to draft a reply in Abu's voice, and sends it back through
// Linq's existing-chat send endpoint.
//
// Nothing fires until a webhook subscription is actually registered in Linq
// pointing at this route's deployed URL — see docs.linqapp.com/guides/webhooks.
// Until then this route exists but nothing calls it.

import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { WELCOME_TEXT } from "../drop-list/route";

// Replay protection: Linq re-stamps webhook-timestamp on every retry, so this
// only ever rejects a genuinely stale or forged request, never a normal retry.
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

const LINQ_WEBHOOK_SECRET = process.env.LINQ_WEBHOOK_SECRET;
const LINQ_API_KEY = process.env.LINQ_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Claude Opus 5. Deliberately not downgraded for a "simple" SMS bot — that's
// a cost/quality tradeoff for a human to make, not a default to assume. Swap
// this one constant (e.g. to "claude-sonnet-5") if you'd rather trade some
// quality for a cheaper per-reply cost.
const ABU_MODEL = "claude-opus-5";

// Abu's system prompt. Anchored on WELCOME_TEXT so the model continues the
// same voice it already opened the conversation in, rather than inventing a
// second, inconsistent persona.
const ABU_SYSTEM_PROMPT = `You are texting as Abu, the founder of Corner Bagel, replying to someone who texted this number back. Here is the first message they already received from you, so you can match its voice:

"""
${WELCOME_TEXT}
"""

Stay in that voice: warm, personal, plainspoken — a founder texting a customer himself, not a brand account. Keep replies short, the way a real text is short; this is SMS/iMessage, not email.

Only state facts about Corner Bagel (hours, prices, menu items, locations, allergens) that you actually know from this conversation. If you don't know something, say so plainly and offer to have a real person follow up — don't guess or invent details.

If someone sincerely and directly asks whether they're texting a real person or a bot/AI, tell them the truth plainly rather than deny it or dodge — then continue in Abu's voice. Don't volunteer that you're an AI unasked.

Reply with only the text message itself — no greeting like "Reply:", no quotation marks around it, no explanation of what you're doing.`;

interface LinqHandle {
  handle: string;
  id: string;
  is_me: boolean;
  service: string;
}

interface LinqMessagePart {
  type: "text" | "media";
  value?: string;
}

interface LinqWebhookPayload {
  event_type: string;
  event_id: string;
  data: {
    chat: { id: string; is_group: boolean };
    parts: LinqMessagePart[];
    sender_handle: LinqHandle;
    direction: "inbound" | "outbound";
  };
}

// Verify the Standard Webhooks signature per docs.linqapp.com/guides/webhooks.
// Signed content is `{webhook-id}.{webhook-timestamp}.{rawBody}`; the secret
// is `whsec_`-prefixed base64. Must run against the raw, unparsed body — that
// is why the caller passes text(), not a parsed object.
function verifyLinqSignature(
  rawBody: string,
  idHeader: string | null,
  timestampHeader: string | null,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!idHeader || !timestampHeader || !signatureHeader) return false;

  const timestampMs = Number(timestampHeader) * 1000;
  if (!Number.isFinite(timestampMs)) return false;
  if (Math.abs(Date.now() - timestampMs) > MAX_TIMESTAMP_AGE_MS) return false;

  const keyBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${idHeader}.${timestampHeader}.${rawBody}`;
  const expected = createHmac("sha256", keyBytes)
    .update(signedContent)
    .digest("base64");

  // webhook-signature carries one or more space-separated "v1,<base64>"
  // entries — accept a match against any of them.
  return signatureHeader.split(" ").some((sig) => {
    if (!sig.startsWith("v1,")) return false;
    try {
      const provided = Buffer.from(sig.slice(3), "base64");
      const expectedBuf = Buffer.from(expected, "base64");
      return (
        provided.length === expectedBuf.length &&
        timingSafeEqual(provided, expectedBuf)
      );
    } catch {
      return false;
    }
  });
}

// Best-effort, in-memory dedup — Linq's delivery is at-least-once, and this
// is enough to absorb a normal retry burst. It resets on every deploy/restart
// and isn't shared across instances; a real store belongs here once one
// exists, same caveat as the rest of this app's Linq integration.
const seenEventIds = new Set<string>();
const MAX_SEEN_EVENT_IDS = 500;

function alreadyProcessed(eventId: string): boolean {
  if (seenEventIds.has(eventId)) return true;
  seenEventIds.add(eventId);
  if (seenEventIds.size > MAX_SEEN_EVENT_IDS) {
    const oldest = seenEventIds.values().next().value;
    if (oldest !== undefined) seenEventIds.delete(oldest);
  }
  return false;
}

function extractText(parts: LinqMessagePart[]): string {
  return parts
    .filter((part) => part.type === "text" && part.value)
    .map((part) => part.value)
    .join("\n");
}

async function draftReply(inboundText: string): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) {
    console.warn("[linq-webhook] ANTHROPIC_API_KEY isn't set — skipping reply.");
    return null;
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: ABU_MODEL,
    max_tokens: 1024,
    system: ABU_SYSTEM_PROMPT,
    messages: [{ role: "user", content: inboundText }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.text ?? null;
}

// POST /v3/chats/{chatId}/typing — shows "Abu is typing" while Claude drafts
// a reply, so the wait reads as a person composing rather than dead air.
// Purely cosmetic: never let a failure here block the actual reply, and skip
// it outright for group chats, where Linq's docs say indicators aren't
// supported. A single call covers our case — replies are short and should
// land well within the ~85-90s an indicator stays up before needing a
// refresh, so there's no refresh-every-60s loop here.
async function startTyping(chatId: string) {
  if (!LINQ_API_KEY) return;

  try {
    await fetch(`https://api.linqapp.com/api/partner/v3/chats/${chatId}/typing`, {
      method: "POST",
      headers: { Authorization: `Bearer ${LINQ_API_KEY}` },
    });
  } catch (error) {
    console.warn("[linq-webhook] typing indicator failed", error);
  }
}

// POST /v3/chats/{chatId}/messages — replies into the thread the inbound
// message already belongs to, rather than starting a new chat.
async function sendReply(chatId: string, body: string) {
  if (!LINQ_API_KEY) {
    console.warn("[linq-webhook] LINQ_API_KEY isn't set — skipping send.");
    return;
  }

  const response = await fetch(
    `https://api.linqapp.com/api/partner/v3/chats/${chatId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LINQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          parts: [{ type: "text", value: body }],
          idempotency_key: `abu-reply-${chatId}-${Date.now()}`,
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Linq ${response.status} (reply): ${detail.slice(0, 300)}`);
  }
}

async function handleMessageReceived(payload: LinqWebhookPayload) {
  const { chat, parts, sender_handle: sender, direction } = payload.data;

  // Guards against replying to Abu's own outbound messages being echoed back,
  // or to anything that isn't actually an inbound text.
  if (direction !== "inbound" || sender.is_me) return;

  const text = extractText(parts);
  if (!text) return;

  console.info(`[linq-webhook] inbound from ${sender.handle}: ${text}`);

  if (!chat.is_group) await startTyping(chat.id);

  try {
    const reply = await draftReply(text);
    if (!reply) return;
    await sendReply(chat.id, reply);
  } catch (error) {
    console.error("[linq-webhook] reply failed", error);
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!LINQ_WEBHOOK_SECRET) {
    console.warn(
      "[linq-webhook] LINQ_WEBHOOK_SECRET isn't set — cannot verify inbound requests, ignoring.",
    );
    return new Response(null, { status: 200 });
  }

  const valid = verifyLinqSignature(
    rawBody,
    request.headers.get("webhook-id"),
    request.headers.get("webhook-timestamp"),
    request.headers.get("webhook-signature"),
    LINQ_WEBHOOK_SECRET,
  );
  if (!valid) {
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: LinqWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (alreadyProcessed(payload.event_id)) {
    return new Response(null, { status: 200 });
  }

  // Respond immediately — Linq expects a fast 200 and treats a slow response
  // as a delivery failure. The actual Claude call and reply happen after the
  // response is sent, via Next's `after()`.
  if (payload.event_type === "message.received") {
    after(() => handleMessageReceived(payload));
  }

  return new Response(null, { status: 200 });
}
