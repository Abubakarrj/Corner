// Signup endpoint behind the drop-list modal.
//
// It validates the email and logs the signup along with the message it would
// send. No email provider is wired up yet — Loops (loops.so) is the plan,
// chosen for its flat per-contact pricing over per-message SMS costs, but
// nothing is built against their real API until their docs are in hand
// rather than guessed at. See `onSignup` below for where that belongs.

// The first email a new subscriber gets, written in Abu's voice. It lives
// here, next to the signup, so the welcome copy is versioned with the form
// that triggers it.
export const WELCOME_TEXT = `Hey, it's Abu.

Just wanted to say thanks for signing up. Really excited to have you here.

If you ever have any feedback, questions, or just want to chat bagels, reply anytime — it comes straight to me.

See you around the corner.

— Abu`;

// A plain format check, not full RFC 5322 validation. Mirrors the check the
// modal runs before enabling submit — this one is the authority, since the
// client's can be bypassed.
function isValidEmail(input: unknown): input is string {
  return typeof input === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

// No email provider is connected. Fully composed and logged here so wiring
// one up later is a single change: replace this function's body with the
// provider's send call — everything upstream of it (signup validation, the
// message text) already stays put.
function logEmail(to: string, body: string, label: string) {
  console.info(`[drop-list] would send ${label} to ${to}:\n${body}`);
}

// The handoff point. An address that reaches here is logged and its welcome
// email is logged, but NOT actually sent and NOT stored durably — add the
// real subscriber store and an email provider here once you have both.
function onSignup(email: string) {
  console.info(`[drop-list] signup ${email}`);
  logEmail(email, WELCOME_TEXT, "welcome email");
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const email = (payload as { email?: unknown } | null)?.email;
  if (!isValidEmail(email)) {
    return Response.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  onSignup(email.trim());

  return Response.json({ ok: true }, { status: 200 });
}
