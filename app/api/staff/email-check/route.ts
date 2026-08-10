import { sendEmail, sender, type MailStream } from "../../../email";
import { currentStaff } from "../../../staff/session";

// "I didn't get an email" — the endpoint that answers it.
//
// Mail has more places to fail than almost anything else in this app, and
// nearly all of them are silent from the outside: a key that never made it
// into the environment, a domain that was added to Resend but never verified,
// an account still in its restricted state where the only permitted recipient
// is the owner's own address, a from address on a domain nobody owns, a
// perfectly successful send to a mailbox that does not exist.
//
// From a chair in front of the app, every one of those looks identical:
// nothing arrives. So this reports what the server can actually see, and will
// send a real message on request and hand back Resend's own words when it
// refuses — which is where the answer usually is, and which is otherwise
// buried in a server log nobody is watching at the moment they press the
// button.
//
// The static half of the picture — which key is set, which address each
// stream resolves to, where each kind of mail is addressed — is rendered by
// the page itself, which is already a server component and already checks the
// session. This route is only the part that cannot be answered by reading
// configuration: what happens when you actually try.
//
// Admin-only, and it never returns the key itself: whether it is set is the
// diagnostic, the value is not.
export const runtime = "nodejs";

const STREAMS: MailStream[] = ["orders", "forms", "team"];

export async function POST(request: Request) {
  const staff = await currentStaff();
  if (!staff) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (staff.role !== "admin") {
    return Response.json({ error: "Admins only." }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const body = (payload ?? {}) as { to?: unknown; stream?: unknown };

  // Defaults to the person pressing the button. A test that goes somewhere
  // they cannot read is a test that answers nothing.
  const to = typeof body.to === "string" && body.to.trim() !== "" ? body.to.trim() : staff.email;
  const stream: MailStream = STREAMS.includes(body.stream as MailStream)
    ? (body.stream as MailStream)
    : "orders";

  const stamp = new Date().toISOString();
  const result = await sendEmail({
    from: stream,
    to,
    subject: `Corner Bagel email test (${stream})`,
    html:
      `<p>This is a test from the Corner Bagel team tools.</p>` +
      `<p>Sent as the <strong>${stream}</strong> stream, from ${sender(stream)},` +
      ` by ${staff.name} at ${stamp}.</p>` +
      `<p>If you are reading this, that stream works end to end.</p>`,
    text:
      `This is a test from the Corner Bagel team tools.\n\n` +
      `Sent as the ${stream} stream, from ${sender(stream)}, by ${staff.name} at ${stamp}.\n\n` +
      `If you are reading this, that stream works end to end.`,
  });

  if (result.sent) {
    return Response.json({
      ok: true,
      to,
      from: sender(stream),
      // Deliberately not "sent successfully". Resend accepted it; whether it
      // lands is a question about the recipient's mail server, and claiming
      // more than we know is how somebody stops looking in the right place.
      note: "Resend accepted it. If it doesn't arrive, check spam and check the address exists.",
    });
  }

  return Response.json(
    {
      ok: false,
      to,
      from: sender(stream),
      reason: result.reason,
      // Resend's own words, verbatim and unshortened by us. This is the whole
      // point of the endpoint — "the domain is not verified" and "you can only
      // send to your own address in testing" are different problems with
      // different fixes, and both look like silence from outside.
      detail: result.reason === "failed" ? result.detail : "RESEND_API_KEY is not set",
    },
    { status: 502 },
  );
}
