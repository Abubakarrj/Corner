// Signup endpoint behind the drop-list modal.
//
// It validates the number, normalizes it to E.164, and sends the welcome text
// through Linq (docs.linqapp.com). Nothing is stored durably yet — see
// `onSignup` below for where a real subscriber store belongs.

// The first text a new subscriber gets, written in Abu's voice. It lives here,
// next to the signup, so the welcome copy is versioned with the form that
// triggers it.
export const WELCOME_TEXT = `Hey, it's Abu.

Just wanted to say thanks for signing up. Really excited to have you here.

If you ever have any feedback, questions, or just want to chat bagels, reply anytime. This is my number.

See you around the corner.

— Abu`;

// A valid North American number: neither the area code nor the exchange may
// start with 0 or 1. Mirrors the check the modal runs before enabling submit —
// this one is the authority, since the client's can be bypassed.
function toE164(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits) ? `+1${digits}` : null;
}

// Kept undefined rather than throwing at import time — a missing credential
// should silently skip the text (and say so in the log), not take the whole
// signup endpoint down.
const LINQ_API_KEY = process.env.LINQ_API_KEY;
// The number assigned to your Linq account — both messages send *from* it.
// Independent of RELAY_TO_NUMBER above: even if they end up being the same
// physical number, confirm with Linq that a number can receive its own
// outbound send (the join alert's "to") before assuming it, rather than
// hardcoding that assumption here.
const LINQ_FROM_NUMBER = process.env.LINQ_FROM_NUMBER;

// POST /v3/chats — see https://docs.linqapp.com/api/. One request both starts
// the conversation and sends the first message, which is all either of these
// two texts needs. `label` only names the send in logs, so a skipped or
// failed message says which one it was.
async function sendSms(to: string, body: string, label: string) {
  if (!LINQ_API_KEY || !LINQ_FROM_NUMBER) {
    console.warn(
      `[drop-list] Linq isn't configured (LINQ_API_KEY / LINQ_FROM_NUMBER) — skipping ${label}.`,
    );
    return;
  }

  const response = await fetch("https://api.linqapp.com/api/partner/v3/chats", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LINQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: LINQ_FROM_NUMBER,
      to: [to],
      message: {
        parts: [{ type: "text", value: body }],
        // Scoped to this exact send, so a network-layer retry of this same
        // request can't double-text someone.
        idempotency_key: `drop-list-${label}-${to}-${Date.now()}`,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Linq ${response.status} (${label}): ${detail.slice(0, 300)}`);
  }
}

// The handoff point. A number that reaches here is logged and texted, but NOT
// yet stored durably — add the real subscriber store here once one exists.
async function onSignup(phone: string) {
  console.info(`[drop-list] signup ${phone}`);

  // A texting failure shouldn't turn a valid signup into an error response —
  // there's nothing durable to roll back yet, and the visitor did everything
  // right. It's logged so a run of these is visible without silently losing
  // subscribers to a bad Linq config.
  try {
    await sendSms(phone, WELCOME_TEXT, "welcome text");
  } catch (error) {
    console.error("[drop-list] welcome text failed", error);
  }
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const phone = toE164((payload as { phone?: unknown } | null)?.phone);
  if (!phone) {
    return Response.json(
      { error: "Enter a valid US phone number." },
      { status: 400 },
    );
  }

  await onSignup(phone);

  return Response.json({ ok: true }, { status: 200 });
}
