import "server-only";

// The one way this app sends a text message.
//
// ——— Why it exists ———
//
// The gift card form has always offered three ways to send a card — email, a
// text, or "send it to me" — and until now there was no SMS transport at all,
// so a card sent by text was issued and never arrived. This is that transport.
//
// ——— Twilio, and the same no-key path as email.ts ———
//
// Without credentials this logs what it would have sent and reports
// `sent: false`. That is for local development, and the caller decides what it
// means: for a gift card it means the row stays owed rather than being marked
// delivered, because a card recorded as sent that never went is worse than one
// that is visibly still waiting.
//
// ⚠️ A message costs money per send and lands on somebody's phone. Everything
// that reaches here has already been validated — /api/gift-card checks the
// number before a card is ever issued — and this file does not retry on its
// own. A retry loop over a paid channel with a bug in it is a bill and a
// harassment complaint.
//
// ——— On the number ———
//
// TWILIO_FROM is one number for the whole shop, the same way there is one
// Resend from address, and for the same reason: splitting a stream of one is a
// knob that only ever gets set wrong.
//
// A2P 10DLC registration is required before a US number can send application
// traffic at any volume. Twilio refuses or filters unregistered traffic rather
// than failing loudly, so a message that "sends" and never arrives usually
// means the campaign is not registered — that is a dashboard errand, not a
// code one, and it is why sendResult carries Twilio's own words.

const TWILIO_API = "https://api.twilio.com/2010-04-01";

export type SmsResult =
  | { sent: true }
  | { sent: false; reason: "not-configured" }
  | { sent: false; reason: "failed"; detail: string };

type TwilioConfig = { accountSid: string; authToken: string; from: string };

function twilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM?.trim();
  if (!accountSid || !authToken || !from) return null;
  return { accountSid, authToken, from };
}

export function isSmsConfigured(): boolean {
  return twilioConfig() !== null;
}

/** Which of the three is missing, for the log.
 *
 *  Same shape and same reason as the Uber and payments gaps: a correct-looking
 *  configuration with one name absent is a feature quietly off and nothing to
 *  read. Never returned to a browser. */
export function missingSmsConfig(): string[] {
  return [
    ["TWILIO_ACCOUNT_SID", process.env.TWILIO_ACCOUNT_SID],
    ["TWILIO_AUTH_TOKEN", process.env.TWILIO_AUTH_TOKEN],
    ["TWILIO_FROM", process.env.TWILIO_FROM],
  ]
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name as string);
}

/** A phone number as Twilio wants it: E.164, so +1 and ten digits for the US.
 *
 *  The form deliberately accepts what people actually type — spaces, dashes,
 *  brackets, a leading 1 — because rejecting a real number over its punctuation
 *  is worse than accepting one that fails later. That leniency has to end
 *  somewhere, and it ends here.
 *
 *  ⚠️ Null rather than a guess. Sending to a number this could not parse means
 *  a gift card going to whoever happens to own the digits that were left. */
export function toE164(input: string): string | null {
  const raw = input.trim();
  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    // Loose on the upper bound because country codes vary; E.164 caps at 15.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  // 1 then ten digits is how a US number is written when somebody includes the
  // country code without the plus.
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const config = twilioConfig();
  const number = toE164(to);

  if (!number) {
    return { sent: false, reason: "failed", detail: `not a usable phone number: ${to}` };
  }

  if (!config) {
    console.warn(`[sms] no Twilio credentials — NOT sent to ${number}:\n${body}`);
    return { sent: false, reason: "not-configured" };
  }

  let response: Response;
  try {
    response = await fetch(`${TWILIO_API}/Accounts/${config.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        // Twilio takes basic auth and a form body rather than JSON.
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: number, From: config.from, Body: body }),
      cache: "no-store",
    });
  } catch (networkError) {
    return {
      sent: false,
      reason: "failed",
      detail: `network: ${networkError instanceof Error ? networkError.message : "unknown"}`,
    };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // Twilio's errors carry a numeric `code` and a `message`, and the code is
    // what their documentation is indexed by — 21610 is a number that has
    // replied STOP, 21408 is a region the account cannot send to. Both are
    // things a person fixes, and neither is guessable from a status code.
    let said = detail.slice(0, 300);
    try {
      const body = JSON.parse(detail) as { code?: number; message?: string };
      if (body.message) said = `${body.code ?? response.status}: ${body.message}`;
    } catch {
      // Not JSON, which is itself worth knowing.
    }
    return { sent: false, reason: "failed", detail: said };
  }

  return { sent: true };
}
