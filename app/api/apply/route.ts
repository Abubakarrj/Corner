import {
  DAYS,
  EMPLOYMENT_TYPES,
  POSITIONS,
  applicationErrors,
  normalizeApplication,
  type Application,
} from "../../(marketing)/careers/application";
import { en, type StringKey } from "../../i18n/en";
import { emailShell, escapeHtml, isEmailConfigured, sendEmail } from "../../email";
import { renderApplicationPdf } from "./applicationPdf";
import { toEnglish, type Translation } from "./translate";
import { clientIp, throttle } from "../../rateLimit";

// Job applications.
//
// The form posts here, this renders the PDF and mails it to the shop.
//
// Between those two: the answers are put into English, because the form asks
// in ten languages and the person reading them reads one. The applicant's own
// words go in the email underneath. See translate.ts — it never blocks the
// send, so a translation outage costs a readable document, not an application.
//
// There is no database: an application is a document somebody reads once and either
// acts on or doesn't, and standing up a store to hold personal data we have no
// plan to query is the wrong trade. The mailbox is the record.
//
// It runs on Node rather than the edge because the PDF font is read off disk.
export const runtime = "nodejs";

// ——— Why this one answers slowly ———
//
// Almost every other endpoint here hands the visitor a response and does its
// real work afterwards, in after(). This one doesn't: it waits for the mail to
// go out, because "Application sent" has to be true. A newsletter signup that
// quietly fails costs somebody an email they didn't ask for yet. A job
// application that quietly fails costs them the job, and they will never find
// out. So the send is awaited and a failure is reported, which lets them press
// the button again.

const HONEYPOT_FIELD = "company";
const MIN_FILL_TIME_MS = 4000;

// Per-IP throttle. The window is generous because a real person can
// legitimately apply twice (once for themselves, once helping a friend on the
// same wifi), and the cost of turning away a genuine applicant is higher than
// the cost of a few extra PDFs. See app/rateLimit.ts for what this is and
// isn't.
const APPLICATIONS = throttle({ windowMs: 60 * 60 * 1000, max: 6 });

// Deliberately no MX lookup, unlike /api/drop-list. A DNS hiccup there costs
// somebody a newsletter; here it would throw away a job application, and we
// have a phone number as a second way to reach them either way.

// Sent through Resend rather than Loops.
//
// The message body used to be a template in the Loops dashboard with a
// {{summary}} slot, and the plan was for the PDF to ride along as an
// attachment. It never did: Loops only sends attachments for accounts whose
// support team has switched the feature on, and until somebody opens that
// ticket the API accepts the call and drops the file — with a 200. An
// application arriving with no application attached is exactly the failure
// this endpoint is written to avoid.
//
// So the body is composed here, in app/api/apply, where it can be read and
// changed with the code that produces it, and the file goes with it. Loops
// still owns the drop list, which is the thing it is actually for.
// Where applications land. The recipient's domain has nothing to do with the
// sending domain and needs no setup of its own — Resend verifies who mail is
// *from*, not who it is to — so this can be any mailbox anywhere.
//
// The default is the address applications are actually meant to reach, rather
// than a leftover from when they went somewhere else. That matters more than
// it looks: an environment variable is easy to misspell, and a wrong name
// falls through to whatever is written here. When that was a stale address the
// failure was silent in the worst way — applications kept arriving, at a
// mailbox nobody was watching, and the only symptom was quiet at the one that
// was. With the fallback correct, an unset variable is simply a working
// configuration.
//
// The variable is still read first, so this can be pointed somewhere else
// without a deploy. Every send logs which address it used; see the end of POST.
const CAREERS_INBOX = process.env.CAREERS_INBOX ?? "hello@publicentity.co";

const t = (key: StringKey): string => en[key];

function chosen<T extends string>(
  ids: readonly T[],
  options: readonly { id: T; label: StringKey }[],
): string {
  return options
    .filter((option) => ids.includes(option.id))
    .map((option) => t(option.label))
    .join(", ");
}

function yesNo(value: boolean | null): string {
  return value === null ? "—" : value ? t("careers.yes") : t("careers.no");
}

