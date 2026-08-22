"use client";

import Link from "next/link";
import { useState } from "react";
import LanguagePicker from "../../ui/LanguagePicker";
import { CONTROL_PILL, DISPLAY_FONT, SHOP_FONT } from "../../shop/shopControls";
import { useLocale, useT, type StringKey } from "../../i18n";
import { SHOP_EMAIL } from "../../shopFacts";
import { EMPLOYMENT_TYPES, POSITIONS, type PositionId } from "./application";
import type { Opening } from "./openings";
import { placeColour } from "./placeColour";
import { TERMS, formatPay, shiftLine, type ResolvedPay } from "./pay";

// The careers page: what the shop is, what it hires for, and a way in.
//
// This used to be the form itself, which asked somebody for four steps of
// answers before telling them anything about the job or the place. The chip on
// the front door said "We Are Hiring!" and the next thing on screen was "First
// name". Reading comes before writing.
//
// ——— The four roles are always listed ———
//
// Not a list of live vacancies, and the copy is careful about that. A shop
// this size doesn't post a requisition and close it; it takes good people when
// it meets them. Listing the four as though each were open this week would be
// a claim that goes stale the moment one is filled, and nobody would notice
// for months. So the page says what it actually means: these are the jobs
// here, we're always glad to hear from somebody good for one.
//
// The upside is there is nothing to maintain. Nothing here can be out of date,
// because nothing here is a date.
//
// ——— And only that ———
//
// It carried two paragraphs of the shop's story for a while, and a strip for
// photographs of the team. Both are gone: this is a board, and the story is
// one tap away on About Us, which sits on the front door beside the link that
// reaches this page.

const POSITION_NOTE: Record<PositionId, StringKey> = {
  counter: "careers.posCounterNote",
  kitchen: "careers.posKitchenNote",
  "shift-lead": "careers.posShiftLeadNote",
  manager: "careers.posManagerNote",
};

/** An opening with the "New" question already answered — see page.tsx. */
// ⚠️ `isNew` is gone from here rather than left unread. The badge it fed was
// replaced by the shop tag — see the note where that is rendered — and a field
// carried through three files for nobody to render is the kind of thing that
// gets a stale value and nobody notices. isNew() itself stays in openings.ts,
// so putting the badge back is a line in each of two files.
export type ListedOpening = Opening & { pay: ResolvedPay | null };

