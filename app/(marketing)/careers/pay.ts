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
 *  $18.42 is the City of Los Angeles citywide rate from July 1, 2026, up 55c
 *  from $17.87. The City rate is the one that applies here: the shop is on W
 *  8th St in Koreatown, inside city limits, so neither the state floor nor the
 *  unincorporated-county rate governs. There is no small-employer tier — Los
 *  Angeles merged those schedules in 2021, so every employer is on this number.
 *  The $25 rate in the same ordinance is for hotel and airport work and has
 *  nothing to do with a bagel shop.
 *
 *  The rate is indexed to CPI-W for the LA metro and moves every July 1, which
 *  is what the expiry below is guarding: set this in July, or the card stops
 *  claiming a wage rather than claiming a stale one.
 *
 *  `hourly: null` remains meaningful — it is what to write if this ever falls
 *  out of date and nobody has the new figure to hand. An empty pay line is
 *  recoverable; a wrong one, read by somebody working out whether the shift
 *  covers their bus fare, is not. */
export const MINIMUM_WAGE: { hourly: number | null; from: string; city: string } = {
  hourly: 18.42,
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
// ——— Hours are the shop's statement, not an inference ———
//
// Only kitchen carried `hours` at first, so the board listed one job with a
// week attached and three without, and the Type filter could offer exactly one
// option. The shop has since said what these roles are: counter, kitchen and
// shift-lead can be worked either way, and manager is full time.
//
// Two entries mean *either*, not both at once. The card says so in one phrase —
// "Full time or part time" — rather than printing the two as separate facts,
// which on a line already reading "$18.42 an hour · … · 6 AM–12 PM" would look
// like a contradiction instead of a choice. The filter reads it as either too,
// so a role open both ways is found under whichever the applicant picks. That
// is the point of the field: somebody who can only work mornings and somebody
// who wants forty hours are both looking at these three jobs, and neither
// should have to guess whether they are welcome.
//
// Manager holds only `["full"]`, and that is a real exclusion rather than an
// omission: it is the one role the shop is not offering part time, so it drops
// out of the board when somebody filters for part time. Not provisional, and
// not waiting on anything — the shop's answer is that manager is full time,
// always. Do not "tidy" this into `["full", "part"]` to make the four entries
// match; the whole point of the field is that this one does not.
//
// None of this is a claim about *exempt* status. Manager is the only salaried
// role, and whether it is exempt turns on the salary and on how the time is
// actually spent; see the note in that entry. Full time is the assumption the
// $70,304 floor there is stated under, which is one more reason manager is not
// on the part-time list.
export const TERMS: Partial<Record<PositionId, RoleTerms>> = {
  counter: {
    pay: { kind: "minimum" },
    shifts: [
      { start: "06:00", end: "12:00" },
      { start: "10:00", end: "16:00" },
    ],
    hours: ["full", "part"],
  },
  kitchen: {
    pay: { kind: "minimum" },
    shifts: [
      { start: "06:00", end: "14:00" },
      { start: "08:00", end: "16:00" },
    ],
    hours: ["full", "part"],
  },
  "shift-lead": {
    pay: { kind: "minimum" },
    hours: ["full", "part"],
  },
  manager: {
    hours: ["full"],
    // Salaried, and deliberately still unset — this is the one number here
    // that is a decision rather than a fact.
    //
    // The floor is not what comparable shops pay, it is the law. California
    // requires a salaried exempt employee to earn twice the *state* minimum
    // for full time, and the state minimum is $16.90 from January 1, 2026, so
    // the threshold is $70,304 a year. Note "state": Los Angeles's higher
    // local rate does not raise it.
    //
    // Which matters, because LA cafe-manager comps run about $57k at the 25th
    // percentile — below the exempt floor. A salary in that band is not a
    // cheaper manager, it is a non-exempt one owed overtime.
    //
    // And salary is only half the test. Exempt executive status also needs
    // more than half the time spent actually managing. A manager who works
    // the line through the morning rush can fail that at any salary, which is
    // the usual way a small food business gets this wrong.
    //
    // So: at or above $70,304 if the job is salaried and exempt. Below that,
    // pay hourly with overtime and say so on the card — the type already
    // supports { kind: "range", per: "hour" }.
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
