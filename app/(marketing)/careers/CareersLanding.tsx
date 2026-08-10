"use client";

import Image from "next/image";
import Link from "next/link";
import LanguagePicker from "../../ui/LanguagePicker";
import { DISPLAY_FONT, PALETTE, SHOP_FONT } from "../../shop/shopControls";
import { useLocale, useT, type StringKey } from "../../i18n";
import { POSITIONS, type PositionId } from "./application";
import type { Opening } from "./openings";
import { TERMS, formatPay, shiftLine, type ResolvedPay } from "./pay";
import { TEAM_PHOTOS } from "./teamPhotos";

const { cream } = PALETTE;

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
    <div className="min-h-dvh" style={{ backgroundColor: cream, fontFamily: SHOP_FONT }}>
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
          <LanguagePicker />
        </div>

        <p className="m-0 text-[11px] font-medium uppercase tracking-[0.16em] text-olive">
          {t("careers.eyebrow")}
        </p>
        <h1
          className="m-0 mt-2.5 text-[30px] font-medium leading-[1.1] tracking-[-0.02em] text-ink sm:text-[36px]"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          {t("careers.title")}
        </h1>
        <p className="m-0 mt-3 max-w-[24em] text-[15px] leading-[1.55] text-muted">
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
        <h2 className="m-0 mb-3 mt-11 flex flex-wrap items-baseline gap-x-2 text-[11px] font-medium uppercase tracking-[0.1em] text-quiet">
          {t("careers.openRoles")}
          {oneShop ? (
            <span className="font-normal normal-case tracking-normal text-quiet">
              {oneShop}
            </span>
          ) : null}
        </h2>

        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {openings.map((opening) => {
            const label = titleOf(opening.role);
            if (!label) return null;
            const terms = TERMS[opening.role];
            // ——— Facts as chips, not as a sentence ———
            //
            // These were joined with middots into one line, and the rows came
            // out ragged: Kitchen carried four facts, Manager none, so no two
            // cards agreed on where anything sat and the column would not
            // scan. Chips give every fact the same shape, so a card with one
            // reads as deliberate rather than as a card missing three.
            //
            // A fixed order — where, then what it pays, then how much of a
            // week, then which hours — so the eye can run down the list and
            // compare the same thing in the same place. Nothing is invented
            // to fill a slot: what isn't known isn't shown. See pay.ts.
            const facts: string[] = oneShop === null ? [opening.location] : [];
            if (opening.pay) {
              facts.push(
                t(opening.pay.per === "hour" ? "careers.perHour" : "careers.perYear", {
                  amount: formatPay(opening.pay, locale),
                }),
              );
            }
            for (const type of terms?.hours ?? []) {
              facts.push(t(type === "full" ? "careers.typeFull" : "careers.typePart"));
            }
            // The shift windows are not chips.
            //
            // First cut made them chips too and the rows went ragged again in
            // a new way: Counter carried four and wrapped onto a second line,
            // Manager carried one, and no two cards were the same height. Two
            // time ranges is simply more text than a tag row can hold.
            //
            // Which is the rule, and it is worth stating: things that are the
            // same on every card get the same treatment, and things that vary
            // get a treatment where varying is expected. Where, what it pays
            // and how much of a week are tags — short, comparable, one line.
            // Which hours is detail, and detail goes on a line of its own,
            // where one card having it and another not is unremarkable.
            const shifts = (terms?.shifts ?? [])
              .map((shift) => shiftLine(shift, locale))
              .filter((line): line is string => line !== null);
            return (
              <li key={`${opening.role}-${opening.location}`}>
                <Link
                  href={`/careers/apply?role=${opening.role}&at=${encodeURIComponent(opening.location)}`}
                  className="cb-press group flex cursor-pointer items-center gap-3 rounded-2xl border border-line-soft bg-surface p-4 transition-colors hover:border-ink"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className="text-[16px] leading-tight text-ink"
                        style={{ fontFamily: DISPLAY_FONT }}
                      >
                        {t(label)}
                      </span>
                      {opening.isNew ? (
                        <span className="rounded-full bg-sun-soft px-2 py-[3px] text-[10px] font-medium uppercase tracking-[0.06em] text-sun-ink">
                          {t("careers.new")}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1.5 block text-[13px] leading-[1.5] text-muted">
                      {t(POSITION_NOTE[opening.role])}
                    </span>
                    <span className="mt-2.5 flex flex-wrap gap-1.5">
                      {facts.map((fact) => (
                        <span
                          key={fact}
                          className="rounded-full border border-line-soft px-2.5 py-1 text-[11px] leading-none text-muted"
                        >
                          {fact}
                        </span>
                      ))}
                    </span>
                    {shifts.length > 0 ? (
                      <span className="mt-2 block text-[11px] leading-[1.5] text-quiet">
                        {shifts.join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  {/* A chevron rather than the word "Apply" on its own line.
                      Four cards each ending in an identical "Apply →" is four
                      lines saying what the whole card already does, and it is
                      the line that made the rows tall and uneven. The card is
                      the link; this is where a list row's arrow lives. */}
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden
                    className="shrink-0 text-quiet transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100"
                  >
                    <path
                      d="M5.5 2.5 10 7l-4.5 4.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* For somebody who would rather not decide on a card. The form asks
            which job when nothing else has. */}
        <p className="m-0 mt-4 text-[13px] leading-[1.55] text-muted">
          <Link href="/careers/apply" className="underline hover:text-ink">
            {t("careers.applyAnyway")}
          </Link>
        </p>

        <h2 className="m-0 mb-3 mt-14 text-[11px] font-medium uppercase tracking-[0.1em] text-quiet">
          {t("careers.aboutHeading")}
        </h2>
        <p className="m-0 text-[14px] leading-[1.65] text-ink">{t("about.p1")}</p>
        <p className="m-0 mt-3 text-[14px] leading-[1.65] text-ink">{t("about.p2")}</p>

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
