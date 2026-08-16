"use client";

import LanguagePicker from "../../../../ui/LanguagePicker";
import BackButton from "../../../../ui/BackButton";
import { CONTROL_PILL, DISPLAY_FONT, SHOP_FONT } from "../../../../shop/shopControls";
import { useT } from "../../../../i18n";
import { TERMS, formatPay, resolvePay, shiftLine } from "../../pay";
import { POSTS_PAY_SCALE } from "../../pay";
import { useLocale } from "../../../../i18n";
import type { PositionId } from "../../application";
import { HEADINGS, type JobDescription } from "../../jobDescription";

// The description, drawn as a page.
//
// Same palette as the board and the form: `.cb-plain` swaps the shop's warm
// tints for greys on this subtree, so a document reads as a document.
// Defined out here rather than inside the component: a component created
// during render is a new type on every pass, which throws away the subtree
// each time and is what react-hooks/static-components is for.
function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2
        className="m-0 mb-2.5 text-[15px] font-medium leading-[1.3] text-ink"
        style={{ fontFamily: DISPLAY_FONT }}
      >
        {heading}
      </h2>
      {children}
    </section>
  );
}

/** ps-4, a logical property: the marker sits at the start of the line, which
 *  is the right edge in Persian and Urdu. */
function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="m-0 list-disc ps-4 text-[14px] leading-[1.65] text-muted">
      {items.map((item) => (
        <li key={item} className="mt-1.5 first:mt-0">
          {item}
        </li>
      ))}
    </ul>
  );
}

/** A run of paragraphs, at the body size the rest of the page uses. */
function Prose({ body }: { body: string[] }) {
  return (
    <>
      {body.map((paragraph) => (
        <p key={paragraph} className="m-0 mt-2.5 text-[14px] leading-[1.65] text-muted first:mt-0">
          {paragraph}
        </p>
      ))}
    </>
  );
}

export default function JobDescriptionView({
  role,
  description,
  blurb,
  location,
}: {
  role: PositionId;
  description: JobDescription;
  blurb: string;
  location: string;
}) {
  const t = useT();
  const locale = useLocale();
  const terms = TERMS[role];

  // The facts line, from the same place the board's comes from. Read at render
  // rather than passed in: this page is static, and a wage that expires needs
  // the clock. resolvePay returns null rather than a stale number, and the
  // line simply loses an entry.
  const pay = POSTS_PAY_SCALE ? resolvePay(role, new Date()) : null;
  const facts: string[] = [];
  if (pay) {
    const key =
      pay.per === "year"
        ? "careers.perYear"
        : terms?.tips
          ? "careers.perHourTips"
          : "careers.perHour";
    facts.push(t(key, { amount: formatPay(pay, locale) }));
  }
  const hours = terms?.hours ?? [];
  if (hours.length > 1) facts.push(t("careers.typeEither"));
  else if (hours[0]) facts.push(t(hours[0] === "full" ? "careers.typeFull" : "careers.typePart"));
  for (const shift of terms?.shifts ?? []) {
    const line = shiftLine(shift, locale);
    if (line) facts.push(line);
  }

  return (
    <div className="cb-plain min-h-dvh bg-page" style={{ fontFamily: SHOP_FONT }}>
      <div className="mx-auto max-w-[40rem] px-5 pb-16 pt-5 sm:pt-8">
        {/* ——— The way back, and there is exactly one ———

            BackButton rather than a link to /careers, so it returns to
            wherever this was opened from — the board, or the application form
            somebody was halfway through — and falls back to the board only
            when there is nothing of ours behind. Same component and same
            reasoning as the shop's header.

            This is the whole reason the page exists: the PDF had no way back
            inside an installed app. See the note in page.tsx. */}
        <div className="-mx-2.5 mb-6 flex items-center justify-between">
          <BackButton fallback="/careers" />
          <LanguagePicker shell="page" />
        </div>

        <p className="m-0 text-[11px] uppercase tracking-[0.1em] text-quiet">
          {t("careers.jdEyebrow")}
        </p>
        <h1
          className="m-0 mt-1.5 text-[24px] font-medium leading-[1.15] tracking-[-0.02em] text-ink sm:text-[30px]"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          {description.position}
        </h1>
        {facts.length > 0 ? (
          <p className="m-0 mt-2 text-[13px] leading-[1.55] text-muted">{facts.join(" · ")}</p>
        ) : null}

        {/* The three administrative facts, as a plain list rather than a
            table: on a 320px phone a two-column table of label and value
            wraps into something that reads worse than lines do. */}
        <dl className="m-0 mt-5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] leading-[1.6]">
          {[
            [t("careers.jdLocation"), location],
            [t("careers.jdReportsTo"), description.reportsTo],
            [t("careers.jdClassification"), description.classification],
          ].map(([label, value]) => (
            <div key={label} className="col-span-2 grid grid-cols-subgrid">
              <dt className="text-quiet">{label}</dt>
              <dd className="m-0 text-muted">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-7 border-t border-line pt-6">
          <Section heading={HEADINGS.about}>
            <p className="m-0 text-[14px] leading-[1.65] text-muted">{blurb}</p>
          </Section>

          <Section heading={HEADINGS.role}>
            <Prose body={description.role} />
          </Section>

          <Section heading={HEADINGS.doing}>
            <Bullets items={description.doing} />
          </Section>

          <Section heading={HEADINGS.looking}>
            <Bullets items={description.looking} />
          </Section>

          {description.closing ? (
            <Section heading={description.closing.heading}>
              <Prose body={description.closing.body} />
            </Section>
          ) : null}
        </div>

        {/* Apply, and nothing beside it.
            A "Download PDF" link sat here while the description was a document
            first and a page second. The page is the description now, so the
            download offered a second copy of what somebody had just finished
            reading, next to the one thing the page is for. */}
        <div className="mt-9 border-t border-line pt-6">
          <a
            href={`/careers/apply?role=${role}`}
            className={`${CONTROL_PILL} inline-flex h-11 cursor-pointer items-center bg-ink px-5 text-[14px] font-medium text-on-ink transition-opacity hover:opacity-90`}
          >
            {t("careers.applyNow")}
          </a>
        </div>
      </div>
    </div>
  );
}
