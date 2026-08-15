"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import LanguagePicker from "../../ui/LanguagePicker";
import { CONTROL_PILL, DISPLAY_FONT, SHOP_FONT } from "../../shop/shopControls";
import { useLocale, useT, type StringKey } from "../../i18n";
import { POSITIONS, type PositionId } from "./application";
import type { Opening } from "./openings";
import { TERMS, formatPay, shiftLine, type ResolvedPay } from "./pay";
import { TEAM_PHOTOS } from "./teamPhotos";

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
// ——— Nothing invented ———
//
// The two paragraphs about the shop are about.p1 and about.p2, already written
// and already translated into all ten languages. about.p3 and p4 are not here:
// they thank the reader for buying breakfast, which is the wrong thing to say
// to somebody who wants to make it.

const POSITION_NOTE: Record<PositionId, StringKey> = {
  counter: "careers.posCounterNote",
  kitchen: "careers.posKitchenNote",
  "shift-lead": "careers.posShiftLeadNote",
  manager: "careers.posManagerNote",
};

/** An opening with the "New" question already answered — see page.tsx. */
export type ListedOpening = Opening & { isNew: boolean; pay: ResolvedPay | null };

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
  const hourOptions = unique(
    openings.flatMap((opening) => TERMS[opening.role]?.hours ?? []),
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
    <div className="min-h-dvh bg-page" style={{ fontFamily: SHOP_FONT }}>
      <div className="mx-auto max-w-[34rem] px-5 pb-20 pt-6 sm:pt-10">
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
        <header>
          <h1
            className="m-0 text-[30px] font-medium leading-[1.08] tracking-[-0.03em] text-ink sm:text-[38px]"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            {t("careers.title")}
          </h1>
          <p className="m-0 mt-2.5 max-w-[30em] text-[15px] leading-[1.55] text-muted">
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
        <div className="mt-11 flex items-baseline justify-between gap-3">
          <h2 className="m-0 text-[24px] font-medium leading-[1.15] tracking-[-0.02em] text-ink sm:text-[28px]">
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
            const rate = opening.pay
              ? t(opening.pay.per === "hour" ? "careers.perHour" : "careers.perYear", {
                  amount: formatPay(opening.pay, locale),
                })
              : null;
            // Everything else about the job, as one quiet line.
            //
            // These were chips, on the reasoning that a fact wearing the same
            // shape on every row lets the eye compare it — which is true of a
            // grid of boxes and stops being true here. Rows separated by a
            // rule are allowed to be different heights; that is what a list
            // is, as against a set of cards that have to agree. So the facts
            // go back to a sentence-shaped line, in a fixed order, and a row
            // with two of them next to a row with none is unremarkable.
            const facts: string[] = oneShop === null ? [opening.location] : [];
            for (const type of terms?.hours ?? []) {
              facts.push(t(type === "full" ? "careers.typeFull" : "careers.typePart"));
            }
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
                  className="cb-press group -mx-3 block cursor-pointer rounded-xl px-3 py-5 transition-colors hover:bg-raise"
                >
                  <span className="flex items-baseline gap-3">
                    {/* font-medium: the names were the only headings on the
                        page set at the body's weight, so at 19px they read as
                        large text rather than as titles. */}
                    <span
                      className="min-w-0 flex-1 text-[19px] font-medium leading-[1.25] text-ink sm:text-[21px]"
                      style={{ fontFamily: DISPLAY_FONT }}
                    >
                      {t(label)}
                      {opening.isNew ? (
                        <span className="ms-2 inline-block whitespace-nowrap rounded-full bg-sun-soft px-2 py-[3px] align-[3px] text-[10px] font-medium uppercase tracking-[0.06em] text-sun-ink">
                          {t("careers.new")}
                        </span>
                      ) : null}
                    </span>
                    {/* tabular-nums, so three matching rates line up digit for
                        digit down the column instead of nearly doing. */}
                    {rate ? (
                      <span className="shrink-0 text-[14px] tabular-nums text-ink">{rate}</span>
                    ) : null}
                    {/* ——— The arrow sits at the edge, not after the name ———

                        It was inline, right behind the last word, which is the
                        prettier place for it in English and falls apart in
                        Burmese: the role names wrap there, and a browser will
                        break between the last cluster and an inline element,
                        so the arrow ended up alone on a line of its own.

                        At the row's edge it cannot be orphaned by any
                        language, and it gives every row the same right-hand
                        stop — including Manager, which has no rate. It is the
                        only affordance left now that the box has gone, which
                        is why it moves under the pointer. */}
                    <svg
                      width="13"
                      height="13"
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
                  <span className="mt-2 block max-w-[34em] text-[14px] leading-[1.5] text-muted">
                    {t(POSITION_NOTE[opening.role])}
                  </span>
                  {facts.length > 0 ? (
                    <span className="mt-1.5 block text-[12px] leading-[1.5] text-quiet">
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
          <p className="m-0 border-t border-line py-8 text-[15px] leading-[1.55] text-muted">
            {t("careers.noMatches")}
          </p>
        ) : null}

        {/* For somebody who would rather not pick a row. The form asks which
            job when nothing else has.

            Under the list's last rule with room to breathe, so it reads as the
            way out of the list rather than as a fifth thing in it. */}
        <p className="m-0 mt-6 text-[14px] leading-[1.55] text-muted">
          <Link href="/careers/apply" className="underline underline-offset-2 hover:text-ink">
            {t("careers.applyAnyway")}
          </Link>
        </p>

        {/* Matching "Open roles" above — the two are the same kind of thing,
            and the eyebrow at the top is the only line dressed differently. */}
        <h2 className="m-0 mb-4 mt-16 text-[26px] font-medium leading-[1.15] tracking-[-0.02em] text-ink sm:text-[30px]">
          {t("careers.aboutHeading")}
        </h2>
        {/* 15/1.7 in a 34em measure, which is running copy rather than the
            14/1.65 caption these were set at. Two paragraphs are the whole of
            what this page says about the shop; they can be read like prose. */}
        <div className="max-w-[34em] text-[15px] leading-[1.7] text-body">
          <p className="m-0">{t("about.p1")}</p>
          <p className="m-0 mt-3.5">{t("about.p2")}</p>
        </div>

        {/* Under the words now, not above them. A photograph of the shop is
            the evidence for the paragraph, and it reads as evidence when it
            follows the claim. */}
        <TeamPhotos />

        <footer className="mt-14 border-t border-line pt-5">
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
    // The chevron is a sibling, not a background image. It was
    // `background-position: right 14px`, which is a physical edge, and Persian
    // caught it: under RTL the padding moved to the leading side (pe- is
    // logical) and the arrow stayed on the right, sitting on the first
    // character. There is no logical keyword for background-position, so the
    // arrow comes out of the background and becomes an element placed with
    // `end-3`. pointer-events-none, so a tap on it still opens the platform's
    // picker rather than being swallowed.
    <span className={`relative inline-flex max-w-[46vw] ${on ? "text-on-ink" : "text-ink"}`}>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${CONTROL_PILL} w-full cursor-pointer appearance-none truncate ps-3 pe-7 text-current outline-none transition-colors focus-visible:border-ink ${
          on ? "border-ink bg-ink" : "hover:border-ink"
        }`}
      >
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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

// The photographs, or nothing at all.
//
// No heading over them and no caption under them: a picture of the shop on a
// page headed "Work at Corner Bagel" needs no label saying it is a picture of
// the shop.
//
// Two columns, one shape, and the last one spans both when the count is odd.
// That single rule is tidy at every count — one photo is a full-width band,
// two sit side by side, three are a pair over a band, four are a block — and
// it never leaves the hole that a mixed portrait-and-landscape grid does,
// because a row whose items are different heights is a row with a gap under
// the short one. The price is that a portrait photo gets cropped, which is a
// better trade than a page with a bite out of it.
function TeamPhotos() {
  const photos = TEAM_PHOTOS;
  if (photos.length === 0) return null;

  return (
    <div className="mt-9 grid grid-cols-2 gap-2.5">
      {photos.map((photo, index) => {
        const band = index === photos.length - 1 && photos.length % 2 === 1;
        return (
          <div
            key={photo.src}
            // A fixed aspect and object-cover, so a photo at the wrong ratio is
            // cropped rather than allowed to shove the page around. Everything
            // below the strip stays where it was.
            className={`relative overflow-hidden rounded-2xl bg-raise ${
              band ? "col-span-2 aspect-[16/9]" : "aspect-[4/3]"
            }`}
          >
            <Image
              src={photo.src}
              alt={photo.alt}
              fill
              className="object-cover"
              // The strip is at the top of the page, so these are what somebody
              // is waiting on. Inside a 34rem column a half-width tile is about
              // 260px on a phone; the hint stops the browser fetching a 1200px
              // file for a 260px hole.
              sizes={
                band
                  ? "(max-width: 34rem) 100vw, 34rem"
                  : "(max-width: 34rem) 50vw, 17rem"
              }
            />
          </div>
        );
      })}
    </div>
  );
}
