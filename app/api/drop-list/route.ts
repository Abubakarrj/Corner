// Signup endpoint behind the drop-list modal.
//
// It validates the number, normalizes it to E.164, and logs the signup along
// with the text it would send. No SMS provider is wired up — Linq was ripped
// out; sent.dm is the next candidate. See `onSignup` below for where one
// belongs once you've picked it.

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

// No SMS provider is connected. Fully composed and logged here so wiring one
// up later is a single change: replace this function's body with the
// provider's send call — everything upstream of it (signup validation, the
// message text) already stays put.
function logSms(to: string, body: string, label: string) {
  console.info(`[drop-list] would send ${label} to ${to}:\n${body}`);
}

// The handoff point. A number that reaches here is logged and its text is
// logged, but NOT actually sent and NOT stored durably — add the real
// subscriber store and an SMS provider here once you have both.
function onSignup(phone: string) {
  console.info(`[drop-list] signup ${phone}`);
  logSms(phone, WELCOME_TEXT, "welcome text");
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

  onSignup(phone);

  return Response.json({ ok: true }, { status: 200 });
}
