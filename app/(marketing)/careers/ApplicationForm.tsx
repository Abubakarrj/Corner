"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LanguagePicker from "../../ui/LanguagePicker";
import { Button, ButtonLink } from "../../ui/Button";
import Confetti from "../../ui/Confetti";
import { DISPLAY_FONT, SHOP_FONT } from "../../shop/shopControls";
import { useLocale, useServerText, useT, type StringKey } from "../../i18n";
import {
  ANSWER_MAX,
  DAYS,
  EMPLOYMENT_TYPES,
  MAX_HISTORY,
  MAX_REFERENCES,
  POSITIONS,
  applicationErrors,
  type Application,
  type DayId,
  type PositionId,
} from "./application";
import { FRESH, clearDraft, saveDraft, started, useSavedDraft, type Draft } from "./draft";

// The job application.
//
// The questions themselves, and the ones deliberately cut, live in
// application.ts. This file only asks them — but *how* it asks them is most of
// whether anybody finishes.
//
// ——— Four steps, not one scroll ———
//
// Everything below used to be a single column: nine sections, every field on
// screen at once, roughly three thousand pixels of it on a phone. That shape
// is honest about how much there is and terrible at getting it filled in — the
// first thing an applicant sees is the length, and most of that length is
// optional.
//
// So it's four steps, which is also what the checkout and the gift form do:
//
//   You         name, how to reach you, where you are
//   The work    which job (unless a card already said), when you can work,
//               two eligibility questions
//   Background  school, jobs, references — the whole step is skippable and
//               says so at the top
//   Finish      the written answers and the signature
//
// Each step validates on the way out, so you can't arrive at the last one with
// something missing four screens back. Step three has nothing to validate.
//
// ——— Labels above fields, not inside them ———
//
// The first version used the placeholder as the label. It's tidy right up
// until somebody types, at which point the label is gone and the field is a
// box of text with nothing saying what it was for — which matters most on a
// form people go back and check before sending. Every input has a real label
// above it now.

type StepId = "you" | "work" | "history" | "finish";

// Each step owns the errors it is responsible for. applicationErrors() stays
// the single source of truth for *what* is required — this only says which
// screen you'd have to be on to fix it, so Continue can refuse to advance and
// the last step can send you back to the right place.
const STEPS: { id: StepId; label: StringKey; owns: StringKey[] }[] = [
  {
    id: "you",
    label: "careers.stepYou",
    owns: [
      "careers.errFirstName",
      "careers.errLastName",
      "careers.errEmail",
      "careers.errPhone",
      "careers.errCity",
      "careers.errState",
    ],
  },
  {
    id: "work",
    label: "careers.stepWork",
    owns: [
      "careers.errRole",
      "careers.errDays",
      "careers.errTypes",
      "careers.errAuthorized",
      "careers.errAge",
    ],
  },
  { id: "history", label: "careers.stepHistory", owns: [] },
  { id: "finish", label: "careers.stepFinish", owns: ["careers.errSignature"] },
];

const DAY_SHORT: Record<DayId, StringKey> = {
  mon: "careers.dayShortMon",
  tue: "careers.dayShortTue",
  wed: "careers.dayShortWed",
  thu: "careers.dayShortThu",
  fri: "careers.dayShortFri",
  sat: "careers.dayShortSat",
  sun: "careers.dayShortSun",
};

/** The application with whatever the link said folded in: the job applied for
    and the shop it is at. Returns the very same object when there is nothing
    to change, so the identity comparisons that decide whether to write a draft
    keep working.

    A second card replaces the job, which is the only thing it can do now that
    an application is for one job. Somebody who pressed Counter, filled half
    the form in, went back and pressed Kitchen is applying for Kitchen. Every
    answer they had typed is untouched. */
function fromLink(draft: Draft, role: PositionId | null, location: string | null): Draft {
  const setRole = role !== null && draft.application.role !== role;
  const setWhere = location !== null && draft.application.location !== location;
  if (!setRole && !setWhere) return draft;
  return {
    ...draft,
    application: {
      ...draft.application,
      role: setRole ? role : draft.application.role,
      location: setWhere ? location : draft.application.location,
    },
  };
}

const POSITION_LABEL: Record<PositionId, StringKey> = {
  counter: "careers.posCounter",
  kitchen: "careers.posKitchen",
  "shift-lead": "careers.posShiftLead",
  manager: "careers.posManager",
};

const POSITION_NOTE: Record<PositionId, StringKey> = {
  counter: "careers.posCounterNote",
  kitchen: "careers.posKitchenNote",
  "shift-lead": "careers.posShiftLeadNote",
  manager: "careers.posManagerNote",
};

