import {
  DAYS,
  EMPLOYMENT_TYPES,
  POSITIONS,
  applicationErrors,
  normalizeApplication,
  type Application,
} from "../../(marketing)/careers/application";
import { en, type StringKey } from "../../i18n/en";
import { renderApplicationPdf } from "./applicationPdf";
import { toEnglish, type Translation } from "./translate";

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

// Best-effort per-IP throttle, in memory — the same shape and the same caveats
// as /api/drop-list. It resets on deploy and doesn't span instances. The
// window is generous because a real person can legitimately apply twice (once
// for themselves, once helping a friend on the same wifi), and the cost of
// turning away a genuine applicant is higher than the cost of a few extra
// PDFs.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 6;
const MAX_TRACKED_IPS = 5000;
const recentByIp = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (recentByIp.get(ip) ?? []).filter((at) => now - at < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    recentByIp.set(ip, recent);
    return true;
  }
  recent.push(now);
  recentByIp.set(ip, recent);
  if (recentByIp.size > MAX_TRACKED_IPS) {
    const oldest = recentByIp.keys().next().value;
    if (oldest !== undefined) recentByIp.delete(oldest);
  }
  return false;
}

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

// Deliberately no MX lookup, unlike /api/drop-list. A DNS hiccup there costs
// somebody a newsletter; here it would throw away a job application, and we
// have a phone number as a second way to reach them either way.

const LOOPS_API_KEY = process.env.LOOPS_API_KEY;
const LOOPS_TRANSACTIONAL_URL = "https://app.loops.so/api/v1/transactional";
// The template lives in the Loops dashboard. It needs one {{summary}} in a
// monospaced block — that's the verbatim text of every answer, which is how an
// application written in Korean or Persian stays readable even though the PDF
// can't draw it. Attachments have to be switched on for the account by Loops
// support; without that, the API accepts the call and drops the file.
const LOOPS_TEMPLATE_ID = process.env.LOOPS_APPLICATION_TRANSACTIONAL_ID;
const CAREERS_INBOX = process.env.CAREERS_INBOX ?? "abu@thecornerbagel.com";

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
  add(t("careers.secRole"), chosen(application.positions, POSITIONS));
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
  const response = await fetch(LOOPS_TRANSACTIONAL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOOPS_API_KEY}`,
    },
    body: JSON.stringify({
      transactionalId: LOOPS_TEMPLATE_ID,
      email: CAREERS_INBOX,
      dataVariables: {
        applicantName: name,
        applicantEmail: application.email,
        applicantPhone: application.phone,
        positions: chosen(application.positions, POSITIONS),
        summary: bothLanguages(application, translation),
        // So the reader knows to trust the text over the attachment when the
        // two disagree, rather than assuming the PDF lost something.
        pdfIncomplete: pdf.substituted ? "yes" : "no",
        translatedFrom: translation.translated ? (translation.from ?? "another language") : "",
      },
      attachments: [
        {
          filename: pdf.filename,
          contentType: "application/pdf",
          data: Buffer.from(pdf.bytes).toString("base64"),
        },
      ],
    }),
  });

  if (!response.ok) {
    const failure = await response.text().catch(() => "");
    throw new Error(`Loops transactional failed (${response.status}): ${failure.slice(0, 300)}`);
  }
}

export async function POST(request: Request) {
  if (isRateLimited(clientIp(request))) {
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

  if (!LOOPS_API_KEY || !LOOPS_TEMPLATE_ID) {
    // Local dev without credentials. Logged loudly rather than silently
    // succeeding, because the difference between "mailed" and "printed to a
    // console" is the whole endpoint.
    console.warn(
      `[apply] no Loops credentials — application from ${application.email} was NOT mailed.` +
        ` ${pdf.filename}, ${pdf.bytes.length} bytes\n${bothLanguages(application, translation)}`,
    );
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
