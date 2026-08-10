import "server-only";

// The one way this app sends a piece of mail to a named person.
//
// ——— Why there are two email providers and not one ———
//
// Loops is still here, and should be: /api/drop-list creates a *contact* in a
// marketing audience, and the welcome note is a Loops-side automation firing
// off that contact. That is a mailing-list product doing mailing-list work —
// segments, unsubscribes, a template somebody edits without a deploy.
//
// Everything else this app sends is transactional: one message, to one address
// that asked for it, often with a file attached. Loops can do that too, but its
// attachment support has to be switched on for the account by their support
// team, and until somebody opens that ticket the API accepts the call and
// silently drops the file. A job application that arrives with no application
// attached is worse than one that fails loudly. Resend takes attachments on the
// standard plan with nothing to request, which is the whole reason this file
// exists.
//
// So: Resend for transactional, Loops for the list, and Auth0 keeps sending
// sign-in codes because those are part of its passwordless flow and are not
// ours to send.
//
// ——— The no-key path is not an error ———
//
// Without RESEND_API_KEY this logs what it would have sent and reports
// `sent: false`. That is for local development, where nobody wants a real
// supplier receiving a real purchase order because someone was clicking
// through a form. Callers decide what that means: /api/apply tells the
// applicant it worked (their application is in the log and the alternative is
// a dead end), while the supply order refuses, because a purchase order that
// silently didn't send is a delivery that silently doesn't arrive.

const RESEND_URL = "https://api.resend.com/emails";

/** Who the mail is from. A verified domain in the Resend dashboard is what
 *  makes this deliverable; an unverified one bounces at their end, not ours. */
const FROM = process.env.RESEND_FROM ?? "Corner Bagel <orders@thecornerbagel.com>";

export type Attachment = {
  filename: string;
  bytes: Uint8Array;
};

export type Mail = {
  to: string | string[];
  subject: string;
  /** Both are sent. A client that refuses HTML still gets a readable message,
   *  and a plain-text part measurably helps deliverability. */
  html: string;
  text: string;
  /** Where a reply goes when it should not go to the from address — the
   *  ordering mailbox for a supply order, the applicant for an application. */
  replyTo?: string;
  /** A silent copy. This app has no database, so for anything that has to be
   *  auditable later — what was ordered, from whom, on what day — a copy in
   *  the shop's own mailbox *is* the record. Blind rather than cc'd because
   *  the recipient has no reason to see the shop's internal addresses. */
  bcc?: string | string[];
  attachments?: Attachment[];
};

export type SendResult =
  | { sent: true }
  | { sent: false; reason: "not-configured" }
  | { sent: false; reason: "failed"; detail: string };

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(mail: Mail): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(
      `[email] no RESEND_API_KEY — NOT sent: "${mail.subject}" to ${[mail.to].flat().join(", ")}` +
        (mail.attachments?.length
          ? ` (+${mail.attachments.map((file) => file.filename).join(", ")})`
          : "") +
        `\n${mail.text}`,
    );
    return { sent: false, reason: "not-configured" };
  }

  let response: Response;
  try {
    response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: [mail.to].flat(),
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
        ...(mail.bcc ? { bcc: [mail.bcc].flat() } : {}),
        ...(mail.attachments?.length
          ? {
              attachments: mail.attachments.map((file) => ({
                filename: file.filename,
                content: Buffer.from(file.bytes).toString("base64"),
              })),
            }
          : {}),
      }),
    });
  } catch (error) {
    return {
      sent: false,
      reason: "failed",
      detail: error instanceof Error ? error.message : "network",
    };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { sent: false, reason: "failed", detail: `${response.status}: ${detail.slice(0, 300)}` };
  }
  return { sent: true };
}

// ——— Writing the HTML ———
//
// No template library and no React Email. These messages are a heading, some
// paragraphs and a list, and mail clients throw away most of what a layout
// engine would produce anyway. Inline styles only: Gmail strips <style>
// blocks, and a stylesheet that survives in Apple Mail and vanishes in Gmail
// is worse than no stylesheet at all.

/** Escapes text for HTML. Every value that reaches an email body goes through
 *  this — a supplier's name with an ampersand in it is ordinary, and a name
 *  with a tag in it is somebody probing. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The shell every message here shares: a readable column on a plain ground,
 *  system fonts, and no images — a message that is one big picture is a
 *  message half the recipients see as a grey box. */
export function emailShell(body: string): string {
  return [
    `<div style="margin:0;padding:24px 16px;background:#f6f5f1;">`,
    `<div style="max-width:560px;margin:0 auto;padding:28px 26px;background:#ffffff;`,
    `border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',`,
    `Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f1d1a;">`,
    body,
    `</div></div>`,
  ].join("");
}
