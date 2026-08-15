"use client";

import Image from "next/image";
import Link from "next/link";
import LanguagePicker from "../../ui/LanguagePicker";
import { DISPLAY_FONT, SHOP_FONT } from "../../shop/shopControls";
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
  // When every job is at the same shop, the shop is not a fact that
  // distinguishes one row from another — it is the same word four times, and
  // on a 390px card in Spanish it was the word that pushed the tags onto a
  // second line. So it moves up to the heading, where it is said once.
  //
  // Computed, not assumed. The day a second shop opens, this goes back to
  // being a tag on each row, which is where it belongs the moment it starts
  // telling you something.
  const shops = [...new Set(openings.map((opening) => opening.location))];
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

        {/* ——— One eyebrow, not three ———

            "WE'RE HIRING", "OPEN ROLES" and "ABOUT THE SHOP" were all set the
            same way: 11px, uppercase, letterspaced, in a column that is only
            about a screen and a half long. A device used three times in that
            space stops marking anything — it just becomes the texture of the
            page. This is the one that earns it, because it is the only line
            that says what kind of page you have landed on. The other two are
            labels on a list and a paragraph, and they are set as labels. */}
        <p className="m-0 text-[11px] font-medium uppercase tracking-[0.16em] text-olive">
          {t("careers.eyebrow")}
        </p>
        {/* Bigger, and considerably. It was 30px over a 15px lede, which is
            not a hierarchy so much as two sizes of the same thing — and this
            page has no photograph and no illustration, so the title is the
            only thing on it that can carry a top of a page. */}
        <h1
          className="m-0 mt-3 text-[34px] font-medium leading-[1.04] tracking-[-0.03em] text-ink sm:text-[44px]"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          {t("careers.title")}
        </h1>
        <p className="m-0 mt-3.5 max-w-[26em] text-[16px] leading-[1.5] text-muted">
          {t("careers.lede")}
        </p>

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
            the section that matters most was the one set smallest.

            So it is a heading now, at 26/30, in the same weight as the title
            above it. Size does the separating rather than weight, which is how
            the rest of this app is set. The shop's name goes underneath as a
            quiet line rather than beside it, because it is a note about the
            list and not half of its name. */}
        <h2 className="m-0 mt-14 text-[26px] font-medium leading-[1.15] tracking-[-0.02em] text-ink sm:text-[30px]">
          {t("careers.openRoles")}
        </h2>
        {oneShop ? (
          <p className="m-0 mt-1.5 text-[14px] leading-[1.5] text-muted">{oneShop}</p>
        ) : null}

        {/* The heavy rule is the list's own top edge now that the heading has
            stopped needing one under it. */}
        <ul className="m-0 mt-5 list-none border-t border-ink p-0">
          {openings.map((opening) => {
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
