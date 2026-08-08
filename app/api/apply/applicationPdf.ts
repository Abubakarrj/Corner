import { readFileSync } from "node:fs";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  DAYS,
  EMPLOYMENT_TYPES,
  POSITIONS,
  type Application,
} from "../../(marketing)/careers/application";
import { en, type StringKey } from "../../i18n/en";

// The printable application.
//
// One page-per-page renderer, no template library: this document is a stack of
// headings and label/value rows, and a layout engine for that is a hundred
// lines. What it is *not* is an HTML-to-PDF service, which would mean shipping
// a headless browser to draw a form we already know the shape of.
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
//
// ——— The font, and what it can't draw ———
//
// DejaVu Sans is bundled next to this file (Bitstream Vera licence, see
// DejaVuSans-LICENSE.txt) and traced into the build by next.config.ts, the
// same way Riley's briefing is. pdf-lib's built-in Helvetica encodes WinAnsi
// only and *throws* on anything outside it, which would mean an application
// from somebody named Nguyễn taking the whole endpoint down.
//
// DejaVu covers Latin, Greek, Cyrillic and Arabic. It does not cover Chinese,
// Japanese, Korean or Burmese, and pdf-lib does no bidirectional reordering or
// Arabic joining, so Persian and Urdu would come out as disconnected letters
// in the wrong order. Rather than print something that looks like text and
// isn't, any field with a character this font can't honestly draw is replaced
// with a pointer to the email body — which is HTML, and renders every script
// correctly. See UNDRAWABLE below.

const FONT_PATH = join(process.cwd(), "app/api/apply/DejaVuSans.ttf");
const FONT_BYTES = readFileSync(FONT_PATH);

// A second, independent read of the same file. pdf-lib's PDFFont has no
// "do you have this character" method — it will happily encode a codepoint it
// has no glyph for and draw nothing — so coverage is asked of fontkit
// directly.
const COVERAGE = fontkit.create(FONT_BYTES);

const UNDRAWABLE = "[in the email body — this PDF's font can't draw it]";

/** True when every character in the string has a glyph, and none of it is in a
    script we can't lay out correctly (Arabic and Hebrew need joining and
    right-to-left reordering, neither of which pdf-lib does). */
function drawable(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0);
    if (code === undefined) continue;
    if (code === 10 || code === 13 || code === 9) continue;
    if (!COVERAGE.hasGlyphForCodePoint(code)) return false;
    // Arabic, Arabic Supplement/Extended, Hebrew, and the presentation forms.
    if (
      (code >= 0x0590 && code <= 0x08ff) ||
      (code >= 0xfb1d && code <= 0xfdff) ||
      (code >= 0xfe70 && code <= 0xfeff)
    ) {
      return false;
    }
  }
  return true;
}