/** The whole application as plain text, in the order the form asked. */
function summarize(application: Application): string {
  const lines: string[] = [];
  const add = (label: string, value: string) => {
    if (value.trim() !== "") lines.push(`${label}: ${value}`);
  };

  add("Name", `${application.firstName} ${application.lastName}`.trim());
  add(t("careers.email"), application.email);
  add(t("careers.phone"), application.phone);
  add("Where", [application.city, application.state].filter(Boolean).join(", "));
  lines.push("");
  add(t("careers.applyingFor"), chosen([application.role], POSITIONS));
  add("Applied from", application.location);
  add("Days", chosen(application.days, DAYS));
  add("Hours", chosen(application.employmentTypes, EMPLOYMENT_TYPES));
  add(t("careers.earliestStart"), application.earliestStart);
  lines.push("");
  add(t("careers.authorized"), yesNo(application.authorizedToWork));
  add(t("careers.isAdult"), yesNo(application.isAdult));
  add(t("careers.servSafe"), yesNo(application.servSafe));

  if (application.education.length > 0) {
    lines.push("", t("careers.secSchool"));
    for (const entry of application.education) {
      lines.push(`  ${[entry.school, entry.focus, entry.finished].filter(Boolean).join(" · ")}`);
    }
  }
  if (application.employment.length > 0) {
    lines.push("", t("careers.secWork"));
    for (const entry of application.employment) {
      const when = [entry.from, entry.to].filter(Boolean).join(" – ");
      lines.push(`  ${[entry.employer, entry.role, when].filter(Boolean).join(" · ")}`);
    }
  }
  if (application.references.length > 0) {
    lines.push("", t("careers.secRefs"));
    for (const entry of application.references) {
      lines.push(`  ${[entry.name, entry.relationship, entry.contact].filter(Boolean).join(" · ")}`);
    }
  }

  for (const [key, value] of [
    ["careers.goals", application.goals],
    ["careers.hardestDecision", application.hardestDecision],
    ["careers.toSucceed", application.toSucceed],
    ["careers.heardFrom", application.heardFrom],
  ] as [StringKey, string][]) {
    if (value.trim() === "") continue;
    lines.push("", t(key), `  ${value}`);
  }

  lines.push("", `${t("careers.signature")}: ${application.signature}`);
  return lines.join("\n");
}

/** English first, because that is what somebody is going to read, and the
    applicant's own words under it, because a translation is an interpretation
    and nobody should be judged on a paraphrase with no way to check it. Email
    is HTML and renders every script correctly, so this half is always complete
    even when the PDF's font can't draw the original. */
function bothLanguages(original: Application, translation: Translation): string {
  const english = summarize(translation.english);
  if (!translation.translated) {
    return translation.failed
      ? `NOT TRANSLATED — the translation service was unavailable, so this is` +
          ` as it was written${translation.from ? `, in ${translation.from}` : ""}.\n\n${english}`
      : english;
  }
  return [
    `TRANSLATED INTO ENGLISH${translation.from ? ` FROM ${translation.from.toUpperCase()}` : ""}`,
    english,
    "",
    "———",
    "",
    "AS THE APPLICANT WROTE IT",
    summarize(original),
  ].join("\n");
}

async function mailToShop(
  application: Application,
  translation: Translation,
  pdf: { bytes: Uint8Array; filename: string; substituted: boolean },
): Promise<void> {
  // The name on the envelope is the English one, so a subject line and an
  // inbox list stay legible. The original is in the body.
  const name =
    `${translation.english.firstName} ${translation.english.lastName}`.trim();
  const summary = bothLanguages(application, translation);

  const facts: [string, string][] = [
    ["Applying for", chosen([application.role], POSITIONS)],
    ["Email", application.email],
    ["Phone", application.phone],
  ];
  if (translation.translated) {
    facts.push(["Written in", translation.from ?? "another language"]);
  }
  if (pdf.substituted) {
    // Said at the top rather than buried, so somebody comparing the two knows
    // which one to believe before they start reading.
    facts.push([
      "Note",
      "some answers are in a script the attached PDF's font cannot draw." +
        " They are complete below.",
    ]);
  }

  const html = emailShell(
    [
      `<p style="margin:0 0 4px;font-size:19px;font-weight:600;">${escapeHtml(name)}</p>`,
      `<p style="margin:0 0 18px;color:#6b6760;font-size:13px;">Job application</p>`,
      ...facts.map(
        ([label, value]) =>
          `<p style="margin:0 0 8px;"><span style="color:#6b6760;">${escapeHtml(label)}:</span>` +
          ` ${escapeHtml(value)}</p>`,
      ),
      // Monospaced and preserved, because this block is the answers verbatim —
      // including in scripts the PDF cannot draw, which is the whole reason it
      // is here as well as attached.
      `<pre style="margin:18px 0 0;padding:14px;background:#f2f0ea;border-radius:8px;` +
        `font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;` +
        `line-height:1.55;white-space:pre-wrap;">${escapeHtml(summary)}</pre>`,
    ].join(""),
  );

  const result = await sendEmail({
    to: CAREERS_INBOX,
    subject: `Application — ${name} — ${chosen([application.role], POSITIONS)}`,
    html,
    text: summary,
    // Replying to the mail replies to the applicant, which is what whoever
    // reads it is going to want to do.
    replyTo: application.email,
    attachments: [{ filename: pdf.filename, bytes: pdf.bytes }],
  });

  if (!result.sent) {
    throw new Error(
      `application mail failed: ${result.reason === "failed" ? result.detail : result.reason}`,
    );
  }
}

