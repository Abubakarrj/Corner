import { emailShell, escapeHtml, isEmailConfigured, sendEmail } from "../../../email";
import { readInvite } from "../../../staff/invite";
import { adminEmails, hashPassword } from "../../../staff/staff";

// Redeeming an invite: the new person picks a password, and the line that has
// to go into STAFF_ACCOUNTS is mailed to the admins.
//
// The password is hashed here and then dropped. It is never logged, never
// stored, never mailed — what the admins receive is the scrypt line, which is
// useless to anyone who intercepts it and is the only thing they need.
export const runtime = "nodejs";

// Long enough to be worth the scrypt cost in front of it. Not a character-class
// rule: those reliably produce Passw0rd! and nothing else. Length is the thing
// that actually helps, so length is what is asked for.
const MIN_LENGTH = 12;

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const body = (payload ?? {}) as { token?: unknown; password?: unknown };

  const token = typeof body.token === "string" ? body.token : "";
  const invite = token === "" ? null : await readInvite(token);
  if (!invite) {
    return Response.json(
      { error: "That invite link has expired or isn't valid. Ask for a new one." },
      { status: 400 },
    );
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < MIN_LENGTH) {
    return Response.json(
      { error: `Use at least ${MIN_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const line = [
    invite.email,
    // The pipe is the field separator, so a display name containing one would
    // produce a line that parses into the wrong number of fields and gets
    // dropped at startup. Replaced rather than rejected: it is a name, and
    // nobody should be turned away over punctuation.
    invite.name.replace(/[|\n;]/g, " ").trim(),
    invite.role,
    invite.locationId,
    hashPassword(password),
  ].join("|");

  const admins = adminEmails();
  if (!isEmailConfigured() || admins.length === 0) {
    // The password is already chosen and gone; there is nothing to retry from
    // the invitee's side, so this has to be loud on ours.
    console.error(
      "[staff/join] no way to deliver the new account line for" +
        ` ${invite.email} — email configured: ${isEmailConfigured()}, admins: ${admins.length}`,
    );
    return Response.json(
      { error: "Your password was accepted but we couldn't notify an admin. Tell them directly." },
      { status: 502 },
    );
  }

  const text = [
    `${invite.name} <${invite.email}> has set a password and is ready to be added.`,
    "",
    "Add this line to STAFF_ACCOUNTS and redeploy:",
    "",
    line,
    "",
    `Invited by ${invite.invitedBy}. Role: ${invite.role}. Shop: ${invite.locationId}.`,
    "",
    "The line contains a scrypt hash, not the password. Nobody, including us,",
    "can read their password out of it.",
  ].join("\n");

  const html = emailShell(
    [
      `<p style="margin:0 0 14px;"><strong>${escapeHtml(invite.name)}</strong>` +
        ` &lt;${escapeHtml(invite.email)}&gt; has set a password and is ready to be added.</p>`,
      `<p style="margin:0 0 10px;">Add this line to <code>STAFF_ACCOUNTS</code> and redeploy:</p>`,
      `<pre style="margin:0 0 16px;padding:12px;background:#f2f0ea;border-radius:8px;` +
        `font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-all;">` +
        `${escapeHtml(line)}</pre>`,
      `<p style="margin:0 0 14px;color:#6b6760;font-size:13px;">Invited by` +
        ` ${escapeHtml(invite.invitedBy)}. Role: ${escapeHtml(invite.role)}.` +
        ` Shop: ${escapeHtml(invite.locationId)}.</p>`,
      `<p style="margin:0;color:#6b6760;font-size:13px;">The line contains a scrypt hash,` +
        ` not the password. Nobody, including us, can read their password out of it.</p>`,
    ].join(""),
  );

  const result = await sendEmail({
    to: admins,
    subject: `Add ${invite.name} to the team tools`,
    html,
    text,
  });

  if (!result.sent) {
    console.error("[staff/join] could not mail the account line:", result);
    return Response.json(
      { error: "Your password was accepted but we couldn't notify an admin. Tell them directly." },
      { status: 502 },
    );
  }
  return Response.json({ ok: true, name: invite.name });
}