export default function ApplicationForm({
  role,
  location,
}: {
  role: PositionId | null;
  location: string | null;
}) {
  const t = useT();
  const st = useServerText();
  const locale = useLocale();
  const router = useRouter();

  // Two sources, one answer. `saved` is whatever was on the device when the
  // page opened — null on the server and on the first client render, then the
  // real thing once hydration finishes. `edited` is null until somebody
  // touches something, and from then on it is the truth.
  //
  // Keeping the application and the step in one object rather than two states
  // is what makes that work: the moment either changes, both are taken over
  // together, so there is never a half-adopted draft.
  const saved = useSavedDraft();
  const [edited, setEdited] = useState<Draft | null>(null);
  // Whichever card on /careers was pressed, folded into the base. Memoised
  // because it is compared by identity below and feeds the effect that writes
  // the draft.
  const base = useMemo(() => fromLink(saved ?? FRESH, role, location), [saved, role, location]);
  const current = edited ?? base;
  const application = current.application;
  const step = current.step;
  // Both halves of the card press: what they *arrived* with, from the card
  // they pressed or the draft they came back to, as opposed to what the
  // application currently says.
  //
  // Read off `base` rather than the URL, which is what makes the page survive
  // a reload, a tab reopened tomorrow, or a draft picked up on Thursday. Read
  // off `base` rather than `application` for a second reason:
  //
  // The distinction is the whole of how this page avoids saying one thing
  // twice. A form that decides on `application.role` cannot tell "you already
  // told us this" from "you just answered it here", so it either asks a
  // question already answered at the top of the page, or hides the field the
  // instant somebody uses it. Reading `base` separates them: it is the draft
  // and the link folded together, before any edit on this screen.
  //
  //   arrived with a job — the masthead names it, and step two never asks
  //   arrived without    — the general masthead, and step two asks and keeps
  //                        showing the answer
  //
  // Either way the job is on the screen exactly once.
  const arrivedWith = base.application.role === "" ? null : base.application.role;
  const where =
    base.application.location.trim() === "" ? null : base.application.location.trim();
  // Per step, so moving forward doesn't paint the next screen red before it
  // has been touched.
  const [tried, setTried] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // Something appearing pre-filled with no explanation is unsettling, and on a
  // shared device it is somebody else's answers until told otherwise. Stays up
  // after they start editing — it is still a restored application — and goes
  // when "start over" clears the store.
  const restored = saved !== null;
  // Whether the draft actually reached storage. Private mode, a full quota and
  // storage switched off all fail silently, and the difference decides whether
  // walking away from this page is safe or costs everything.
  const [safeToLeave, setSafeToLeave] = useState(true);
  const topRef = useRef<HTMLDivElement>(null);

  // Debounced, because this fires on every keystroke and a write per character
  // is a write per character. 500ms after the typing stops is soon enough that
  // nothing is lost to a tab closing, and rare enough to be free.
  useEffect(() => {
    if (sent) return;
    // Nothing has been touched — the only thing filled in is the job that came
    // from the link. Writing that would mean somebody who merely opened the
    // page and left is told "picked up where you left off" on their way back,
    // for answers they never gave. An existing draft keeps saving.
    if (current === base && saved === null) return;
    if (!started(application)) return;
    const timer = setTimeout(() => {
      setSafeToLeave(saveDraft({ step, application }));
    }, 500);
    return () => clearTimeout(timer);
  }, [application, step, sent, current, base, saved]);

  // Bot defences, matching /api/drop-list: a field no human can see, and a
  // floor on how fast the form can be filled in. Both are checked server-side.
  const [honeypot, setHoneypot] = useState("");

  const missing = useMemo(() => applicationErrors(application), [application]);
  const missingHere = useMemo(
    () => missing.filter((key) => STEPS[step].owns.includes(key)),
    [missing, step],
  );
  const shown = tried.has(step) ? new Set<StringKey>(missingHere) : new Set<StringKey>();
  const problem = (key: StringKey) => (shown.has(key) ? t(key) : null);

  function setApplication(next: Application) {
    setEdited({ step, application: next });
  }

  function set<K extends keyof Application>(key: K, value: Application[K]) {
    setApplication({ ...application, [key]: value });
  }

  function toggle(key: "days" | "employmentTypes", id: string) {
    const list = application[key] as string[];
    setApplication({
      ...application,
      [key]: list.includes(id) ? list.filter((item) => item !== id) : [...list, id],
    });
  }

  // Scrolls rather than jumping: a step change swaps the whole body, and
  // landing halfway down the new one reads as the page having broken.
  function goTo(next: number) {
    setEdited({ step: next, application });
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function advance() {
    setTried((was) => new Set(was).add(step));
    if (missingHere.length > 0) return;
    if (step < STEPS.length - 1) goTo(step + 1);
  }

  /** The first step that still has something missing, or -1. */
  function firstBrokenStep(): number {
    return STEPS.findIndex((entry) => entry.owns.some((key) => missing.includes(key)));
  }

  // Leaving used to lose everything, so it always asked. The draft makes that
  // untrue, and a dialog warning about a loss that won't happen is a dialog
  // that teaches people to dismiss dialogs. It now only asks when the draft
  // could not be written — which is the one case where the warning is real.
  function leave() {
    if (started(application) && !safeToLeave && !window.confirm(t("careers.leaveConfirm"))) return;
    router.push("/careers");
  }

  // Somebody else's half-finished application on a shared phone, or your own
  // that you would rather begin again.
  function startOver() {
    if (!window.confirm(t("careers.startOverConfirm"))) return;
    clearDraft();
    setEdited(fromLink(FRESH, role, location));
    setTried(new Set());
    setError(null);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setTried((was) => new Set(was).add(step));
    if (sending) return;

    // Something earlier is wrong. Go and show it rather than failing here,
    // where the field being complained about isn't on screen.
    const broken = firstBrokenStep();
    if (broken !== -1) {
      setTried((was) => new Set(was).add(broken));
      goTo(broken);
      return;
    }

    // How long the form was open, taken from the submit event rather than from
    // a clock read at mount: event.timeStamp is milliseconds since the page
    // loaded, which is the number we actually want and needs no effect to
    // capture. If a browser doesn't give us one, assume slow — a bot that
    // wants past this can send any number it likes, so the timer only ever
    // catches naive scripts, and the cost of guessing wrong the other way is
    // an application silently thrown away.
    const stamp = event.timeStamp;
    const elapsed = Number.isFinite(stamp) && stamp > 0 ? Math.round(stamp) : 60_000;

    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...application,
          // Rows nobody filled in shouldn't reach the PDF as empty lines.
          education: application.education.filter(
            (row) => row.school.trim() || row.focus.trim() || row.finished.trim(),
          ),
          employment: application.employment.filter(
            (row) => row.employer.trim() || row.role.trim() || row.from.trim() || row.to.trim(),
          ),
          references: application.references.filter(
            (row) => row.name.trim() || row.relationship.trim() || row.contact.trim(),
          ),
          company: honeypot,
          elapsed_ms: elapsed,
          // What they were reading the form in. The server uses it to decide
          // whether the answers need translating before the shop is sent a
          // document it can read.
          locale,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "careers.errSendFailed");
      }
      // Only once it is genuinely away. Clearing on the attempt would throw
      // away the answers on exactly the failure the person needs them for.
      clearDraft();
      setSent(true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "careers.errSendFailed");
    } finally {
      setSending(false);
    }
  }

  if (sent) return <Sent email={application.email.trim()} />;

  const last = step === STEPS.length - 1;


  // ——— Step two ———
  //
  // The job first, then the week, then the two eligibility questions. One
  // shape for everybody, whether a card answered the job or not.
  //
  // The job section is only built when the form has to ask — see arrivedWith.
  // An earlier cut showed it whenever a job was set, which put "Counter &
  // Register" in the headline and again in a field a screen-length below,
  // the second time phrased as a question already answered.
  //
  // It is still shown for the whole visit once it has been asked, rather than
  // disappearing the moment somebody answers. A field that hides itself on
  // being used takes the cards out from under the finger that tapped one, and
  // leaves no way to change an answer you can see.
  //
  // Changing a job that came from a card means Back, then another card. That
  // is one tap further than an inline control and it costs nothing: the draft
  // keeps every answer already typed, and the second card replaces the job
  // rather than adding to it.
  const jobSection = (first: boolean) => (
    <>
      <Legend first={first}>{t("careers.secRole")}</Legend>
      <p className="m-0 mb-2.5 text-[12px] leading-[1.5] text-muted">
        {t("careers.positionsNote")}
      </p>
      {/* Radios, not toggles, and real ones rather than buttons wearing the
          part. One job is the whole point, and a native radio group is what
          says so to a screen reader and what gives arrow-key movement, the
          roving tab stop and "only one" for nothing. The input is hidden and
          the label is the card, so the whole card is the hit target.

          Cards rather than bare pills, because a pill saying "Kitchen and
          prep" tells somebody the name of a job they may never have done; the
          line underneath tells them what the morning is actually like, which
          is the thing they are choosing between. */}
      <div className="flex flex-col gap-2">
        {POSITIONS.map(({ id, label }) => {
          const active = application.role === id;
          return (
            <label
              key={id}
              className={`cb-press flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 text-start transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink/30 ${
                active
                  ? "border-ink bg-raise"
                  : "border-line-soft bg-surface hover:border-line-mute"
              }`}
            >
              <input
                type="radio"
                name="cb-role"
                value={id}
                checked={active}
                onChange={() => set("role", id)}
                className="sr-only"
              />
              <Dot on={active} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] leading-tight text-ink">{t(label)}</span>
                <span className="mt-1 block text-[12px] leading-[1.45] text-muted">
                  {t(POSITION_NOTE[id])}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <Problem>{problem("careers.errRole")}</Problem>
    </>
  );

  const whenSection = (first: boolean) => (
    <>
      <Legend first={first}>{t("careers.secWhen")}</Legend>
      <p className="m-0 mb-2.5 text-[12px] leading-[1.5] text-muted">
        {t("careers.daysNote")}
      </p>
      {/* Seven across. As a column of seven wordy pills this was the
          tallest control on the page and the hardest to read as a
          week; as a row it's a week. */}
      <div className="grid grid-cols-7 gap-1.5">
        {DAYS.map(({ id, label }) => {
          const active = application.days.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              aria-label={t(label)}
              onClick={() => toggle("days", id)}
              className={`cb-press flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-1 py-1.5 text-center text-[11px] leading-[1.15] transition-colors ${
                active
                  ? "border-ink bg-ink text-on-ink"
                  : "border-line-soft bg-surface text-muted hover:border-line-mute"
              }`}
            >
              {/* Wraps rather than truncates, and wraps *anywhere*
                  rather than only at spaces. A seven-across row leaves
                  about 43px a cell, which is plenty for "Wed" and six
                  short of တနင်္ဂနွေ, and Burmese offers no space to
                  break at — so plain wrapping left it spilling over its
                  neighbour. A day name cut off names no day at all; a
                  wrapped one still does, and the cells grow to match
                  the tallest. */}
              <span aria-hidden className="[overflow-wrap:anywhere]">
                {t(DAY_SHORT[id])}
              </span>
            </button>
          );
        })}
      </div>
      <Problem>{problem("careers.errDays")}</Problem>

      <p className="m-0 mb-2.5 mt-6 text-[12px] leading-[1.5] text-muted">
        {t("careers.typesNote")}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {EMPLOYMENT_TYPES.map(({ id, label }) => {
          const active = application.employmentTypes.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => toggle("employmentTypes", id)}
              className={`cb-press cursor-pointer rounded-xl border px-2 py-3 text-[12px] leading-tight transition-colors ${
                active
                  ? "border-ink bg-ink text-on-ink"
                  : "border-line-soft bg-surface text-ink hover:border-line-mute"
              }`}
            >
              {t(label)}
            </button>
          );
        })}
      </div>
      <Problem>{problem("careers.errTypes")}</Problem>

      <div className="mt-6">
        <Field
          label={t("careers.earliestStart")}
          type="date"
          value={application.earliestStart}
          onChange={(value) => set("earliestStart", value)}
          optional
        />
      </div>
    </>
  );

  return (
    // White in light, near-black in dark. Same ground as the careers page
    // this arrived from, for the reason written there.
    <div className="min-h-dvh bg-page" style={{ fontFamily: SHOP_FONT }}>
      <div ref={topRef} className="mx-auto max-w-[34rem] px-5 pb-20 pt-6 sm:pt-10">
        {/* ——— The way out ———
            The Back button in the action row moves between steps; it does not
            leave, and it isn't there on the first one. Without this there was
            no way off the page at all except the browser's own back — which an
            installed PWA may not show, and which somebody two steps in would
            have to press twice for reasons the page never explained.

            It goes to /careers rather than home: that is the page that sent
            them here, and the one with the answer to "what was this job
            again?". */}
        {/* The way out on the start side, the language on the end side. Both
            are 28px and sit on one row, the same shape as the strip on the
            front door.

            The picker is here rather than only on the home page because this
            is a page somebody can arrive at directly — from a link, a QR code
            in the window, a text from a friend — and the language they need is
            not one they should have to go somewhere else to set. Changing it
            re-renders in place: setLocale fires an event, it doesn't navigate,
            so a half-filled form survives the switch. */}
        <div className="mb-7 flex items-center justify-between gap-3">
          {/* 28px of text and icon, with the rest of a 44px target added by a
              pseudo-element rather than by padding — padding here would push
              the masthead down for a control that should read as a quiet line
              above it. Same trick, same reason, as BagelMark. */}
          <button
            type="button"
            onClick={leave}
            className="cb-press relative -ms-1 inline-flex cursor-pointer items-center gap-1.5 rounded-full px-1 py-1 text-[13px] text-muted transition-colors before:absolute before:-inset-[10px] before:content-[''] hover:text-ink"
          >
            {/* Mirrored under Urdu and Persian with the document, so the arrow
                points the way back rather than the way on. */}
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
            {t("common.back")}
          </button>

          {/* shell="page", because this page is white now. The default
              dresses the pill in bg-surface, which is the warm off-white
              made to sit on cream — on white it reads as a faintly beige
              chip against the ground rather than as part of it. Same call
              the marketing home makes, for the same reason. */}
          <LanguagePicker shell="page" />
        </div>

        {/* ——— Masthead ———
            When a card sent them here, the job is the headline. This page used
            to open with the same eyebrow, the same title and the same lede as
            /careers, which told somebody who had just pressed "Manager,
            Hancock Park" nothing at all — not even that the press had
            registered. The most useful sentence at the top of a form is what
            it is a form for.

            Without a job (the "Not sure which?" way in) there is nothing to
            headline, so it keeps the general one. */}
        {arrivedWith ? (
          <>
            <p className="m-0 text-[11px] font-medium uppercase tracking-[0.16em] text-olive">
              {t("careers.applyingFor")}
            </p>
            <h1
              className="m-0 mt-3 text-[34px] font-medium leading-[1.04] tracking-[-0.03em] text-ink sm:text-[44px]"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              {t(POSITION_LABEL[arrivedWith])}
            </h1>
            {/* Just the shop. There used to be a "Different job?" link here,
                back to the openings list — which is now the long way round to
                something the job field does in place, without losing your
                spot in the form. Back, at the top of the page, still goes to
                the list for anybody who wants to see it. */}
            {where ? (
              <p className="m-0 mt-3 text-[15px] leading-[1.55] text-ink">{where}</p>
            ) : null}
          </>
        ) : (
          <>
            <p className="m-0 text-[11px] font-medium uppercase tracking-[0.16em] text-olive">
              {t("careers.eyebrow")}
            </p>
            <h1
              className="m-0 mt-3 text-[34px] font-medium leading-[1.04] tracking-[-0.03em] text-ink sm:text-[44px]"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              {t("careers.title")}
            </h1>
            <p className="m-0 mt-3 max-w-[24em] text-[15px] leading-[1.55] text-muted">
              {t("careers.lede")}
            </p>
          </>
        )}

        {/* ——— Where you are ———
            A rail of four segments rather than "1 2 3 4" circles: the segment
            widths make the remaining distance legible at a glance, which is
            the only thing a progress indicator is for. Visited steps are
            pressable so going back to change an answer costs one tap. */}
        {/* ——— "This was already here" ———
            A form that opens pre-filled with no explanation is unsettling, and
            on a shared phone the answers in it may not be yours. So it says
            where they came from, and the way to be rid of them is in the same
            sentence rather than somewhere you'd have to go looking. */}
        {restored ? (
          <div
            role="status"
            className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-line-soft bg-surface px-4 py-3"
          >
            <p className="m-0 min-w-0 flex-1 text-[12px] leading-[1.5] text-muted">
              {t("careers.draftRestored")}
            </p>
            <button
              type="button"
              onClick={startOver}
              className="cb-press shrink-0 cursor-pointer text-[12px] text-ink underline transition-opacity hover:opacity-70"
            >
              {t("careers.startOver")}
            </button>
          </div>
        ) : null}

        <nav aria-label={t("careers.stepOf", { n: step + 1, total: STEPS.length })} className="mt-9">
          <div className="flex gap-1.5">
            {STEPS.map((entry, index) => {
              const done = index < step;
              const here = index === step;
              return (
                <button
                  key={entry.id}
                  type="button"
                  disabled={index > step}
                  aria-current={here ? "step" : undefined}
                  onClick={() => goTo(index)}
                  className="cb-press group flex-1 cursor-pointer text-start disabled:cursor-default"
                >
                  <span
                    className={`block h-[3px] rounded-full transition-colors ${
                      done || here ? "bg-ink" : "bg-line-soft"
                    }`}
                  />
                  <span
                    className={`mt-2 block truncate text-[11px] leading-tight transition-colors ${
                      here ? "text-ink" : "text-quiet"
                    }`}
                  >
                    {t(entry.label)}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        <form onSubmit={send} noValidate className="mt-8">
          {/* Invisible to a person, tempting to a form-filler. See the note in
              app/api/drop-list/route.ts — the name is the point. */}
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
            className="absolute left-[-9999px] h-0 w-0 opacity-0"
          />

          {step === 0 ? (
            <>
              <StepHead title={t("careers.secYou")} />
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label={t("careers.firstName")}
                    value={application.firstName}
                    onChange={(value) => set("firstName", value)}
                    error={problem("careers.errFirstName")}
                    autoComplete="given-name"
                  />
                  <Field
                    label={t("careers.lastName")}
                    value={application.lastName}
                    onChange={(value) => set("lastName", value)}
                    error={problem("careers.errLastName")}
                    autoComplete="family-name"
                  />
                </div>
                <Field
                  label={t("careers.email")}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={application.email}
                  onChange={(value) => set("email", value)}
                  error={problem("careers.errEmail")}
                />
                <Field
                  label={t("careers.phone")}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={application.phone}
                  onChange={(value) => set("phone", value)}
                  error={problem("careers.errPhone")}
                />
                {/* City and state, never a street address. Knowing the commute is
                    plausible is the whole reason to ask; the rest would be
                    personal data held for nothing. */}
                <div className="grid grid-cols-[2fr_1fr] gap-3">
                  <Field
                    label={t("careers.city")}
                    value={application.city}
                    onChange={(value) => set("city", value)}
                    error={problem("careers.errCity")}
                    autoComplete="address-level2"
                  />
                  <Field
                    label={t("careers.state")}
                    value={application.state}
                    onChange={(value) => set("state", value)}
                    error={problem("careers.errState")}
                    autoComplete="address-level1"
                  />
                </div>
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <StepHead title={t("careers.stepWork")} />
              {arrivedWith ? null : jobSection(true)}
              {whenSection(arrivedWith !== null)}

              <Legend>{t("careers.secChecks")}</Legend>
              <div className="flex flex-col gap-2.5">
                <YesNo
                  question={t("careers.authorized")}
                  value={application.authorizedToWork}
                  onChange={(value) => set("authorizedToWork", value)}
                  error={problem("careers.errAuthorized")}
                />
                {/* Asked as a yes or no, never as a date of birth, and the
                    reason is printed under it rather than left for the
                    applicant to wonder about. See application.ts. */}
                <YesNo
                  question={t("careers.isAdult")}
                  note={t("careers.isAdultNote")}
                  value={application.isAdult}
                  onChange={(value) => set("isAdult", value)}
                  error={problem("careers.errAge")}
                />
                <YesNo
                  question={t("careers.servSafe")}
                  note={t("careers.servSafeNote")}
                  value={application.servSafe}
                  onChange={(value) => set("servSafe", value)}
                />
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <StepHead title={t("careers.stepHistory")} note={t("careers.skipNote")} />

              <Legend first>{t("careers.secWork")}</Legend>
              <Rows
                rows={application.employment}
                max={MAX_HISTORY}
                addLabel={t("careers.addJob")}
                title={(n) => t("careers.jobN", { n })}
                blank={() => ({ employer: "", role: "", from: "", to: "" })}
                onChange={(rows) => set("employment", rows)}
                render={(row, update) => (
                  <div className="flex flex-col gap-2.5">
                    <Field
                      label={t("careers.employer")}
                      value={row.employer}
                      onChange={(value) => update({ ...row, employer: value })}
                    />
                    <Field
                      label={t("careers.role")}
                      value={row.role}
                      onChange={(value) => update({ ...row, role: value })}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <Field
                        label={t("careers.from")}
                        value={row.from}
                        onChange={(value) => update({ ...row, from: value })}
                      />
                      <Field
                        label={t("careers.to")}
                        value={row.to}
                        onChange={(value) => update({ ...row, to: value })}
                      />
                    </div>
                  </div>
                )}
              />

              <Legend>{t("careers.secSchool")}</Legend>
              <Rows
                rows={application.education}
                max={MAX_HISTORY}
                addLabel={t("careers.addSchool")}
                title={(n) => t("careers.schoolN", { n })}
                blank={() => ({ school: "", focus: "", finished: "" })}
                onChange={(rows) => set("education", rows)}
                render={(row, update) => (
                  <div className="flex flex-col gap-2.5">
                    <Field
                      label={t("careers.school")}
                      value={row.school}
                      onChange={(value) => update({ ...row, school: value })}
                    />
                    <div className="grid grid-cols-[2fr_1fr] gap-3">
                      <Field
                        label={t("careers.focus")}
                        value={row.focus}
                        onChange={(value) => update({ ...row, focus: value })}
                      />
                      <Field
                        label={t("careers.finished")}
                        inputMode="numeric"
                        value={row.finished}
                        onChange={(value) => update({ ...row, finished: value })}
                      />
                    </div>
                  </div>
                )}
              />

              <Legend>{t("careers.secRefs")}</Legend>
              <p className="m-0 mb-2.5 text-[12px] leading-[1.5] text-muted">
                {t("careers.refsNote")}
              </p>
              <Rows
                rows={application.references}
                max={MAX_REFERENCES}
                addLabel={t("careers.addReference")}
                title={(n) => t("careers.refN", { n })}
                blank={() => ({ name: "", relationship: "", contact: "" })}
                onChange={(rows) => set("references", rows)}
                render={(row, update) => (
                  <div className="flex flex-col gap-2.5">
                    <Field
                      label={t("careers.refName")}
                      value={row.name}
                      onChange={(value) => update({ ...row, name: value })}
                    />
                    <Field
                      label={t("careers.refRelationship")}
                      value={row.relationship}
                      onChange={(value) => update({ ...row, relationship: value })}
                    />
                    <Field
                      label={t("careers.refContact")}
                      value={row.contact}
                      onChange={(value) => update({ ...row, contact: value })}
                    />
                  </div>
                )}
              />
            </>
          ) : null}

          {step === 3 ? (
            <>
              <StepHead title={t("careers.secWords")} note={t("careers.skipNote")} />
              <Answer
                label={t("careers.goals")}
                value={application.goals}
                onChange={(value) => set("goals", value)}
              />
              <Answer
                label={t("careers.hardestDecision")}
                value={application.hardestDecision}
                onChange={(value) => set("hardestDecision", value)}
              />
              <Answer
                label={t("careers.toSucceed")}
                value={application.toSucceed}
                onChange={(value) => set("toSucceed", value)}
              />
              <div className="mt-5">
                <Field
                  label={t("careers.heardFrom")}
                  value={application.heardFrom}
                  onChange={(value) => set("heardFrom", value)}
                  optional
                />
              </div>

              <Legend>{t("careers.secSend")}</Legend>
              <div className="rounded-2xl border border-line-soft bg-surface p-4">
                <p className="m-0 text-[12px] leading-[1.6] text-muted">
                  {t("careers.signatureNote")}
                </p>
                <div className="mt-3">
                  <Field
                    label={t("careers.signature")}
                    value={application.signature}
                    onChange={(value) => set("signature", value)}
                    error={problem("careers.errSignature")}
                    onSurface
                  />
                  </div>
              </div>
            </>
          ) : null}

          {error ? (
            <p role="alert" className="m-0 mt-5 text-center text-[13px] text-brand-red">
              {st(error)}
            </p>
          ) : null}

          {/* ——— The way on ———
              In the page's flow rather than stuck to the bottom of the screen.
              A bar fixed to the floor would land on the cookie banner and the
              privacy line, which are both already docked there; and with four
              short steps the button is never more than a thumb-flick away.

              Never disabled for validation. A greyed-out button with no stated
              reason is a dead end — you can't press it to find out what's
              wrong, so you're left guessing which field it dislikes. Pressing
              it either moves on or says what's missing. */}
          <div className="mt-9 flex items-center gap-3">
            {step > 0 ? (
              <Button type="button" variant="secondary" onClick={() => goTo(step - 1)}>
                {t("common.back")}
              </Button>
            ) : null}
            {last ? (
              <Button type="submit" className="flex-1" disabled={sending}>
                {sending ? t("careers.sending") : t("careers.submit")}
              </Button>
            ) : (
              <Button type="button" className="flex-1" onClick={advance}>
                {t("checkout.continue")}
              </Button>
            )}
          </div>

          <p className="m-0 mt-3 text-center text-[11px] text-quiet">
            {tried.has(step) && missingHere.length > 0 ? (
              <span role="alert" className="text-brand-red">
                {t(missingHere[0])}
              </span>
            ) : (
              t("careers.stepOf", { n: step + 1, total: STEPS.length })
            )}
          </p>
        </form>

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

function Sent({ email }: { email: string }) {
  const t = useT();
  return (
    // relative, so the confetti canvas fills the whole screen rather than the
    // card. That is the opposite of what the purchase screen does, and for a
    // reason worth writing down: this card is short — a tick, two lines and a
    // button — and the burst comes from two launchers near the *bottom* of
    // whatever box it is given, firing upward like party poppers. Given only
    // the card, every piece left through the top edge within a few hundred
    // milliseconds and the celebration was a dozen scraps. Given the screen,
    // the poppers sit below the card and the confetti rises past it and falls
    // the full height, which is the effect the component was written for.
    <div
      className="relative flex min-h-dvh items-center justify-center bg-page px-5"
      style={{ fontFamily: SHOP_FONT }}
    >
      {/* Nothing at all under prefers-reduced-motion — the component checks.
          The tick and the wording carry the moment on their own. */}
      <Confetti />

      {/* Above the canvas in the stacking order, so a piece of confetti can't
          land on top of the applicant's own email address. */}
      <div className="cb-rise relative w-full max-w-sm text-center">
        <span
          aria-hidden
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--cb-good-bg)" }}
        >
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <path
              d="M6 13.4l4.6 4.6L20 8.6"
              stroke="var(--cb-ink)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <p
          className="m-0 mt-5 text-[26px] font-medium leading-tight tracking-[-0.01em] text-ink"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          {t("careers.sentTitle")}
        </p>
        <p className="m-0 mx-auto mt-3 text-[14px] leading-[1.6] text-muted">
          {t("careers.sentBody", { contact: email })}
        </p>
        {/* Not common.backToMenu. Every other use of that string links to
            /shop, which really is the menu; this one goes to the front door,
            and a button that names a destination it doesn't go to is worse
            than one more line in the string table. */}
        <ButtonLink href="/" variant="secondary" className="mt-8 w-full">
          {t("careers.sentDone")}
        </ButtonLink>
      </div>
    </div>
  );
}

// ——— Pieces ———

function StepHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-5">
      <h2
        className="m-0 text-[20px] font-medium leading-tight tracking-[-0.01em] text-ink"
        style={{ fontFamily: DISPLAY_FONT }}
      >
        {title}
      </h2>
      {note ? (
        <p className="m-0 mt-1.5 text-[12px] leading-[1.55] text-muted">{note}</p>
      ) : null}
    </div>
  );
}

/** A sub-heading inside a step. `first` drops the top margin for the one that
    opens a step, so it doesn't push a gap under the step's own heading. */
function Legend({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <h3
      className={`m-0 mb-2.5 text-[11px] font-medium uppercase tracking-[0.1em] text-quiet ${
        first ? "" : "mt-8"
      }`}
    >
      {children}
    </h3>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="m-0 mt-2 text-[12px] text-brand-red">
      {children}
    </p>
  );
}

/** The mark on a job card. Round rather than a tick, because the shape is the
    first thing that says how many you may pick — a square with a check in it
    promises a list you can keep adding to, and there is exactly one job. */
function Dot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${
        on ? "border-ink" : "border-line-mute bg-surface"
      }`}
    >
      {on ? <span className="h-[9px] w-[9px] rounded-full bg-ink" /> : null}
    </span>
  );
}

// A labelled input.
//
// The label is a real <label> above the box rather than the placeholder, so it
// survives being typed into — which is exactly when somebody re-reading the
// form needs it. `optional` marks the few fields that aren't required, since
// on a form where most things are needed the absence of a mark reads as
// "required" and the marked ones are the news.
function Field({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  autoComplete,
  error,
  optional,
  onSurface,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: "text" | "email" | "tel" | "numeric";
  autoComplete?: string;
  error?: string | null;
  optional?: boolean;
  /** On a surface-coloured card, where a surface-coloured input would vanish. */
  onSurface?: boolean;
}) {
  const t = useT();
  // useId, not a module counter: a counter shared across requests on the
  // server hands the browser ids the client's own counter would never
  // reproduce, and the hydration mismatch unhooks every label from its input.
  const id = useId();
  // No margin of its own. A Field used to space itself with `mt-4 first:mt-0`,
  // which is right in a column and wrong in a grid: `first-child` is the first
  // *cell*, so the left half of a two-up pair cleared its margin and the right
  // half kept it, and every paired row sat a step lower on one side. Spacing
  // is the parent's job now — see the flex columns in each step.
  // The label wraps rather than truncating, and the label *box* is what
  // stretches to fill a grid cell — not the input. Both halves matter:
  // "Premier jour où vous pouvez commencer" clipped to "Premier jour où
  // pouv…" on a 320px screen names nothing, and a label is the whole
  // explanation of what to type. But letting one label wrap inside a
  // two-up pair would push its input a line below its neighbour's. Growing
  // the label instead keeps both inputs on the same line, which is the
  // thing the eye actually reads the row by.
  return (
    <div className="flex h-full flex-col">
      <label
        htmlFor={id}
        className="mb-1.5 flex flex-1 items-baseline gap-2 text-[12px] text-muted"
      >
        <span className="min-w-0 flex-1">{label}</span>
        {optional ? (
          <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-quiet">
            {t("careers.optional")}
          </span>
        ) : null}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-xl border px-3.5 py-3 text-[16px] text-ink outline-none transition-colors focus:border-ink ${
          // On a card, the field sinks to the page colour; on the page, it
          // lifts to the card colour. Either way it is one step away from
          // whatever it is sitting on. It used to sink to cream, which was a
          // warm tint on a warm ground and is now a warm tint on a white one.
          onSurface ? "bg-page" : "bg-surface"
        } ${error ? "border-brand-red" : "border-line-soft"}`}
      />
      <Problem>{error}</Problem>
    </div>
  );
}

