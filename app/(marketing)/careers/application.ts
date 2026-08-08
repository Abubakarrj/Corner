import type { StringKey } from "../../i18n/en";

// What we ask somebody applying for a job, and what makes an application
// valid.
//
// Kept apart from the form so both sides can use it: the page validates with
// these before enabling submit, and /api/apply validates with the same ones
// before accepting anything. A rule written twice is a rule that disagrees
// with itself eventually — same reasoning as giftOrder.ts.
//
// ——— What was deliberately left out, and why ———
//
// This was modelled on a real hourly application form and then cut. The cuts
// are written down here rather than silently made, because the pressure to
// re-add them is real — every one of these looks harmless, and a manager who
// wants to know it will ask why it isn't on the form.
//
//   Reliable transportation
//     "Do you have reliable transportation to get to and from work?" is a
//     well-known EEOC risk: it acts as a proxy for whether somebody owns a
//     car, which tracks income, and can catch people whose disability affects
//     how they travel. It is also not a job function. If somebody turns up on
//     time, how they got here is not the shop's business.
//
//   Driver's licence
//     Legitimate to ask when driving is part of the job. Nobody drives for
//     this one. Asking anyway screens out people for a reason unconnected to
//     making a bagel.
//
//   T-shirt size
//     A physical characteristic, collected before an offer. Innocent in
//     intent and the wrong side of the offer: it belongs on the onboarding
//     form, along with the uniform it is for.
//
//   Mobile carrier
//     Same. It exists to configure a scheduling app somebody hasn't been
//     hired into yet.
//
//   "Do you have an active cellphone?"
//     Redundant — the form already asks for a mobile number — and a proxy for
//     income when it isn't.
//
//   Home phone, middle name, street address
//     Not needed to decide whether to interview somebody. A city is enough to
//     know the commute is plausible; a street address is a data-protection
//     liability we would be holding for no reason.
//
// ——— What stayed, and why it is defensible ———
//
// Everything below is either how we contact you, when you can work, or what
// you have done. The one that looks closest to the line is the 18-or-over
// question, and it stays because California restricts the hours a minor may
// work and a schedule cannot be built without knowing. It asks for a yes or a
// no rather than a date of birth, which is the narrowest form of the question
// that still answers it.

export const POSITIONS = [
  { id: "counter", label: "careers.posCounter" },
  { id: "baker", label: "careers.posBaker" },
  { id: "kitchen", label: "careers.posKitchen" },
  { id: "shift-lead", label: "careers.posShiftLead" },
] as const satisfies readonly { id: string; label: StringKey }[];

export type PositionId = (typeof POSITIONS)[number]["id"];

// All seven. The form this was modelled on listed Monday to Friday and then
// noted underneath that weekend availability was required, which is a form
// asking a question it has already answered wrong.
export const DAYS = [
  { id: "mon", label: "careers.dayMon" },
  { id: "tue", label: "careers.dayTue" },
  { id: "wed", label: "careers.dayWed" },
  { id: "thu", label: "careers.dayThu" },
  { id: "fri", label: "careers.dayFri" },
  { id: "sat", label: "careers.daySat" },
  { id: "sun", label: "careers.daySun" },
] as const satisfies readonly { id: string; label: StringKey }[];

export type DayId = (typeof DAYS)[number]["id"];

export const EMPLOYMENT_TYPES = [
  { id: "full", label: "careers.typeFull" },
  { id: "part", label: "careers.typePart" },
  { id: "seasonal", label: "careers.typeSeasonal" },
] as const satisfies readonly { id: string; label: StringKey }[];

export type EmploymentTypeId = (typeof EMPLOYMENT_TYPES)[number]["id"];

export const NOTES_MAX = 1500;
export const ANSWER_MAX = 800;
export const MAX_HISTORY = 4;
export const MAX_REFERENCES = 3;

export type SchoolEntry = { school: string; focus: string; finished: string };
export type JobEntry = { employer: string; role: string; from: string; to: string };
export type ReferenceEntry = { name: string; relationship: string; contact: string };

export type Application = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  state: string;

  positions: PositionId[];
  days: DayId[];
  employmentTypes: EmploymentTypeId[];
  earliestStart: string;

  authorizedToWork: boolean | null;
  // Yes or no, never a date of birth. See the note at the top.
  isAdult: boolean | null;
  servSafe: boolean | null;

  education: SchoolEntry[];
  employment: JobEntry[];
  references: ReferenceEntry[];

  goals: string;
  hardestDecision: string;
  toSucceed: string;
  heardFrom: string;

  // Typed full name. Not a signature in any legal sense and the copy above it
  // says so — it acknowledges that the answers are true and that we may
  // contact the employers and references listed.
  //
  // Deliberately NOT a background-check authorisation. Under the FCRA a
  // disclosure for a consumer report has to be a standalone document, not a
  // paragraph inside an application, so bundling one here would be worse than
  // useless — it would be an authorisation that doesn't hold.
  signature: string;
};

