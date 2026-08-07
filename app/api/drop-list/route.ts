import { resolveMx } from "node:dns/promises";
import { after } from "next/server";

// Signup endpoint behind the drop-list modal.
//
// It validates the email — format, then that the domain can actually receive
// mail — runs a few lightweight bot defenses, then adds the contact to Loops
// (loops.so). The welcome email itself isn't sent from here: it's a Loops
// Workflow, configured in the dashboard to fire automatically whenever a
// contact is added — so the one API call this route makes (contacts/create)
// is also what triggers it. If LOOPS_API_KEY isn't set (e.g. local dev
// without credentials), it falls back to just logging the signup.

// Reference copy only, matching what the Workflow's email step should say —
// nothing here is sent through the API, since a Workflow's content lives
// entirely in the Loops dashboard. Keep the two in sync by hand.
//
// "send me a text" in the body should be hyperlinked in the Loops editor to
// `sms:${WELCOME_SMS_LINK_PHONE}` — plain text here can't carry a link.
export const WELCOME_FROM = "abu@thecornerbagel.com";
export const WELCOME_SUBJECT = "Nice to meet you!";
export const WELCOME_SMS_LINK_PHONE = "+12134196038";
export const WELCOME_TEXT = `Hey! Abu here, founder of Corner Bagel.

Just wanted to personally welcome you and say thanks for signing up.

This isn't some marketing inbox—it's me. So if you ever have a question, a suggestion, or think we messed something up, send me a text. I'd genuinely love to hear from you.

I appreciate you being part of what we're building. Hopefully I'll get to meet you in the shop soon.

See you around the corner.

— Abu`;

// A plain format check, not full RFC 5322 validation. Mirrors the check the
// modal runs before enabling submit — this one is the authority, since the
// client's can be bypassed. Passing this only means the string looks like an
// email; hasMxRecord below is what checks it could actually receive one.
function isValidEmail(input: unknown): input is string {
  return typeof input === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

// "Real" here means the domain has somewhere to deliver mail — it doesn't
// catch a typo'd mailbox on a real domain (jhon@ vs john@gmail.com), only a
// domain that can't receive email at all (typo'd domain, or made up).
// Actually verifying a specific mailbox exists needs a paid verification
// service or an SMTP handshake, neither of which belongs in this quick a
// check. DNS lookups can't run in the browser, so this is server-only — the
// client-side check stays format-only.
async function hasMxRecord(email: string): Promise<boolean> {
  const domain = email.split("@")[1];
  if (!domain) return false;

  try {
    const records = await resolveMx(domain);
    return records.length > 0;
  } catch {
    // ENOTFOUND / ENODATA both mean "this domain has nowhere to deliver
    // mail" — a genuinely bad domain, not a transient failure. A real
    // network hiccup would look the same here; that's an accepted tradeoff
    // for keeping this a single lookup rather than a retry/timeout dance.
    return false;
  }
}

// A field no real visitor can see or reach, named the way generic bot
// form-fillers guess at ("company" is a common one to blindly populate).
// A human never touches it; anything that fills it gets a silent success —
// telling it "no" would just teach it to try a different field name.
const HONEYPOT_FIELD = "company";

// Faster than this and it's not a human typing an email — even instant
// browser autofill still needs a render + a click, so this floor doesn't
// catch real people, only scripts that fill-and-submit in one step.
const MIN_FILL_TIME_MS = 600;

// Best-effort, in-memory per-IP throttle — resets on every deploy/restart,
// same caveat as everything else in this app with no durable store yet.
// Capped so a flood of distinct IPs can't grow this unboundedly.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const MAX_TRACKED_IPS = 5000;
const submissionsByIp = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (submissionsByIp.get(ip) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );

  if (recent.length >= RATE_LIMIT_MAX) {
    submissionsByIp.set(ip, recent);
    return true;
  }

  recent.push(now);
  submissionsByIp.set(ip, recent);

  if (submissionsByIp.size > MAX_TRACKED_IPS) {
    const oldest = submissionsByIp.keys().next().value;
    if (oldest !== undefined) submissionsByIp.delete(oldest);
  }

  return false;
}

function clientIp(request: Request): string {
  // Render (and most PaaS) sit in front of this app as a proxy; the real
  // visitor IP arrives via this header rather than a raw socket address.
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

function logEmail(to: string, body: string, label: string) {
  console.info(`[drop-list] would send ${label} to ${to}:\n${body}`);
}

const LOOPS_API_KEY = process.env.LOOPS_API_KEY;
const LOOPS_CONTACTS_URL = "https://app.loops.so/api/v1/contacts/create";

// Adds the contact to the Loops audience — and, since the Workflow sending
// Abu's welcome is configured to trigger off exactly that, this call is also
// what sets the welcome email in motion. A 409 means the contact already
// exists — a returning subscriber, not a failure — so that status alone is
// swallowed rather than thrown.
async function addToLoopsAudience(email: string): Promise<void> {
  const response = await fetch(LOOPS_CONTACTS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOOPS_API_KEY}`,
    },
    body: JSON.stringify({ email, source: "Drop list modal" }),
  });

  if (!response.ok && response.status !== 409) {
    const failure = await response.json().catch(() => null);
    throw new Error(
      `Loops contact create failed (${response.status}): ${failure?.message ?? "unknown error"}`,
    );
  }
}

// The handoff point. Runs the actual Loops call after the response has
// already gone out to the visitor — signup is best-effort from here on, and
// a Loops hiccup shouldn't make the form itself look broken. Falls back to a
// console log when no API key is configured, so local dev without
// credentials still shows what would have happened.
function onSignup(email: string) {
  console.info(`[drop-list] signup ${email}`);

  if (!LOOPS_API_KEY) {
    logEmail(email, WELCOME_TEXT, "welcome email");
    return;
  }

  after(async () => {
    try {
      await addToLoopsAudience(email);
    } catch (error) {
      console.error(`[drop-list] Loops signup failed for ${email}:`, error);
    }
  });
}

export async function POST(request: Request) {
  if (isRateLimited(clientIp(request))) {
    return Response.json(
      { error: "api.tooManyAttempts" },
      { status: 429 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "api.badJson" }, { status: 400 });
  }

  const body = payload as
    | { email?: unknown; [HONEYPOT_FIELD]?: unknown; elapsed_ms?: unknown }
    | null;

  const email = body?.email;
  if (!isValidEmail(email)) {
    return Response.json(
      { error: "api.validEmailAddress" },
      { status: 400 },
    );
  }

  // Both bot signals return the same success response a real signup gets —
  // no error message that would tell an automated sender which check it
  // tripped, or that there was a check at all.
  const honeypotFilled =
    typeof body?.[HONEYPOT_FIELD] === "string" && body[HONEYPOT_FIELD].length > 0;
  const submittedTooFast =
    typeof body?.elapsed_ms === "number" && body.elapsed_ms < MIN_FILL_TIME_MS;
  if (honeypotFilled || submittedTooFast) {
    return Response.json({ ok: true }, { status: 200 });
  }

  if (!(await hasMxRecord(email))) {
    return Response.json(
      { error: "api.emailNotReal" },
      { status: 400 },
    );
  }

  onSignup(email.trim());

  return Response.json({ ok: true }, { status: 200 });
}
