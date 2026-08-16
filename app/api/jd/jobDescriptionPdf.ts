import { POSITIONS, type PositionId } from "../../(marketing)/careers/application";
import { DESCRIPTIONS } from "../../(marketing)/careers/jobDescription";
import {
  MINIMUM_WAGE,
  POSTS_PAY_SCALE,
  TERMS,
  formatPay,
  resolvePay,
  shiftLine,
} from "../../(marketing)/careers/pay";
import { en, type StringKey } from "../../i18n/en";
import { MUTED, newSheet } from "../pdfSheet";

// The printable job description, one per role.
//
// ——— Why a PDF and not a page ———
//
// The application used to open with the description inline, above the first
// field, and that was two screens of reading in front of a form. This is the
// same content as a document somebody can keep: mail it to themselves, show it
// to whoever they are asking about the job, read it away from the shop's site.
// The application page carries a link to it instead of the text.
//
// ——— Built from the same source as the board ———
//
// Nothing here is written twice. The bullets come from DESCRIPTIONS, the pay
// and hours and shifts from TERMS, the titles from POSITIONS. Edit any of them
// and the board, the form and this document all move together — which is the
// whole point, because a job description that disagrees with the posting it
// came from is worse than not having one.
//
// English, like the application PDF and for the same reason: it is a document
// that gets printed and handed around, and the descriptions have no
// translations yet in any case.

const t = (key: StringKey): string => en[key];

const TITLE: Record<PositionId, StringKey> = Object.fromEntries(
  POSITIONS.map((position) => [position.id, position.label]),
) as Record<PositionId, StringKey>;

/** What the job pays, as one line, or null when there is nothing to stand
 *  behind. The same three cases the board renders, in the same order, read off
 *  the same functions — including the wage expiry, so a document generated the
 *  day after a rate goes stale prints no rate rather than an old one. */
function payLine(role: PositionId, now: Date): string | null {
  if (!POSTS_PAY_SCALE) return null;
  const pay = resolvePay(role, now);
  if (!pay) return null;
  const amount = formatPay(pay, "en-US");
  if (pay.per === "year") return t("careers.perYear").replace("{amount}", amount);
  const key = TERMS[role]?.tips ? "careers.perHourTips" : "careers.perHour";
  return t(key).replace("{amount}", amount);
}

export type RenderedDescription = { bytes: Uint8Array; filename: string };

export async function renderJobDescriptionPdf(
  role: PositionId,
  now: Date,
): Promise<RenderedDescription> {
  const { doc, sheet } = await newSheet();
  const description = DESCRIPTIONS[role];
  const terms = TERMS[role];

  sheet.text("Corner Bagel", { size: 16 });
  sheet.text(t(TITLE[role]), { size: 11, color: MUTED });
  sheet.gap(4);

  // The facts line, same order as the row on the board: what it pays, what
  // kind of hours, when the shifts run.
  const facts: string[] = [];
  const pay = payLine(role, now);
  if (pay) facts.push(pay);
  const hours = terms?.hours ?? [];
  if (hours.length > 1) facts.push(t("careers.typeEither"));
  else if (hours[0]) facts.push(t(hours[0] === "full" ? "careers.typeFull" : "careers.typePart"));
  for (const shift of terms?.shifts ?? []) {
    const line = shiftLine(shift, "en-US");
    if (line) facts.push(line);
  }
  if (facts.length > 0) sheet.text(facts.join("  ·  "), { size: 9, color: MUTED });

  sheet.gap(10);
  sheet.text(t(description.summary), { size: 11.5 });

  const bullets = (heading: StringKey, items: StringKey[]) => {
    sheet.heading(t(heading));
    for (const item of items) {
      // The dot and the text are drawn as one wrapped string rather than as a
      // glyph plus a hanging indent. pdf-lib has no list primitive, and a
      // second line that lines up under the bullet instead of under the words
      // is the sort of thing that reads as a broken document.
      sheet.value(`•  ${t(item)}`);
    }
  };
  bullets("careers.jdDoing", description.doing);
  bullets("careers.jdLooking", description.looking);

  // ——— The two standing statements ———
  //
  // Printed here because a PDF travels away from the page that carried them.
  // Somebody reading this in a folder a week later has the equal-opportunity
  // statement in front of them, which is where it belongs.
  sheet.heading("Working at Corner Bagel");
  sheet.value(t("careers.eeo"));
  if (POSTS_PAY_SCALE && MINIMUM_WAGE.hourly !== null) {
    sheet.value(
      `Pay shown is current as of ${new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        dateStyle: "long",
      }).format(now)}. Ask us for the pay scale for this or any role.`,
    );
  }

  const bytes = await doc.save();
  return { bytes, filename: `corner-bagel-${role}.pdf` };
}