// The counter only appears once the box is most of the way full. A running
// "0/800" under an empty field reads as a length you're expected to reach.
const COUNTER_FROM = ANSWER_MAX * 0.7;

function Answer({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="mt-5 first:mt-0">
      <label htmlFor={id} className="mb-2 block text-[14px] leading-[1.45] text-ink">
        {label}
      </label>
      <textarea
        id={id}
        rows={4}
        maxLength={ANSWER_MAX}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-none rounded-2xl border border-line-soft bg-surface px-3.5 py-3 text-[15px] leading-[1.55] text-ink outline-none transition-colors focus:border-ink"
      />
      {value.length > COUNTER_FROM ? (
        <p className="m-0 mt-1 text-end text-[11px] text-quiet">
          {value.length}/{ANSWER_MAX}
        </p>
      ) : null}
    </div>
  );
}

function YesNo({
  question,
  note,
  value,
  onChange,
  error,
}: {
  question: string;
  note?: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  error?: string | null;
}) {
  const t = useT();
  return (
    <div className="rounded-2xl border border-line-soft bg-surface p-3.5">
      <p className="m-0 text-[14px] leading-[1.45] text-ink">{question}</p>
      {note ? <p className="m-0 mt-1.5 text-[11px] leading-[1.55] text-quiet">{note}</p> : null}
      {/* A two-up segmented pair rather than two loose pills: the answers are
          mutually exclusive and one control that holds both says so. */}
      <div className="mt-3 grid max-w-[220px] grid-cols-2 gap-1 rounded-full border border-line-soft p-1">
        {[true, false].map((option) => (
          <button
            key={String(option)}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={`cb-press cursor-pointer rounded-full py-2 text-[13px] leading-none transition-colors ${
              value === option ? "bg-ink text-on-ink" : "text-muted hover:text-ink"
            }`}
          >
            {t(option ? "careers.yes" : "careers.no")}
          </button>
        ))}
      </div>
      <Problem>{error}</Problem>
    </div>
  );
}

