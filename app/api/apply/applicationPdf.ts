import {
  DAYS,
  EMPLOYMENT_TYPES,
  POSITIONS,
  type Application,
} from "../../(marketing)/careers/application";
import { en, type StringKey } from "../../i18n/en";
import { MUTED, Sheet, newDocument, safe as safeText } from "../../pdf/sheet";

// The printable application.
//
// The layout engine — word wrapping, page breaks, the font and what it can and
// cannot draw — lives in app/pdf/sheet.ts and is shared with the supply order.
// What is here is this document's own shape: which headings, in which order,
// with which labels.
//
// ——— It is written in English, on purpose ———
//
// The form is translated into ten languages; this document isn't. It is read
// by whoever is hiring, printed, and put in a folder, and a stack where the
// labels change language between sheets is a stack nobody can skim. So every
// label comes from the English table below.
//
// The answers are English too. They arrive here already translated — see
// translate.ts, which runs before this and keeps the applicant's own words for
// the covering email. That is what the `note` argument announces at the top of
// the sheet: this page is a translation, and the original is in the mail with
// it. When translation was unavailable the answers arrive in whatever language
// they were written in, and the note says that instead.

const UNDRAWABLE = "[in the email body — this PDF's font can't draw it]";

const safe = (text: string) => safeText(text, UNDRAWABLE);

const t = (key: StringKey): string => en[key];

function joinLabels<T extends string>(
  chosen: readonly T[],
  options: readonly { id: T; label: StringKey }[],
): string {
  // Ordered by the form, not by whatever order they were tapped in, so two
  // applications with the same availability read identically.
  return options
    .filter((option) => chosen.includes(option.id))
    .map((option) => t(option.label))
    .join(", ");
}

function yesNo(value: boolean | null): string {
  return value === null ? "—" : value ? t("careers.yes") : t("careers.no");
}

export type RenderedApplication = {
  bytes: Uint8Array;
  filename: string;
  /** True when at least one answer had to be replaced, so the covering email
      can say why the PDF points at itself. */
  substituted: boolean;
};

export async function renderApplicationPdf(
  application: Application,
  receivedAt: Date,
  /** Printed under the date when the answers were translated, or when they
      should have been and weren't. A hiring manager weighing how somebody
      writes has to know whether they are reading the applicant or a machine. */
  note?: string,
): Promise<RenderedApplication> {
  const { doc, font } = await newDocument();

  let substituted = false;
  const field = (value: string) => {
    const result = safe(value);
    if (result.substituted) substituted = true;
    return result.text;
  };

  const stamp = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "long",
    timeStyle: "short",
  }).format(receivedAt);

  const sheet = new Sheet(doc, font);

  sheet.text("Corner Bagel", { size: 16 });
  sheet.text("Job application", { size: 11, color: MUTED });
  sheet.gap(4);
  sheet.text(`Received ${stamp}`, { size: 9, color: MUTED });
  if (note) sheet.text(note, { size: 9, color: MUTED });

  sheet.heading(t("careers.secYou"));
  // Substituted as one string rather than two, so an undrawable name says so
  // once instead of printing the notice twice in a row.
  sheet.row(
    `${t("careers.firstName")} / ${t("careers.lastName")}`,
    field(`${application.firstName} ${application.lastName}`),
  );
  sheet.row(t("careers.email"), field(application.email));
  sheet.row(t("careers.phone"), field(application.phone));
  sheet.row(
    `${t("careers.city")} / ${t("careers.state")}`,
    [field(application.city), field(application.state)].filter(Boolean).join(", "),
  );

  sheet.heading(t("careers.secRole"));
  // One job. It is required, so this is never blank on an application that
  // reached here — validation refuses one without it on both sides.
  sheet.value(joinLabels([application.role], POSITIONS));
  // The shop they pressed, when they came in through a card. Blank for
  // somebody who used "Not sure which?", and blank is the truth there.
  if (application.location.trim() !== "") {
    sheet.row("Applied from", field(application.location));
  }

  // "Days available" and "Hours wanted" are written here rather than pulled
  // from the string table, because the form has no label for either — it asks
  // them as two runs of chips under one heading, which reads fine on a phone
  // and would be unlabelled columns on paper.
  sheet.heading(t("careers.secWhen"));
  sheet.row("Days available", joinLabels(application.days, DAYS));
  sheet.row("Hours wanted", joinLabels(application.employmentTypes, EMPLOYMENT_TYPES));
  sheet.row(t("careers.earliestStart"), field(application.earliestStart));

  sheet.heading(t("careers.secChecks"));
  sheet.row(t("careers.authorized"), yesNo(application.authorizedToWork));
  sheet.row(t("careers.isAdult"), yesNo(application.isAdult));
  sheet.row(t("careers.servSafe"), yesNo(application.servSafe));

  if (application.education.length > 0) {
    sheet.heading(t("careers.secSchool"));
    for (const entry of application.education) {
      sheet.row(
        field(entry.school) || t("careers.school"),
        [field(entry.focus), field(entry.finished)].filter(Boolean).join(" · "),
      );
    }
  }

  if (application.employment.length > 0) {
    sheet.heading(t("careers.secWork"));
    for (const entry of application.employment) {
      const when = [field(entry.from), field(entry.to)].filter(Boolean).join(" – ");
      sheet.row(
        field(entry.employer) || t("careers.employer"),
        [field(entry.role), when].filter(Boolean).join(" · "),
      );
    }
  }

  if (application.references.length > 0) {
    sheet.heading(t("careers.secRefs"));
    for (const entry of application.references) {
      sheet.row(
        field(entry.name) || t("careers.refName"),
        [field(entry.relationship), field(entry.contact)].filter(Boolean).join(" · "),
      );
    }
  }

  const written: [StringKey, string][] = [
    ["careers.goals", application.goals],
    ["careers.hardestDecision", application.hardestDecision],
    ["careers.toSucceed", application.toSucceed],
  ];
  if (written.some(([, value]) => value.trim() !== "")) {
    sheet.heading(t("careers.secWords"));
    for (const [key, value] of written) {
      if (value.trim() === "") continue;
      sheet.row(t(key), field(value));
    }
  }

  sheet.heading(t("careers.secSend"));
  if (application.heardFrom.trim() !== "") {
    sheet.row(t("careers.heardFrom"), field(application.heardFrom));
  }
  sheet.row(t("careers.signature"), field(application.signature));
  sheet.gap(4);
  // The same sentence the applicant agreed to, carried onto the document, so
  // what this signature does and does not cover travels with it. It is not a
  // consumer-report authorisation and the paperwork should never be mistaken
  // for one — see the note on `signature` in application.ts.
  sheet.text(t("careers.signatureNote"), { size: 8, color: MUTED });

  if (substituted) {
    sheet.gap(10);
    sheet.text(
      "Some answers were written in a script this document's font cannot draw" +
        " correctly. Those fields are marked above; the covering email has them" +
        " exactly as they were typed.",
      { size: 8, color: MUTED },
    );
  }

  const bytes = await doc.save();
  // Accents are folded rather than stripped, so María José Nguyễn files as
  // Maria-Jose-Nguyen and not Mar-a-Jos-Nguy-n. A name in a script that
  // doesn't decompose to ASCII falls back to "applicant" — a filename is not
  // the place to mangle somebody's name, and the document itself has it.
  const who =
    `${application.firstName} ${application.lastName}`
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "applicant";
  const day = receivedAt.toISOString().slice(0, 10);

  return { bytes, filename: `application-${who}-${day}.pdf`, substituted };
}