export default function CareersLanding({ openings }: { openings: ListedOpening[] }) {
  const t = useT();
  const locale = useLocale();
  const titleOf = (role: PositionId) =>
    POSITIONS.find((position) => position.id === role)?.label;
  // ——— The board's three filters ———
  //
  // Position, shop, and how much of a week. "" is All, which is the state the
  // page opens in and the only one that can be reached from a fresh visit —
  // there is no filter in the URL, deliberately. A careers page is somewhere
  // people arrive from a chip on the front door, and landing on a pre-narrowed
  // list because of a link somebody shared is how an opening goes unseen.
  const [role, setRole] = useState("");
  const [where, setWhere] = useState("");
  const [hours, setHours] = useState("");

  // What each filter can offer, taken from the openings rather than from the
  // type. TERMS lists what a job *could* be; this lists what is actually being
  // hired for, so the Type filter never offers "Part time" when nothing on the
  // page is part time. Order is the order the shop wrote them in.
  const unique = <T,>(values: T[]) => [...new Set(values)];
  const roleOptions = unique(openings.map((opening) => opening.role));
  const placeOptions = unique(openings.map((opening) => opening.location));
  // Hours are the one facet with a canonical order of its own: full before
  // part, the way the application form lists them. The others take the order
  // the shop wrote them in, which is the only order they have. Sorted against
  // EMPLOYMENT_TYPES rather than left in whatever order the first role that
  // mentions them happens to use, so editing pay.ts cannot reshuffle a filter.
  const hourOptions = unique(
    openings.flatMap((opening) => TERMS[opening.role]?.hours ?? []),
  ).sort(
    (a, b) =>
      EMPLOYMENT_TYPES.findIndex((type) => type.id === a) -
      EMPLOYMENT_TYPES.findIndex((type) => type.id === b),
  );

  const shown = openings.filter(
    (opening) =>
      (role === "" || opening.role === role) &&
      (where === "" || opening.location === where) &&
      (hours === "" ||
        (TERMS[opening.role]?.hours ?? []).includes(hours as "full" | "part")),
  );

  // Whether the shop is worth naming on each row. One shop and it is the same
  // word four times; the filter above says it once. Measured against what is
  // *shown* rather than what exists, so filtering down to one shop takes the
  // repeated word off the rows too.
  const shops = unique(shown.map((opening) => opening.location));
  const oneShop = shops.length === 1 ? shops[0] : null;

  return (
    // ——— White, not cream ———
    //
    // This ran on the shop's cream, which is the ground /shop and /gift use to
    // say "you are inside the ordering app now". Careers is not that. It is a
    // page about the shop, and it sits with /about and the policies, which are
    // the pages the marketing site keeps deliberately white.
    //
    // bg-page rather than a literal, so night follows: the token is white in
    // light and the app's near-black in dark.
    <div className="cb-plain min-h-dvh bg-page" style={{ fontFamily: SHOP_FONT }}>
      <div className="mx-auto max-w-[40rem] px-5 pb-16 pt-5 sm:pt-8">
        <div className="mb-7 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="cb-press relative -ms-1 inline-flex cursor-pointer items-center gap-1.5 rounded-full px-1 py-1 text-[13px] text-muted transition-colors before:absolute before:-inset-[10px] before:content-[''] hover:text-ink"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden
              className="rtl:-scale-x-100"
            >
              <path
                d="M8.5 2.5 4 7l4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t("nav.home")}
          </Link>
          {/* shell="page", because this page is white now. The default
              dresses the pill in bg-surface, which is the warm off-white
              made to sit on cream — on white it reads as a faintly beige
              chip against the ground rather than as part of it. Same call
              the marketing home makes, for the same reason. */}
          <LanguagePicker shell="page" />
        </div>

        {/* ——— The top of a board, not the top of a brand page ———

            This has been through a centred cover with the shop's wordmark on
            it, and it is not that any more. A job board's header is a line
            saying what the page is and a line saying what to do with it, and
            then the jobs — which is what all three references do above their
            list, and what "minimal and to the point" asks for.

            The mark is gone at the shop's request. Worth writing down why it
            reads fine without one: this page is reached from About Us on the
            front door and from a link the shop sends to somebody, so nobody
            arrives here wondering whose jobs these are, and the title says the
            name anyway. A logo would be the third time.

            The "We're hiring" eyebrow went with it. On a page headed "Work at
            Corner Bagel" with a list of open roles under it, a line announcing
            that the shop is hiring is the page's own title said again in
            smaller letters. */}
        {/* ——— A step down, everywhere ———

            The page read as though the browser were zoomed in: a 30/38 title
            over a 24/28 heading over 19px rows, in a 34rem column. Those are
            magazine sizes, and this is a table of four jobs. Everything comes
            down a step — 24/30, 17/19, 16/17 — the column widens to 40rem so
            the rows are lines rather than paragraphs, and the row padding
            tightens from 20px to 16px. The whole board now lands in about the
            height the first two rows used to take. */}
        <header>
          <h1
            className="m-0 text-[24px] font-medium leading-[1.12] tracking-[-0.02em] text-ink sm:text-[30px]"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            {t("careers.title")}
          </h1>
          <p className="m-0 mt-2 max-w-[34em] text-[14px] leading-[1.55] text-muted">
            {t("careers.lede")}
          </p>
        </header>

        {/* ——— The jobs, then the pitch ———

            The other way round for a while: two paragraphs about the shop,
            then the openings underneath. Somebody who pressed "We are
            Hiring!" has already been pitched — what they came for is the
            list, and it was below the fold on a phone.

            Reading still comes before writing, which was the point of having
            a page in front of the form at all. It just turns out the reading
            somebody wants first is what the jobs are, not what the shop is
            like. The shop is what they read second, once one of the jobs has
            caught them. */}
        {/* ——— A priced list, not four cards ———

            It was four rounded boxes, each with a title, a line of copy, a row
            of pill-shaped tags and a chevron. Every one of them the same
            height, the same weight, the same shape. That is the arrangement
            anything reaches for when it does not know what the content is, and
            it showed: the page could have been about four SaaS plans.

            This shop already makes a list of things with prices next to them
            every day, and that is what a job list is. So: rules instead of
            boxes, the name at a size worth reading, and the wage right-aligned
            in the column where a price goes. The eye runs straight down the
            numbers, which is what somebody deciding whether the shift covers
            the bus fare actually came to do.

            It also fixes the thing the tags were invented to hide. Three of
            these pay the same and the fourth has no figure set, so as chips it
            was the same pill repeated three times and then a gap that read as
            a card with a piece missing. In a price column, three matching
            numbers are a rate — that is what a rate looks like on a menu — and
            a blank fourth reads as a price not given, which is the truth. */}
        {/* ——— A heading, not a label ———

            "Open roles" was 11px, uppercase, letterspaced and grey — the same
            treatment as a form field's caption. On a page whose entire purpose
            is the list underneath it, that is the timidest thing on screen:
            the section that matters most was the one set smallest. */}
        {/* The heading, and how many there are at the far end of the same
            line — where the catalog's toolbar puts "27 items".

            Not on the filter row itself, which is where the catalog keeps it.
            The catalog's toolbar carries two controls; this one carries three,
            and at 390px they take the whole width, so a count sharing that row
            wrapped underneath them and sat flush left. On the heading's line it
            is on the far edge at every width, and it is still the last thing
            before the list it counts. */}
        <div className="mt-9 flex items-baseline justify-between gap-3">
          <h2 className="m-0 text-[17px] font-medium leading-[1.2] tracking-[-0.01em] text-ink sm:text-[19px]">
            {t("careers.openRoles")}
          </h2>
          <p className="m-0 shrink-0 text-[11px] tabular-nums text-faint">
            {shown.length === 1
              ? t("careers.roleCountOne")
              : t("careers.roleCount", { count: shown.length })}
          </p>
        </div>

        {/* ——— The three filters ———

            The shop's name used to sit here as a quiet line under the heading,
            because there is one shop and saying it four times down the list was
            three times too many. It is a filter now instead, alongside the job
            and the hours, which says the same thing and does something with it.

            Native <select>. Not the app's own listbox, which is built for the
            language picker's job of showing a current value on a chip: these
            are three controls in a row on a 320px phone, and a native select
            hands the whole list to the platform's own picker — a wheel on iOS,
            a sheet on Android, a menu on a desktop — with keyboard, type-ahead
            and screen-reader support that nobody has to write or test. The only
            thing given up is the arrow's exact drawing, which is worth it.

            Every option comes from the openings themselves, so a facet can
            never offer a filter that returns nothing: add a shop to
            openings.ts and it appears here, remove it and it goes. */}
        {/* ——— The shop's own toolbar, on the careers board ———

            Same row the catalog runs under its category tabs: the controls at
            the start, how many there are at the far end, 11px and quiet. The
            filters wear CONTROL_PILL, which is the sort control's shell — one
            constant, so the height and the radius of a pill on this page and a
            pill on /shop cannot drift apart. It is the same product; a filter
            should not be a different object depending on which page it is on.

            The count is on the heading's line rather than at the end of this
            one; see the note there for why. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Facet
            label={t("careers.allPositions")}
            value={role}
            onChange={setRole}
            options={roleOptions.map((id) => ({
              value: id,
              label: t(titleOf(id) ?? "careers.allPositions"),
            }))}
          />
          <Facet
            label={t("careers.allLocations")}
            value={where}
            onChange={setWhere}
            options={placeOptions.map((place) => ({ value: place, label: place }))}
          />
          <Facet
            label={t("careers.allTypes")}
            value={hours}
            onChange={setHours}
            options={hourOptions.map((id) => ({
              value: id,
              label: t(id === "full" ? "careers.typeFull" : "careers.typePart"),
            }))}
          />
        </div>

        {/* The heavy rule is the list's own top edge now that the heading has
            stopped needing one under it. */}
        <ul className="m-0 mt-5 list-none border-t border-ink p-0">
          {shown.map((opening) => {
            const label = titleOf(opening.role);
            if (!label) return null;
            const terms = TERMS[opening.role];
            // The wage, on its own, in the price column.
            // Everything known about the job, as one quiet line.
            //
            // The wage used to be a column of its own, right-aligned like a
            // price. It has moved in here, first, because the column it stood
            // in now says Apply now — and a rate is a fact about the job
            // rather than the thing to do with it. It is still the first fact
            // on the line, which is where somebody working out whether the
            // shift covers the bus fare looks.
            //
            // These were chips, on the reasoning that a fact wearing the same
            // shape on every row lets the eye compare it — which is true of a
            // grid of boxes and stops being true here. Rows separated by a
            // rule are allowed to be different heights; that is what a list
            // is, as against a set of cards that have to agree. So the facts
            // go back to a sentence-shaped line, in a fixed order, and a row
            // with two of them next to a row with none is unremarkable.
            // ⚠️ The shop is no longer a fact on this line — it is the tag
            // beside the title. Leaving it here as well printed it twice on
            // every row, which is how a list gets longer without saying more.
            const facts: string[] = [];
            if (opening.pay) {
              // Tips get their own phrasing rather than a suffix bolted on.
              // "plus tips" appended to a translated sentence lands in the
              // wrong place in half these languages — Japanese puts the rate
              // after the noun, Persian reads the other way — so the whole
              // line is one string per case.
              const rate =
                opening.pay.per === "year"
                  ? "careers.perYear"
                  : terms?.tips
                    ? "careers.perHourTips"
                    : "careers.perHour";
              facts.push(t(rate, { amount: formatPay(opening.pay, locale) }));
            }
            // A role open both ways says so once. Pushing "Full time" and
            // "Part time" as two facts onto a line that already reads
            // "$18.42 an hour · … · 6 AM–12 PM" makes them look like two
            // claims about the same job rather than a choice between them.
            const hoursHeld = terms?.hours ?? [];
            if (hoursHeld.length > 1) facts.push(t("careers.typeEither"));
            else if (hoursHeld[0])
              facts.push(t(hoursHeld[0] === "full" ? "careers.typeFull" : "careers.typePart"));
            for (const shift of terms?.shifts ?? []) {
              const line = shiftLine(shift, locale);
              if (line) facts.push(line);
            }
            return (
              <li key={`${opening.role}-${opening.location}`} className="border-b border-line">
                <Link
                  href={`/careers/apply?role=${opening.role}&at=${encodeURIComponent(opening.location)}`}
                  // -mx-3 px-3: the row's tap target and its hover wash run a
                  // little wider than the column, so the wash has an edge
                  // rather than stopping exactly on the text. The rule above
                  // stays the column's width, which is what keeps it reading
                  // as a list and not as a table with cells.
                  // ⚠️ py-2.5, and it was py-4. Four rows of padding is
                  // generous on a list of four and heavy on a list of twenty:
                  // the page went from one screen to five when the shop opened
                  // four shops, and most of what grew was air. Ten pixels a
                  // side still clears the 44px tap target — the row is three
                  // lines of text before any padding at all — so this buys
                  // back about a screen and a half without making anything
                  // harder to hit.
                  className="cb-press group -mx-3 block cursor-pointer rounded-xl px-3 py-2.5 transition-colors hover:bg-raise"
                >
                  <span className="flex items-baseline gap-3">
                    {/* font-medium: the names were the only headings on the
                        page set at the body's weight, so at 19px they read as
                        large text rather than as titles. */}
                    <span
                      className="min-w-0 flex-1 text-[16px] font-medium leading-[1.3] text-ink sm:text-[17px]"
                      style={{ fontFamily: DISPLAY_FONT }}
                    >
                      {t(label)}
                      {/* ——— ⚠️ The shop, beside the title, in its own colour ———

                          This was a New badge, and a New badge answers a
                          question nobody on this page is asking: with one row
                          per job per shop, twenty rows are four role names
                          five times over, and the thing you are scanning for
                          is *where*. That was third on a grey line of five
                          facts underneath.

                          So the shop moved up here and took the colour, and it
                          comes out of the facts line below rather than being
                          said twice.

                          ⚠️ The colour is decoration on top of the name, never
                          instead of it. In greyscale, in a screenshot, or for
                          anybody who does not tell violet from indigo, the tag
                          still reads "Larchmont" — nothing here depends on
                          knowing which shop is the green one.

                          Hidden when the board is filtered to one shop, on the
                          same reasoning the fact was: a column that says
                          Larchmont on every row, under a filter that says
                          Larchmont, is a word repeated rather than a word.

                          Two custom properties and a class: the stylesheet
                          turns the pair into a background and an ink, per
                          theme. See placeColour.ts and .cb-place. */}
                      {oneShop === null ? (
                        <span
                          className="cb-place ms-2 inline-block whitespace-nowrap rounded-full px-2 py-[2px] align-[3px] text-[10px] font-medium tracking-[0.02em]"
                          style={
                            {
                              "--cb-place-h": placeColour(opening.location).hue,
                              "--cb-place-s": placeColour(opening.location).saturation,
                            } as React.CSSProperties
                          }
                        >
                          {opening.location}
                        </span>
                      ) : null}
                    </span>
                    {/* ——— Apply now, where the rate used to be ———

                        The row has always been the link; what it lacked was a
                        word saying so. Every reference board ends its row with
                        one, and the wage sitting there instead meant the only
                        thing at the end of the row was a number — which reads
                        as a fact, not as a way in. Three of them said the same
                        number, too.

                        Not a filled button. The whole row is already the tap
                        target, so a button inside it would be a second control
                        for the same act, and four of them stacked down a short
                        page is a lot of paint for a list of four. It is the
                        row's own words, in ink, next to the arrow that was
                        already there. */}
                    <span className="shrink-0 text-[12px] text-ink">
                      {t("careers.applyNow")}
                    </span>
                    {/* ——— The arrow sits at the edge, not after the name ———

                        It was inline, right behind the last word, which is the
                        prettier place for it in English and falls apart in
                        Burmese: the role names wrap there, and a browser will
                        break between the last cluster and an inline element,
                        so the arrow ended up alone on a line of its own.

                        At the row's edge it cannot be orphaned by any
                        language, and it gives every row the same right-hand
                        stop. It follows Apply now, which is what it is the
                        arrow for, and it moves under the pointer. */}
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden
                      className="shrink-0 translate-y-[1px] text-quiet transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100"
                    >
                      <path
                        d="M5.5 2.5 10 7l-4.5 4.5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="mt-0.5 block max-w-[38em] text-[13px] leading-[1.45] text-muted">
                    {t(POSITION_NOTE[opening.role])}
                  </span>
                  {facts.length > 0 ? (
                    <span className="mt-0.5 block text-[12px] leading-[1.45] text-quiet">
                      {facts.join(" · ")}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Nothing matched, said in the list's own space so the page does not
            silently lose its middle. It sits under the rule the list would
            have started with, which is why the rule is on the <ul> and not on
            the first row. */}
        {shown.length === 0 ? (
          <p className="m-0 border-t border-line py-7 text-[14px] leading-[1.55] text-muted">
            {t("careers.noMatches")}
          </p>
        ) : null}

        {/* For somebody who would rather not pick a row. The form asks which
            job when nothing else has.

            Under the list's last rule with room to breathe, so it reads as the
            way out of the list rather than as a fifth thing in it. */}
        <p className="m-0 mt-5 text-[13px] leading-[1.55] text-muted">
          <Link href="/careers/apply" className="underline underline-offset-2 hover:text-ink">
            {t("careers.applyAnyway")}
          </Link>
        </p>

        {/* ——— What these jobs pay, on request, only when they do not say ———

            This sentence went up when the rows carried no wage at all, to
            offer in words what the board was not printing. Every row prints a
            rate now, so it is answering a question the page has already
            answered, and it is gone.

            Conditional rather than deleted, and keyed off what is actually on
            the rows rather than off POSTS_PAY_SCALE: whatever reason the rates
            stop showing — the flag turned off, or MINIMUM_WAGE going stale
            enough that resolvePay refuses to guess — the page should not
            silently become a job board that says nothing about money. The
            offer comes back on its own.

            Labor Code 432.3(b) is untouched by any of this. The duty to give
            an applicant the pay scale when they ask holds at every headcount,
            printed or not; what the law does not require is a sentence
            advertising it. So the obligation stays with the shop and the line
            leaves the page.

            A real mailto rather than "contact us": if it ever shows again, the
            ask has to be one tap or the offer is decorative. */}
        {openings.some((opening) => opening.pay) ? null : (
          <p className="m-0 mt-2.5 text-[13px] leading-[1.55] text-muted">
            {t("careers.payOnRequest")}{" "}
            <a
              href={`mailto:${SHOP_EMAIL}?subject=${encodeURIComponent(t("careers.paySubject"))}`}
              // nowrap: a two-word link is exactly long enough to break after
              // the first word, and "Ask / us" across two lines reads as a typo
              // rather than as the thing to press. It moves whole or not at all.
              className="whitespace-nowrap underline underline-offset-2 hover:text-ink"
            >
              {t("careers.payAsk")}
            </a>
          </p>
        )}

        {/* ——— No "About the shop" ———

            Two paragraphs of the shop's story used to sit here, under a
            heading, with the photo strip after them. They are gone at the
            shop's request, and the page is better for it: this is a board, and
            the story is one tap away on About Us, which is on the front door
            next to the link that reaches this page. Saying it twice made the
            board the shorter half of its own page.

            app/(marketing)/about is where that copy lives and it is untouched.
            The photo strip went with the section — teamPhotos.ts is deleted
            rather than left as a mechanism with nothing to render into. */}

        {/* mt-10, not mt-14. That gap was measured against the two paragraphs
            of shop copy that used to end the page; with those gone it was a
            screen's worth of nothing between the last thing to read and the
            small print. */}
        <footer className="mt-10 border-t border-line pt-5">
          <p className="m-0 text-[11px] leading-[1.7] text-quiet">{t("careers.eeo")}</p>
          <p className="m-0 mt-2.5 text-[11px] leading-[1.7] text-quiet">
            {t("careers.privacyNote")}{" "}
            <Link href="/privacy-policy" className="underline hover:text-ink">
              {t("common.privacyPolicy")}
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}

// One filter, as a native select dressed like the app's pills.
//
// ——— Why a <select> and not the listbox next door ———
//
// LanguagePicker is a hand-built listbox and it earns that: it is one control,
// it shows a globe and a language name, and it lives in a header where its
// exact shape matters. These are three controls in a row on a phone that may
// be 320px wide, and what they need is the platform's own picker — the iOS
// wheel, the Android sheet, the desktop menu — with keyboard support,
// type-ahead, and a screen-reader contract nobody has to write or verify.
//
// The cost is the arrow, which cannot be styled: appearance-none removes the
// platform's and the one drawn here is a background image, so it is a chevron
// in a CSS gradient rather than the app's own SVG. That is the whole of what
// is given up.
//
// ——— The label is the All option ———
//
// There is no "Position:" caption beside the control, because the All option
// is the caption: a filter resting on "All positions" says both what it
// filters and that it is not filtering. A separate label would be the same
// word twice on a row that has to hold three of these.
function Facet({
  label,
  value,
  onChange,
  options,
}: {
  /** What the control reads when nothing is chosen, and its accessible name. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  // ——— Drawn even when it cannot narrow anything ———
  //
  // The first cut hid a facet with fewer than two options, on the reasoning
  // that a filter offering one value is a control that does nothing. That is
  // true of Location today and it hid it, which left a board with one filter on
  // it — and it is not true in general: Type has one option, Full time, and
  // choosing it takes four rows down to one, because a row can have no type at
  // all. The option count was never the question.
  //
  // So the three are always drawn, and the only thing that removes one is
  // having nothing to offer at all. A board whose controls appear and vanish as
  // the shop opens counters is a board that looks different every few months
  // for reasons nobody reading it can see.
  if (options.length === 0) return null;
  const on = value !== "";
  return (
    // The chevron is a sibling, not a background image.
    //
    // It was `background-position: right 14px`, which is a physical edge, and
    // Persian caught it: under RTL the padding moved to the left (pe-8 is
    // logical) and the arrow stayed on the right, so it sat on the first
    // character with a gap behind it. There is no logical keyword for
    // background-position, so the arrow comes out of the background and
    // becomes an element that can be placed with `end-3`.
    //
    // pointer-events-none, so the whole control including the arrow opens the
    // platform's picker rather than the arrow swallowing the tap.
    // CONTROL_PILL is the shop's sort control, shared rather than copied: h-8,
    // rounded-full, an 11px label and the soft border. Height and radius cannot
    // drift between this board and the catalog because there is one constant
    // for both.
    //
    // ——— The chosen pill is not inverted, and that is deliberate ———
    //
    // It was: ink fill, on-ink text. On a phone it came out as a solid black
    // pill with a chevron and no words in it, and the reason is a limit of the
    // platform rather than a mistake in the rule. iOS paints a closed
    // <select>'s label from the *selected option*, not from the select, and an
    // <option> takes the system's own text colour whatever the select says. So
    // the label rendered near-black on a near-black fill while the chevron —
    // a sibling SVG on the wrapper's colour — came out correctly light, which
    // is exactly the half-broken look on the screenshot.
    //
    // Colouring the options is not the way out: the same colour would then be
    // painted into the platform's picker sheet, which is light, and the list
    // would go invisible instead of the pill.
    //
    // So the pill never inverts. Chosen is an ink border, a grey ground and a
    // filled dot at the leading edge; the label is the theme's ordinary text
    // colour in every state, which is the one thing iOS will always render.
    // The dot is a sibling for the same reason the chevron is — nothing that
    // has to be seen goes inside the select.
    <span className="relative inline-flex max-w-[46vw] text-ink">
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        // ps-7 when a dot is showing, so the label clears it.
        className={`${CONTROL_PILL} w-full cursor-pointer appearance-none truncate pe-7 text-ink outline-none transition-colors focus-visible:border-ink ${
          on ? "border-ink bg-raise ps-7 font-medium" : "bg-page ps-3 hover:border-ink"
        }`}
      >
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {on ? (
        <span
          aria-hidden
          className="pointer-events-none absolute start-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-ink"
        />
      ) : null}
      {/* The catalog's own chevron: 9x6, 1.4 stroke. */}
      <svg
        width="9"
        height="6"
        viewBox="0 0 10 6"
        fill="none"
        aria-hidden
        className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2"
      >
        <path
          d="M1 1l4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

