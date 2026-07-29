// Signup endpoint behind the drop-list modal.
//
// It validates the number and normalizes it to E.164 so that whatever ends up
// storing and texting the list receives one canonical format. Nothing is
// persisted or sent yet — see `onSignup` below for the single place to wire in
// storage and the founder agent.

// The first text a new subscriber gets, written in Abu's voice. It lives here,
// next to the signup, so the welcome copy is versioned with the form that
// triggers it rather than buried in the agent's prompt.
export const WELCOME_TEXT = `Hey! I'm Abu, founder of Corner Bagel.

Thanks for joining our text list. I promise we won't spam you.

This is where you'll hear about new cream cheese drops, seasonal specials, neighborhood pop-ups, and the occasional surprise before anyone else. You'll also get a behind-the-scenes look at what we're baking and sourcing from our local farmers markets.

If you ever have feedback, an idea, or just want to say hi, reply to this text. It comes straight to me, and I'd genuinely love to hear from you.

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

// The handoff point. Today it only records the signup in the server log, so a
// number that reaches here is captured but NOT yet stored durably and NOT yet
// texted. Replace the body with the real subscriber store, then send
// WELCOME_TEXT from the founder agent.
async function onSignup(phone: string) {
  console.info(`[drop-list] signup ${phone}`);
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

  try {
    await onSignup(phone);
  } catch {
    return Response.json(
      { error: "We couldn't sign you up just now. Please try again." },
      { status: 500 },
    );
  }

  return Response.json({ ok: true }, { status: 200 });
}