export async function POST(request: Request) {
  if (APPLICATIONS.exceeded(clientIp(request))) {
    return Response.json({ error: "api.tooManyAttempts" }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "api.badJson" }, { status: 400 });
  }

  const body = (payload ?? {}) as Record<string, unknown>;

  // Both bot signals get the same answer a real submission gets, so an
  // automated sender learns nothing about which check it tripped. Nothing is
  // rendered and nothing is mailed.
  const honeypotFilled =
    typeof body[HONEYPOT_FIELD] === "string" && (body[HONEYPOT_FIELD] as string).length > 0;
  const tooFast =
    typeof body.elapsed_ms === "number" && body.elapsed_ms < MIN_FILL_TIME_MS;
  if (honeypotFilled || tooFast) {
    return Response.json({ ok: true }, { status: 200 });
  }

  // The form ran these too. That copy is a courtesy to the person filling it
  // in; this one is the authority, because anything can post here.
  const application = normalizeApplication(body);
  const missing = applicationErrors(application);
  if (missing.length > 0) {
    return Response.json({ error: missing[0] }, { status: 400 });
  }

  const locale = typeof body.locale === "string" ? body.locale : undefined;
  const translation = await toEnglish(application, locale);

  const note = translation.translated
    ? `Translated into English${translation.from ? ` from ${translation.from}` : ""}.` +
      " The applicant's own words are in the covering email."
    : translation.failed
      ? `Not translated — the translation service was unavailable.` +
        (translation.from ? ` The answers below are in ${translation.from}.` : "")
      : undefined;

  let pdf;
  try {
    pdf = await renderApplicationPdf(translation.english, new Date(), note);
  } catch (error) {
    console.error("[apply] PDF render failed:", error);
    return Response.json({ error: "careers.errSendFailed" }, { status: 500 });
  }

  if (!isEmailConfigured()) {
    console.warn(
      `[apply] no RESEND_API_KEY — application from ${application.email} was NOT mailed.` +
        ` ${pdf.filename}, ${pdf.bytes.length} bytes\n${bothLanguages(application, translation)}`,
    );
    // In development this is a success: the whole application is in the log
    // two lines up, and telling somebody testing a form that it failed is a
    // dead end for no reason.
    //
    // In production it is a failure, and it took an unanswerable "I didn't get
    // an email" to make that obvious. A deployment missing its key would show
    // the applicant "Application sent", show the shop nothing at all, and give
    // neither of them any way to find out — which is the exact shape of bug
    // the note at the top of this file says this endpoint exists to avoid. The
    // applicant gets an error they can act on instead.
    if (process.env.NODE_ENV === "production") {
      return Response.json({ error: "careers.errSendFailed" }, { status: 503 });
    }
    return Response.json({ ok: true, mailed: false }, { status: 200 });
  }

  try {
    await mailToShop(application, translation, pdf);
  } catch (error) {
    console.error("[apply] mail failed:", error);
    return Response.json({ error: "careers.errSendFailed" }, { status: 502 });
  }

  console.info(`[apply] ${application.email} → ${CAREERS_INBOX} (${pdf.filename})`);
  return Response.json({ ok: true, mailed: true }, { status: 200 });
}
