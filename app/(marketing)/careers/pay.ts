import type { PositionId } from "./application";

// What each job pays, and when it can stop saying so.
//
// ——— Why a wage is a date, not a number ———
//
// Three of these jobs pay the local minimum, which is not a constant. The City
// of Los Angeles raises its rate every July 1, so a number typed in here is
// true until a morning nobody is thinking about this file and false every
// morning after — and the person misled is the applicant, who reads a wage,
// decides it is worth the bus fare, and turns up.
//
// A page that is silently wrong about pay is worse than a page that says
// nothing about pay. So the rate carries the day it took effect, and stops
// being printed once it is old enough to be stale. Same reasoning as the "New"
// badge in openings.ts: a claim that can expire itself is the only kind that
// can be trusted without someone checking it.
//
// The failure mode is deliberately the harmless one. Out of date, the card
// simply omits the pay line — it does not guess, round, or show the old
// number with an apology.
//
// ——— What still has to be done by hand ———
//
// Set MINIMUM_WAGE every July, and the manager range whenever it moves. There
// is no feed to read this from; it is a two-minute edit once a year, and the
// alternative is a number that rots.
//
// ——— One legal note, worth reading before setting these ———
//
// California Labor Code section 432.3 wants a *pay scale* — the range the
// employer reasonably expects to pay — in a job posting, for employers of
// fifteen or more. "Minimum wage" is not a range. If the shop is over that
// line, a single figure is thin, and the honest fix is to post a real range
// rather than the floor. Separately, and whatever the headcount, the scale has
// to be given to an applicant who asks.

/** The local hourly minimum, and the day it took effect.
 *
 *  `hourly: null` means nobody has set it. That is the shipping state, and it
 *  is deliberate: an invented figure on a careers page is worse than a missing
 *  one, so this stays empty until somebody who knows the real rate fills it
 *  in, and no pay line appears for the hourly jobs until they do. */
export const MINIMUM_WAGE: { hourly: number | null; from: string; city: string } = {
  hourly: null,
  from: "2026-07-01",
  city: "Los Angeles",
};

/** How long a posted rate is believed after the day it took effect.
 *
 *  Thirteen months: the City raises on July 1, so a rate set last July is
 *  still right in June and certainly wrong by the following August. The extra
 *  month is slack for setting it a few days late, not licence to skip a year. */
export const WAGE_TRUSTED_FOR_DAYS = 396;

export type Pay =
  /** The local minimum, resolved from MINIMUM_WAGE so there is one number to
      maintain rather than one per job. */
  | { kind: "minimum" }
  /** A real range. `per` decides how it reads: an hourly job says "an hour",
      a salaried one says "a year". */
  | { kind: "range"; low: number; high: number; per: "hour" | "year" };

/** A shift somebody would actually be rostered on, as 24-hour local times.
 *
 *  Stored as times rather than as text so the ten languages format themselves
 *  through Intl — "6am" is "午前6時" in Japanese and "۶ صبح" in Persian, and
 *  none of that is worth forty hand-written strings that drift. */
export type Shift = { start: string; end: string };

export type RoleTerms = {
  pay?: Pay;
  shifts?: Shift[];
  /** Matches the ids in EMPLOYMENT_TYPES, so the card reuses the strings the
      form already has for "Full time" and "Part time". */
  hours?: ("full" | "part")[];
};

// ——— NOT YET SET ———
//
// counter, kitchen and shift-lead pay the local minimum, so they are waiting
// on MINIMUM_WAGE.hourly above. manager is salaried and waiting on a range.
// shift-lead has no shifts here because none were given; a job with nothing
// set simply shows no extra lines, which is the truth rather than a gap.
export const TERMS: Partial<Record<PositionId, RoleTerms>> = {
  counter: {
    pay: { kind: "minimum" },
    shifts: [
      { start: "06:00", end: "12:00" },
      { start: "10:00", end: "16:00" },
    ],
  },
  kitchen: {
    pay: { kind: "minimum" },
    shifts: [
      { start: "06:00", end: "14:00" },
      { start: "08:00", end: "16:00" },
    ],
    hours: ["full"],
  },
  "shift-lead": {
    pay: { kind: "minimum" },
  },
  manager: {
    // Salaried, against comparable shops nearby. No range set yet.
  },
};

/** The hourly minimum, or null when it is unset or too old to stand behind. */
export function minimumWage(now: Date): number | null {
  if (MINIMUM_WAGE.hourly === null || MINIMUM_WAGE.hourly <= 0) return null;
  const from = Date.parse(`${MINIMUM_WAGE.from}T00:00:00Z`);
  if (Number.isNaN(from)) return null;
  const age = now.getTime() - from;
  // A rate dated in the future is a rate somebody is staging, not one to
  // print today.
  if (age < 0) return null;
  return age < WAGE_TRUSTED_FOR_DAYS * 24 * 60 * 60 * 1000 ? MINIMUM_WAGE.hourly : null;
}

/** The numbers behind the pay line, or null when there is nothing we can
 *  stand behind. No formatting here, and no locale: this runs on the server,
 *  because it reads the clock and the clock has to be read in one place. A
 *  client working it out for itself renders the build's answer into the HTML
 *  and the browser's answer a moment later, and the two disagree exactly on
 *  the day a rate goes stale. Same split as isNew(). */
export function resolvePay(
  role: PositionId,
  now: Date,
): { low: number; high: number; per: "hour" | "year" } | null {
  const pay = TERMS[role]?.pay;
  if (!pay) return null;
  if (pay.kind === "minimum") {
    const rate = minimumWage(now);
    return rate === null ? null : { low: rate, high: rate, per: "hour" };
  }
  if (pay.low <= 0 || pay.high < pay.low) return null;
  return { low: pay.low, high: pay.high, per: pay.per };
}

export type ResolvedPay = NonNullable<ReturnType<typeof resolvePay>>;

/** The same numbers as money, in whatever language is on. Cents on an hourly
 *  rate because 17.28 and 17 are different wages; none on a salary, where they
 *  would be noise. */
export function formatPay(pay: ResolvedPay, locale: string): string {
  const cents = pay.per === "hour";
  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0,
    }).format(value);
  return pay.low === pay.high ? money(pay.low) : `${money(pay.low)}–${money(pay.high)}`;
}

/** "6am–12pm", in whatever language is on. */
export function shiftLine(shift: Shift, locale: string): string | null {
  const at = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    // A fixed date, because only the time is being formatted and the date
    // would otherwise drag the current day's timezone into the answer.
    const when = new Date(Date.UTC(2000, 0, 1, h, m));
    return new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: m === 0 ? undefined : "2-digit",
      timeZone: "UTC",
    }).format(when);
  };
  const from = at(shift.start);
  const to = at(shift.end);
  return from && to ? `${from}–${to}` : null;
}