// A repeatable group — a school, a job, a reference. Capped, because the cap
// is what the server enforces too and a form that lets you add a sixth job it
// will then drop is a form that lies.
function Rows<T>({
  rows,
  max,
  addLabel,
  title,
  blank,
  onChange,
  render,
}: {
  rows: T[];
  max: number;
  addLabel: string;
  title: (n: number) => string;
  blank: () => T;
  onChange: (rows: T[]) => void;
  render: (row: T, update: (next: T) => void) => React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row, index) => (
        <div key={index} className="rounded-2xl border border-line-soft bg-surface p-3.5">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-quiet">
              {title(index + 1)}
            </span>
            {rows.length > 1 ? (
              <button
                type="button"
                aria-label={t("careers.remove")}
                onClick={() => onChange(rows.filter((_, at) => at !== index))}
                className="cb-press -me-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-quiet transition-colors hover:bg-raise hover:text-ink"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path
                    d="M1.5 1.5 10.5 10.5M10.5 1.5 1.5 10.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : null}
          </div>
          {render(row, (next) => onChange(rows.map((item, at) => (at === index ? next : item))))}
        </div>
      ))}
      {rows.length < max ? (
        <button
          type="button"
          onClick={() => onChange([...rows, blank()])}
          className="cb-press cursor-pointer self-start rounded-full border border-dashed border-line-mute px-4 py-2 text-[12px] text-muted transition-colors hover:border-ink hover:text-ink"
        >
          + {addLabel}
        </button>
      ) : null}
    </div>
  );
}
