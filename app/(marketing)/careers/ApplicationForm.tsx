"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, ButtonLink } from "../../ui/Button";
import { PALETTE, SHOP_FONT } from "../../shop/shopControls";
import { useServerText, useT, type StringKey } from "../../i18n";
import {
  ANSWER_MAX,
  DAYS,
  EMPLOYMENT_TYPES,
  MAX_HISTORY,
  MAX_REFERENCES,
  POSITIONS,
  applicationErrors,
  emptyApplication,
  type Application,
  type DayId,
  type EmploymentTypeId,
  type PositionId,
} from "./application";

const { cream } = PALETTE;

// The job application.
//
// Same shape as the gift form on purpose — one column, sections with headings,
// a single committing button at the foot — because this is the other place on
// the site where somebody types a lot into a screen and needs to know where
// they are in it.
//
// The questions themselves, and the ones that were deliberately cut, live in
// application.ts. This file only draws them.
//
// Two things it does differently from every other form here:
//
//   Almost nothing is required. Education, work history, references and the
//   three written answers are all optional, so most of this page can be
//   skipped by somebody applying for their first job. The `*` only appears on
//   the handful of blocks we genuinely need.
//
//   The submit button is never disabled for validation, for the same reason
//   as the gift form: a dead button tells you nothing. Pressing it either
//   sends or says what's missing.
export default function ApplicationForm() {
  const t = useT();
  const st = useServerText();

  const [application, setApplication] = useState<Application>(() => ({
    ...emptyApplication(),
    // One empty row of each, rather than an "add" button over nothing. A blank
    // row shows what the section wants; an empty section with a button shows
    // only that there's work to do.
    education: [{ school: "", focus: "", finished: "" }],
    employment: [{ employer: "", role: "", from: "", to: "" }],
    references: [{ name: "", relationship: "", contact: "" }],
  }));
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Bot defences, matching /api/drop-list: a field no human can see, and a
  // floor on how fast the form can be filled in. Both are checked server-side.
  const [honeypot, setHoneypot] = useState("");
  // Stamped on mount rather than during render — Date.now() is impure, and a
  // re-render would otherwise reset the clock this measures against.
  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = Date.now();
  }, []);

  const problems = useMemo(
    () => (tried ? new Set<StringKey>(applicationErrors(application)) : new Set<StringKey>()),
    [tried, application],
  );
  const missing = applicationErrors(application);

  function set<K extends keyof Application>(key: K, value: Application[K]) {
    setApplication((current) => ({ ...current, [key]: value }));
  }

  function toggle<T extends string>(key: "positions" | "days" | "employmentTypes", id: T) {
    setApplication((current) => {
      const list = current[key] as string[];
      const next = list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
      return { ...current, [key]: next };
    });
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setTried(true);
    if (sending) return;
    if (applicationErrors(application).length > 0) return;

    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...application,
          // Rows nobody filled in shouldn't reach the PDF as empty lines.
          education: application.education.filter((row) =>
            row.school.trim() || row.focus.trim() || row.finished.trim(),
          ),
          employment: application.employment.filter((row) =>
            row.employer.trim() || row.role.trim() || row.from.trim() || row.to.trim(),
          ),
          references: application.references.filter((row) =>
            row.name.trim() || row.relationship.trim() || row.contact.trim(),
          ),
          company: honeypot,
          elapsed_ms: Date.now() - openedAt.current,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "careers.errSendFailed");
      }
      setSent(true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "careers.errSendFailed");
    } finally {
      setSending(false);
    }
  }

  if (sent) return <Sent email={application.email.trim()} />;

  return (
    <div style={{ backgroundColor: cream, fontFamily: SHOP_FONT }}>
      <form onSubmit={send} noValidate className="mx-auto max-w-lg px-5 pb-16 pt-8">
        <h1 className="m-0 text-center text-[24px] font-medium leading-tight tracking-[-0.01em] text-ink">
          {t("careers.title")}
        </h1>
        <p className="m-0 mx-auto mt-2 max-w-xs text-center text-[14px] leading-[1.5] text-muted">
          {t("careers.lede")}
        </p>
        <p className="m-0 mt-1 text-center text-[12px] text-quiet">{t("careers.timeNote")}</p>

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

        <Block title={t("careers.secYou")} required>
          <div className="grid grid-cols-2 gap-2">
            <Field
              label={t("careers.firstName")}
              value={application.firstName}
              onChange={(value) => set("firstName", value)}
              error={problems.has("careers.errFirstName") ? t("careers.errFirstName") : null}
              autoComplete="given-name"
            />
            <Field
              label={t("careers.lastName")}
              value={application.lastName}
              onChange={(value) => set("lastName", value)}
              error={problems.has("careers.errLastName") ? t("careers.errLastName") : null}
              autoComplete="family-name"
            />
          </div>
          <div className="mt-2 flex flex-col gap-2">
            <Field
              label={t("careers.email")}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={application.email}
              onChange={(value) => set("email", value)}
              error={problems.has("careers.errEmail") ? t("careers.errEmail") : null}
            />
            <Field
              label={t("careers.phone")}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={application.phone}
              onChange={(value) => set("phone", value)}
              error={problems.has("careers.errPhone") ? t("careers.errPhone") : null}
            />
          </div>
          {/* City and state, never a street address. Knowing the commute is
              plausible is the whole reason to ask; the rest would be personal
              data held for nothing. */}
          <div className="mt-2 grid grid-cols-[2fr_1fr] gap-2">
            <Field
              label={t("careers.city")}
              value={application.city}
              onChange={(value) => set("city", value)}
              error={problems.has("careers.errCity") ? t("careers.errCity") : null}
              autoComplete="address-level2"
            />
            <Field
              label={t("careers.state")}
              value={application.state}
              onChange={(value) => set("state", value)}
              autoComplete="address-level1"
            />
          </div>
        </Block>

        <Block title={t("careers.secRole")} required note={t("careers.positionsNote")}>
          <ChipGroup
            options={POSITIONS}
            chosen={application.positions}
            onToggle={(id: PositionId) => toggle("positions", id)}
          />
          {problems.has("careers.errPositions") ? (
            <Problem>{t("careers.errPositions")}</Problem>
          ) : null}
        </Block>

        <Block title={t("careers.secWhen")} required note={t("careers.daysNote")}>
          <ChipGroup
            options={DAYS}
            chosen={application.days}
            onToggle={(id: DayId) => toggle("days", id)}
          />
          {problems.has("careers.errDays") ? <Problem>{t("careers.errDays")}</Problem> : null}

          <p className="m-0 mb-2 mt-4 text-[12px] text-muted">{t("careers.typesNote")}</p>
          <ChipGroup
            options={EMPLOYMENT_TYPES}
            chosen={application.employmentTypes}
            onToggle={(id: EmploymentTypeId) => toggle("employmentTypes", id)}
          />
          {problems.has("careers.errTypes") ? <Problem>{t("careers.errTypes")}</Problem> : null}

          <div className="mt-4">
            <label className="mb-1 block text-[12px] text-muted" htmlFor="earliest-start">
              {t("careers.earliestStart")}
            </label>
            <input
              id="earliest-start"
              type="date"
              value={application.earliestStart}
              onChange={(event) => set("earliestStart", event.target.value)}
              className="w-full rounded-xl border border-line-soft bg-surface px-4 py-3 text-[16px] text-ink outline-none focus:border-ink"
            />
          </div>
        </Block>

        <Block title={t("careers.secChecks")} required>
          <YesNo
            question={t("careers.authorized")}
            value={application.authorizedToWork}
            onChange={(value) => set("authorizedToWork", value)}
            error={problems.has("careers.errAuthorized") ? t("careers.errAuthorized") : null}
          />
          {/* Asked as a yes or no, never as a date of birth, and the reason is
              printed under it rather than left for the applicant to wonder
              about. See application.ts. */}
          <YesNo
            question={t("careers.isAdult")}
            note={t("careers.isAdultNote")}
            value={application.isAdult}
            onChange={(value) => set("isAdult", value)}
            error={problems.has("careers.errAge") ? t("careers.errAge") : null}
          />
          <YesNo
            question={t("careers.servSafe")}
            note={t("careers.servSafeNote")}
            value={application.servSafe}
            onChange={(value) => set("servSafe", value)}
          />
        </Block>

        <Block title={t("careers.secSchool")} optional>
          <Rows
            rows={application.education}
            max={MAX_HISTORY}
            addLabel={t("careers.addSchool")}
            onChange={(rows) => set("education", rows)}
            blank={() => ({ school: "", focus: "", finished: "" })}
            render={(row, update) => (
              <>
                <Field
                  label={t("careers.school")}
                  value={row.school}
                  onChange={(value) => update({ ...row, school: value })}
                />
                <div className="mt-2 grid grid-cols-[2fr_1fr] gap-2">
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
              </>
            )}
          />
        </Block>

        <Block title={t("careers.secWork")} optional note={t("careers.workNote")}>
          <Rows
            rows={application.employment}
            max={MAX_HISTORY}
            addLabel={t("careers.addJob")}
            onChange={(rows) => set("employment", rows)}
            blank={() => ({ employer: "", role: "", from: "", to: "" })}
            render={(row, update) => (
              <>
                <Field
                  label={t("careers.employer")}
                  value={row.employer}
                  onChange={(value) => update({ ...row, employer: value })}
                />
                <div className="mt-2">
                  <Field
                    label={t("careers.role")}
                    value={row.role}
                    onChange={(value) => update({ ...row, role: value })}
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
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
              </>
            )}
          />
        </Block>

        <Block title={t("careers.secRefs")} optional note={t("careers.refsNote")}>
          <Rows
            rows={application.references}
            max={MAX_REFERENCES}
            addLabel={t("careers.addReference")}
            onChange={(rows) => set("references", rows)}
            blank={() => ({ name: "", relationship: "", contact: "" })}
            render={(row, update) => (
              <>
                <Field
                  label={t("careers.refName")}
                  value={row.name}
                  onChange={(value) => update({ ...row, name: value })}
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
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
              </>
            )}
          />
        </Block>

        <Block title={t("careers.secWords")} optional>
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
          <div className="mt-3">
            <Field
              label={t("careers.heardFrom")}
              value={application.heardFrom}
              onChange={(value) => set("heardFrom", value)}
            />
          </div>
        </Block>

        <Block title={t("careers.secSend")} required>
          <p className="m-0 mb-2 text-[12px] leading-[1.55] text-muted">
            {t("careers.signatureNote")}
          </p>
          <Field
            label={t("careers.signature")}
            value={application.signature}
            onChange={(value) => set("signature", value)}
            error={problems.has("careers.errSignature") ? t("careers.errSignature") : null}
          />
        </Block>

        {error ? (
          <p role="alert" className="m-0 mt-5 text-center text-[13px] text-brand-red">
            {st(error)}
          </p>
        ) : null}

        <Button type="submit" block className="mt-6" disabled={sending}>
          {sending ? t("careers.sending") : t("careers.submit")}
        </Button>
        {tried && missing.length > 0 ? (
          <p role="alert" className="m-0 mt-2 text-center text-[12px] text-brand-red">
            {t(missing[0])}
          </p>
        ) : null}

        <p className="m-0 mt-8 text-[11px] leading-[1.7] text-quiet">{t("careers.eeo")}</p>
        <p className="m-0 mt-2 text-[11px] leading-[1.7] text-quiet">
          {t("careers.privacyNote")}{" "}
          <Link href="/privacy-policy" className="underline hover:text-ink">
            {t("common.privacyPolicy")}
          </Link>
        </p>
      </form>
    </div>
  );
}

