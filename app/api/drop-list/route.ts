import { resolveMx } from "node:dns/promises";

// Signup endpoint behind the drop-list modal.
//
// It validates the email — format, then that the domain can actually receive
// mail — runs a few lightweight bot defenses, and logs the signup along with
// the message it would send. No email provider is wired up yet — Loops
// (loops.so) is the plan, chosen for its flat per-contact pricing over
// per-message SMS costs, but nothing is built against their real API until
// their docs are in hand rather than guessed at. See `onSignup` below for
// where that belongs.

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
  if (isRateLimited(clientIp(request))) {
    return Response.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const body = payload as
    | { email?: unknown; [HONEYPOT_FIELD]?: unknown; elapsed_ms?: unknown }
    | null;

  const email = body?.email;
  if (!isValidEmail(email)) {
    return Response.json(
      { error: "Enter a valid email address." },
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
      { error: "That email address doesn't look real — check for a typo." },
      { status: 400 },
    );
  }

  onSignup(email.trim());

  return Response.json({ ok: true }, { status: 200 });
}
