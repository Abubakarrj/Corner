"use client";

import Link from "next/link";
import LanguagePicker from "../../ui/LanguagePicker";
import { DISPLAY_FONT, PALETTE, SHOP_FONT } from "../../shop/shopControls";
import { useT, type StringKey } from "../../i18n";
import { LOCATIONS } from "../locations/locations";
import { POSITIONS, type PositionId } from "./application";

const { cream } = PALETTE;

// The careers page: what the shop is, what it hires for, and a way in.
//
// This used to be the form itself, which asked somebody for four steps of
// answers before telling them anything about the job or the place. The chip on
// the front door said "We are hiring!" and the next thing on screen was "First
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

export default function CareersLanding() {
  const t = useT();
  // One shop today. Written as a join so a second one is a data change rather
  // than a copy change.
  const shops = LOCATIONS.filter((place) => place.kind === "shop")
    .map((place) => place.name)
    .join(", ");

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

        <h2 className="m-0 mb-3 mt-11 text-[11px] font-medium uppercase tracking-[0.1em] text-quiet">
          {t("careers.aboutHeading")}
        </h2>
        <p className="m-0 text-[14px] leading-[1.65] text-ink">{t("about.p1")}</p>
        <p className="m-0 mt-3 text-[14px] leading-[1.65] text-ink">{t("about.p2")}</p>

        <h2 className="m-0 mb-2 mt-11 text-[11px] font-medium uppercase tracking-[0.1em] text-quiet">
          {t("careers.rolesHeading")}
        </h2>
        <p className="m-0 text-[13px] leading-[1.55] text-muted">{t("careers.rolesNote")}</p>
        {shops ? (
          <p className="m-0 mt-1 text-[12px] text-quiet">{t("careers.rolesWhere", { shops })}</p>
        ) : null}

        {/* The whole card is the link, so its accessible name is the job title
            and its description rather than four identical "Apply"s in a row. */}
        <ul className="m-0 mt-4 flex list-none flex-col gap-2.5 p-0">
          {POSITIONS.map(({ id, label }) => (
            <li key={id}>
              <Link
                href={`/careers/apply?role=${id}`}
                className="cb-press group flex cursor-pointer items-start gap-3 rounded-2xl border border-line-soft bg-surface p-4 transition-colors hover:border-ink"
              >
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-[16px] leading-tight text-ink"
                    style={{ fontFamily: DISPLAY_FONT }}
                  >
                    {t(label)}
                  </span>
                  <span className="mt-1.5 block text-[13px] leading-[1.5] text-muted">
                    {t(POSITION_NOTE[id])}
                  </span>
                  <span className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink">
                    {t("careers.apply")}
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden
                      className="transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100"
                    >
                      <path
                        d="M5.5 2.5 10 7l-4.5 4.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {/* Picking a card pre-selects that job and nothing more — the form
            still lets you choose several. This is for somebody who would
            rather not decide on a card. */}
        <p className="m-0 mt-4 text-[13px] leading-[1.55] text-muted">
          <Link href="/careers/apply" className="underline hover:text-ink">
            {t("careers.applyAnyway")}
          </Link>
        </p>

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