function Sent({ email }: { email: string }) {
  const t = useT();
  return (
    <div
      className="cb-rise mx-auto max-w-lg px-5 py-16 text-center"
      style={{ fontFamily: SHOP_FONT }}
    >
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
      <p className="m-0 mt-4 text-[22px] font-medium leading-tight text-ink">
        {t("careers.sentTitle")}
      </p>
      <p className="m-0 mx-auto mt-2 max-w-xs text-[14px] leading-[1.55] text-muted">
        {t("careers.sentBody", { contact: email })}
      </p>
      <ButtonLink href="/" variant="secondary" className="mt-7 w-full max-w-[280px]">
        {t("common.backToMenu")}
      </ButtonLink>
    </div>
  );
}

// ——— Pieces ———

function Block({
  title,
  required,
  optional,
  note,
  children,
}: {
  title: string;
  required?: boolean;
  optional?: boolean;
  note?: string;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <section className="mt-8">
      <h2 className="m-0 mb-1 text-[14px] font-medium text-ink">
        {required ? <span className="text-brand-red">* </span> : null}
        {title}
        {optional ? (
          <span className="ms-2 text-[11px] font-normal uppercase tracking-[0.08em] text-quiet">
            {t("careers.optional")}
          </span>
        ) : null}
      </h2>
      {note ? <p className="m-0 mb-2 text-[12px] leading-[1.5] text-muted">{note}</p> : null}
      <div className={note ? "" : "mt-2"}>{children}</div>
    </section>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="m-0 mt-1.5 text-[12px] text-brand-red">
      {children}
    </p>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  autoComplete,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: "text" | "email" | "tel" | "numeric";
  autoComplete?: string;
  error?: string | null;
}) {
  return (
    <div>
      <input
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-xl border bg-surface px-4 py-3 text-[16px] text-ink outline-none transition-colors placeholder:text-quieter focus:border-ink ${
          error ? "border-brand-red" : "border-line-soft"
        }`}
      />
      {error ? <Problem>{error}</Problem> : null}
    </div>
  );
}

function Answer({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-3 first:mt-0">
      <label className="mb-1.5 block text-[13px] leading-[1.45] text-ink">{label}</label>
      <textarea
        rows={3}
        maxLength={ANSWER_MAX}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-none rounded-xl border border-line-soft bg-surface px-4 py-3 text-[16px] text-ink outline-none transition-colors focus:border-ink"
      />
      <p className="m-0 mt-1 text-end text-[11px] text-quiet">
        {value.length}/{ANSWER_MAX}
      </p>
    </div>
  );
}

// Multi-select as pressable chips rather than checkboxes. Seven days and four
// jobs as a checkbox column is a tall, slow read; as chips it's one glance.
// aria-pressed carries the state, so it announces the same either way.
function ChipGroup<T extends string>({
  options,
  chosen,
  onToggle,
}: {
  options: readonly { id: T; label: StringKey }[];
  chosen: readonly T[];
  onToggle: (id: T) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(({ id, label }) => {
        const active = chosen.includes(id);
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(id)}
            className={`cb-press cursor-pointer rounded-full border px-3.5 py-2 text-[13px] transition-colors ${
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
    <div className="mt-4 first:mt-0">
      <p className="m-0 text-[13px] leading-[1.45] text-ink">{question}</p>
      {note ? <p className="m-0 mt-1 text-[11px] leading-[1.55] text-quiet">{note}</p> : null}
      <div className="mt-2 flex gap-2">
        {[true, false].map((option) => (
          <button
            key={String(option)}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={`cb-press min-w-[84px] cursor-pointer rounded-full border px-4 py-2 text-[13px] transition-colors ${
              value === option
                ? "border-ink bg-ink text-on-ink"
                : "border-line-soft bg-surface text-ink hover:border-line-mute"
            }`}
          >
            {t(option ? "careers.yes" : "careers.no")}
          </button>
        ))}
      </div>
      {error ? <Problem>{error}</Problem> : null}
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
  blank,
  onChange,
  render,
}: {
  rows: T[];
  max: number;
  addLabel: string;
  blank: () => T;
  onChange: (rows: T[]) => void;
  render: (row: T, update: (next: T) => void) => React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, index) => (
        <div key={index} className="rounded-xl border border-line-soft/70 p-3">
          {render(row, (next) => onChange(rows.map((item, at) => (at === index ? next : item))))}
          {rows.length > 1 ? (
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, at) => at !== index))}
              className="cb-press mt-2 cursor-pointer text-[12px] text-muted underline hover:text-ink"
            >
              {t("careers.remove")}
            </button>
          ) : null}
        </div>
      ))}
      {rows.length < max ? (
        <button
          type="button"
          onClick={() => onChange([...rows, blank()])}
          className="cb-press cursor-pointer self-start rounded-full border border-line-soft bg-surface px-4 py-2 text-[13px] text-ink transition-colors hover:border-ink"
        >
          + {addLabel}
        </button>
      ) : null}
    </div>
  );
}
