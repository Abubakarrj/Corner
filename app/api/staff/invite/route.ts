import { emailShell, escapeHtml, isEmailConfigured, sendEmail } from "../../../email";
import { currentStaff } from "../../../staff/session";
import { INVITE_DAYS, mintInvite } from "../../../staff/invite";
import { locationOf, type StaffRole } from "../../../staff/staff";

// An admin invites somebody. See app/staff/invite.ts for why this ends in an
// email to the admins rather than a row in a table.
export const runtime = "nodejs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function origin(request: Request): string {
  // Behind a proxy the request URL is the internal one, so the forwarded
  // headers are what the invitee's link has to be built from. Falls back to
  // the request's own origin in local development, where there is no proxy.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const scheme = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${scheme}://${host}` : new URL(request.url).origin;
}

export async function POST(request: Request) {
  const staff = await currentStaff();
  if (!staff) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (staff.role !== "admin") {
    return Response.json({ error: "Only an admin can invite people." }, { status: 403 });
  }
  if (!isEmailConfigured()) {
    return Response.json(
      { error: "Email isn't configured, so no invite was sent. Set RESEND_API_KEY." },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const body = (payload ?? {}) as { email?: unknown; name?: unknown; role?: unknown };

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email)) {
    return Response.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name === "") return Response.json({ error: "Who is it?" }, { status: 400 });
  const role: StaffRole = body.role === "admin" ? "admin" : "member";

  // Invited onto the inviter's own shop. An admin can add people where they
  // work; nobody can add themselves somewhere they don't.
  const location = locationOf(staff);
  const token = await mintInvite({
    email,
    name,
    role,
    locationId: location.id,
    invitedBy: staff.name,
  });
  const link = `${origin(request)}/staff/join?token=${encodeURIComponent(token)}`;

  const text = [
    `Hi ${name},`,
    "",
    `${staff.name} has invited you to the Corner Bagel team tools for ${location.name}.`,
    "",
    "Open this link and choose a password:",
    link,
    "",
    `The link works for ${INVITE_DAYS} days. If you weren't expecting this, ignore it.`,
    "",
    "Corner Bagel",
  ].join("\n");

  const html = emailShell(
    [
      `<p style="margin:0 0 14px;">Hi ${escapeHtml(name)},</p>`,
      `<p style="margin:0 0 14px;">${escapeHtml(staff.name)} has invited you to the` +
        ` Corner Bagel team tools for <strong>${escapeHtml(location.name)}</strong>.</p>`,
      `<p style="margin:0 0 20px;"><a href="${escapeHtml(link)}"` +
        ` style="display:inline-block;padding:11px 18px;border-radius:999px;` +
        `background:#3e4a30;color:#faf7ef;text-decoration:none;font-weight:600;">` +
        `Choose a password</a></p>`,
      `<p style="margin:0 0 14px;color:#6b6760;font-size:13px;">The link works for` +
        ` ${INVITE_DAYS} days. If you weren't expecting this, ignore it.</p>`,
      `<p style="margin:0;">Corner Bagel</p>`,
    ].join(""),
  );

  const result = await sendEmail({
    to: email,
    subject: `Join the Corner Bagel team tools`,
    html,
    text,
    replyTo: staff.email,
  });

  if (!result.sent) {
    console.error("[staff/invite] send failed:", result);
    return Response.json({ error: "The invite didn't send." }, { status: 502 });
  }
  return Response.json({ ok: true, email });
}