export function emptyApplication(): Application {
  return {
    firstName: "", lastName: "", email: "", phone: "", city: "", state: "",
    positions: [], days: [], employmentTypes: [], earliestStart: "",
    authorizedToWork: null, isAdult: null, servSafe: null,
    education: [], employment: [], references: [],
    goals: "", hardestDecision: "", toSucceed: "", heardFrom: "",
    signature: "",
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Ten digits somewhere in it, however it's punctuated. Same bar as the gift
    form: rejecting a real number over its brackets is worse than accepting
    one that fails later. */
function hasTenDigits(value: string): boolean {
  return (value.match(/\d/g) ?? []).length >= 10;
}

// What's missing, as string keys, in the order the form asks for them. Empty
// means it can be submitted.
//
// Only the things we genuinely need to decide whether to talk to somebody are
// required. The long-form answers, the histories and the references are all
// optional on purpose: a counter job should not need three professional
// references to apply for, and requiring them filters out exactly the people
// a neighbourhood shop wants to meet.
export function applicationErrors(application: Application): StringKey[] {
  const missing: StringKey[] = [];
  const need = (ok: boolean, key: StringKey) => {
    if (!ok) missing.push(key);
  };

  need(application.firstName.trim().length > 0, "careers.errFirstName");
  need(application.lastName.trim().length > 0, "careers.errLastName");
  need(EMAIL.test(application.email.trim()), "careers.errEmail");
  need(hasTenDigits(application.phone), "careers.errPhone");
  need(application.city.trim().length > 0, "careers.errCity");
  need(application.positions.length > 0, "careers.errPositions");
  need(application.days.length > 0, "careers.errDays");
  need(application.employmentTypes.length > 0, "careers.errTypes");
  need(application.authorizedToWork !== null, "careers.errAuthorized");
  need(application.isAdult !== null, "careers.errAge");
  need(application.signature.trim().length > 1, "careers.errSignature");

  return missing;
}

export function isComplete(application: Application): boolean {
  return applicationErrors(application).length === 0;
}

/** Everything trimmed and capped, so neither the PDF nor the email is at the
    mercy of what somebody pasted in. Runs on the server before anything is
    rendered or sent. */
export function normalizeApplication(raw: unknown): Application {
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const str = (value: unknown, max = 200) =>
    typeof value === "string" ? value.trim().slice(0, max) : "";
  const bool = (value: unknown) => (typeof value === "boolean" ? value : null);
  const ids = <T extends string>(value: unknown, allowed: readonly T[]): T[] =>
    Array.isArray(value)
      ? allowed.filter((id) => value.includes(id))
      : [];
  const rows = <T>(value: unknown, max: number, map: (row: Record<string, unknown>) => T): T[] =>
    Array.isArray(value)
      ? value
          .slice(0, max)
          .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
          .map(map)
      : [];

  return {
    firstName: str(body.firstName, 80),
    lastName: str(body.lastName, 80),
    email: str(body.email, 160),
    phone: str(body.phone, 40),
    city: str(body.city, 80),
    state: str(body.state, 40),

    positions: ids(body.positions, POSITIONS.map((p) => p.id)),
    days: ids(body.days, DAYS.map((d) => d.id)),
    employmentTypes: ids(body.employmentTypes, EMPLOYMENT_TYPES.map((t) => t.id)),
    earliestStart: str(body.earliestStart, 40),

    authorizedToWork: bool(body.authorizedToWork),
    isAdult: bool(body.isAdult),
    servSafe: bool(body.servSafe),

    education: rows(body.education, MAX_HISTORY, (row) => ({
      school: str(row.school, 120),
      focus: str(row.focus, 120),
      finished: str(row.finished, 40),
    })),
    employment: rows(body.employment, MAX_HISTORY, (row) => ({
      employer: str(row.employer, 120),
      role: str(row.role, 120),
      from: str(row.from, 40),
      to: str(row.to, 40),
    })),
    references: rows(body.references, MAX_REFERENCES, (row) => ({
      name: str(row.name, 120),
      relationship: str(row.relationship, 120),
      contact: str(row.contact, 160),
    })),

    goals: str(body.goals, ANSWER_MAX),
    hardestDecision: str(body.hardestDecision, ANSWER_MAX),
    toSucceed: str(body.toSucceed, ANSWER_MAX),
    heardFrom: str(body.heardFrom, 200),

    signature: str(body.signature, 120),
  };
}
