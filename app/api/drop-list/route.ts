// Signup endpoint behind the drop-list modal.
//
// It validates the number, normalizes it to E.164, sends the welcome text and
// a join alert via Twilio, and logs the signup. Nothing is stored durably
// yet — see `onSignup` below for where a real subscriber store belongs.

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

// "+14155550123" -> "415-555-0123", the dashed form the join alert reads in.
function formatForAlert(e164: string): string {
  const digits = e164.slice(2); // drop the leading "+1"
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Abu's own phone — every signup sends him a one-line heads-up here, so he can
// see the list growing without a dashboard or a database to check.
const RELAY_TO_NUMBER = "+12134196038";

// Kept undefined rather than throwing at import time — a missing credential
// should silently skip the text (and say so in the log), not take the whole
// signup endpoint down.
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;

// A raw call to Twilio's REST API rather than the `twilio` package — one POST
// is the entire integration, and it skips a dependency for something this
// small. See README for the three env vars this needs. `label` only names the
// send in logs, so a skipped or failed message says which one it was.
async function sendSms(to: string, body: string, label: string) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    console.warn(
      `[drop-list] Twilio isn't configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER) — skipping ${label}.`,
    );
    return;
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`,
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM_NUMBER, Body: body }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Twilio ${response.status} (${label}): ${detail.slice(0, 300)}`);
  }
}

// The handoff point. A number that reaches here is logged and texted, but NOT
// yet stored durably — add the real subscriber store here once one exists.
async function onSignup(phone: string) {
  console.info(`[drop-list] signup ${phone}`);

  // Each send fails independently — a broken relay alert shouldn't cost the
  // subscriber their welcome text, and vice versa. Neither failure should turn
  // a valid signup into an error response either: there's nothing durable to
  // roll back yet, and the visitor did everything right. Both are logged so a
  // run of these is visible without silently losing subscribers (or Abu's
  // alerts) to a bad Twilio config.
  try {
    await sendSms(phone, WELCOME_TEXT, "welcome text");
  } catch (error) {
    console.error("[drop-list] welcome text failed", error);
  }

  try {
    await sendSms(
      RELAY_TO_NUMBER,
      `Hey Abu, ${formatForAlert(phone)}, joined the list.`,
      "join alert",
    );
  } catch (error) {
    console.error("[drop-list] join alert failed", error);
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