function safe(text: string): { text: string; substituted: boolean } {
  const trimmed = text.trim();
  if (trimmed === "") return { text: "", substituted: false };
  return drawable(trimmed)
    ? { text: trimmed, substituted: false }
    : { text: UNDRAWABLE, substituted: true };
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT = PAGE_WIDTH - MARGIN * 2;
const INK = rgb(0.11, 0.11, 0.1);
const MUTED = rgb(0.42, 0.42, 0.4);
const RULE = rgb(0.82, 0.82, 0.79);

const t = (key: StringKey): string => en[key];

// The cursor is a page plus a baseline. Everything that draws moves it down
// and asks for a new page when it runs out of room, so no caller has to know
// where it is on the sheet.
class Sheet {
  private readonly doc: PDFDocument;
  private readonly font: PDFFont;
  page: PDFPage;
  y: number;

  constructor(doc: PDFDocument, font: PDFFont) {
    this.doc = doc;
    this.font = font;
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  /** Start a new page unless `height` still fits under the cursor. Callers
      pass the height of a whole block, not of one line — see row(). */
  private room(height: number) {
    if (this.y - height >= MARGIN) return;
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  gap(height: number) {
    this.y -= height;
  }

  private wrap(value: string, size: number, indent: number): string[] {
    const width = CONTENT - indent;
    const fits = (text: string) => this.font.widthOfTextAtSize(text, size) <= width;

    // A run with no space in it can still be wider than the column — a pasted
    // URL, a 120-character employer name, or a language that doesn't put
    // spaces between words. Wrapping on spaces alone would put it on a line of
    // its own and let it run off the right edge of the paper, where it is not
    // merely ugly but gone. So anything that can't fit is cut at the last
    // character that does.
    const chop = (word: string): string[] => {
      if (fits(word)) return [word];
      const pieces: string[] = [];
      let piece = "";
      for (const character of word) {
        if (piece !== "" && !fits(piece + character)) {
          pieces.push(piece);
          piece = "";
        }
        piece += character;
      }
      if (piece !== "") pieces.push(piece);
      return pieces;
    };

    const lines: string[] = [];
    for (const paragraph of value.split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean).flatMap(chop)) {
        const candidate = line ? `${line} ${word}` : word;
        if (fits(candidate) || line === "") {
          line = candidate;
          continue;
        }
        lines.push(line);
        line = word;
      }
      lines.push(line);
    }
    return lines;
  }

  /** How tall this string will be once wrapped. Used to decide a page break
      before drawing anything, rather than discovering it halfway down a
      paragraph. */
  measure(value: string, { size = 10, indent = 0, leading = 1.45 } = {}): number {
    return this.wrap(value, size, indent).length * size * leading;
  }

  /** Word-wrapped text. Returns nothing; the cursor is the output. */
  text(value: string, { size = 10, color = INK, indent = 0, leading = 1.45 } = {}) {
    const lineHeight = size * leading;
    for (const line of this.wrap(value, size, indent)) {
      this.room(lineHeight);
      this.y -= lineHeight;
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y,
        size,
        font: this.font,
        color,
      });
    }
  }

  // A heading reserves room for itself *and* for a first row, so a section
  // title can never be the last thing on a page with its contents overleaf.
  heading(value: string) {
    this.room(34 + 40);
    this.gap(14);
    this.text(value.toUpperCase(), { size: 9, color: MUTED });
    this.y -= 5;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.7,
      color: RULE,
    });
    this.gap(3);
  }

  /** A label and its answer. The two are measured together and moved together:
      an employer's name at the foot of one page with the job overleaf is how a
      printed stack turns into a puzzle. */
  row(label: string, value: string) {
    const shown = value.trim() === "" ? "—" : value;
    const height =
      6 + this.measure(label, { size: 8 }) + this.measure(shown, { size: 10.5 });
    // Capped at a full column: an answer longer than one page has to break
    // somewhere, and text() will do it line by line.
    this.room(Math.min(height, PAGE_HEIGHT - MARGIN * 2));
    this.gap(6);
    this.text(label, { size: 8, color: MUTED });
    this.text(shown, { size: 10.5 });
  }

  /** An answer with no label of its own, for the sections where the heading
      has already said what it is. */
  value(text: string) {
    const shown = text.trim() === "" ? "—" : text;
    this.room(Math.min(6 + this.measure(shown, { size: 10.5 }), PAGE_HEIGHT - MARGIN * 2));
    this.gap(6);
    this.text(shown, { size: 10.5 });
  }
}

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
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(FONT_BYTES, { subset: true });

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
  // The job they pressed a card for, then anything else they'd take — two
  // rows, because they answer two different questions. Flattened into one
  // list, "counter, manager" gives the hiring desk no way to tell what the
  // application is actually for, which is the thing it most needs to know.
  //
  // No card, no job: "Not sure which?" leaves only the list, and that is the
  // whole answer there rather than a missing one.
  if (application.role !== "") {
    sheet.row(t("careers.applyingFor"), joinLabels([application.role], POSITIONS));
    if (application.positions.length > 0) {
      sheet.row(t("careers.alsoHappy"), joinLabels(application.positions, POSITIONS));
    }
  } else {
    sheet.value(joinLabels(application.positions, POSITIONS));
  }
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
