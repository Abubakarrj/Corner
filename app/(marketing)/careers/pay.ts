import type { EmploymentTypeId, PositionId } from "./application";

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
// ——— Whether a wage is printed at all: California Labor Code 432.3 ———
//
// Two rules, and they are not the same rule:
//
//   Fifteen or more employees — the pay scale goes in the job posting. Not
//   optional, not on request. See POSTS_PAY_SCALE below.
//
//   Any size at all — the pay scale is given to an applicant who asks. That
//   one never switches off, which is why the page says so in words.
//
// "Pay scale" means the range the employer reasonably expects to pay. The
// minimum wage is not a range; it is a floor.
//
// The shop is under fifteen, so posting is a choice rather than a duty — and
// the shop has chosen to post. Shift lead and manager carry real numbers now,
// counter carries the local minimum plus tips, and the offer to give the scale
// to anybody who asks stays on the page underneath, because that rule applies
// at every size and is not satisfied by a number on a card.

/** Whether a wage is printed on the board.
 *
 *  True. It was false while the numbers were nothing but the local minimum,
 *  because a floor printed as an offer is the most discouraging thing a job
 *  board can say. Now that shift lead and manager carry real figures and the
 *  hourly roles carry tips, the numbers are worth reading and they are posted.
 *
 *  At the shop's size this is a choice: Labor Code 432.3(c) makes a posted pay
 *  scale mandatory at fifteen employees and leaves it optional below. Two
 *  things change on the day the fifteenth person is hired, and neither is this
 *  flag, which is already on:
 *
 *    - counter and kitchen resolve to a single figure, and the law asks for a
 *      scale. Write real ranges for them.
 *    - MINIMUM_WAGE has to be current every July, which it has to be anyway
 *      now that it is on the page.
 *
 *  Setting it to false again would take every number off the board in one
 *  edit, which is the reason it is still a flag and not a deletion.
 *
 *  Not an environment variable. A headcount is not configuration — it is a
 *  fact about the shop that somebody should have to think about, in a diff,
 *  with this comment in front of them. */
export const POSTS_PAY_SCALE = true;

/** The local hourly minimum, and the day it took effect.
 *
 *  $18.42 is the City of Los Angeles citywide rate from July 1, 2026, up 55c
 *  from $17.87. The City rate is the one that applies here: both counters are
 *  in Koreatown, on Wilshire Blvd and S Western Ave, inside city limits, so
 *  neither the state floor nor the unincorporated-county rate governs. No small-employer tier — Los
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
  /** Whether the rate above is joined by tips on the card.
   *
   *  Its own field rather than a number, because a tip average is a forecast
   *  and a forecast printed next to a wage is read as a promise. "Plus tips"
   *  is the true statement; "plus about $3 an hour" is one somebody can hold
   *  the shop to on a slow February Tuesday. The reference job description
   *  this was modelled on does quote a figure, and that is the one thing from
   *  it deliberately not copied. */
  tips?: boolean;
  shifts?: Shift[];
  /** The ids from EMPLOYMENT_TYPES, so the card reuses the strings the form
      already has and the form can only offer what is written here.
      Deliberately the whole vocabulary rather than just full and part: mark a
      summer job `["seasonal"]` and the board filter and the form both pick it
      up, with nothing else to edit. */
  hours?: EmploymentTypeId[];
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
// option. The shop has since said what these roles are: counter and kitchen can
// be worked either way, and shift-lead and manager are full time.
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
// Shift-lead and manager hold only `["full"]`, and that is a real exclusion
// rather than an omission: those are the two the shop is not offering part
// time, so they drop out of the board when somebody filters for part time.
// Manager especially is not provisional and not waiting on anything — the
// shop's answer is that manager is full time, always. Do not "tidy" either into
// `["full", "part"]` to make the four entries match; the whole point of the
// field is that they do not all match.
//
// This is also what the application form asks from. It used to offer all three
// kinds of hours to everybody, which is how somebody could press Apply on a job
// the shop offers part time and then be asked to choose between full time and
// seasonal. The form reads `hours` now, so a role open one way states it rather
// than asking, and nothing is offered that the shop is not offering.
//
// None of this is a claim about *exempt* status. Manager is the only salaried
// role, and whether it is exempt turns on the salary and on how the time is
// actually spent; see the note in that entry. Full time is the assumption the
// $70,304 floor there is stated under, which is one more reason manager is not
// on the part-time list.
export const TERMS: Partial<Record<PositionId, RoleTerms>> = {
  counter: {
    pay: { kind: "minimum" },
    tips: true,
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
    // $24, and not the minimum: running a shift is the job the shop pays over
    // the floor for. A single figure rather than a range because that is what
    // the shop said; see the note on POSTS_PAY_SCALE about ranges.
    pay: { kind: "range", low: 24, high: 24, per: "hour" },
    tips: true,
    // Full time, with manager. Opening or closing is the shift somebody has to
    // be there for end to end, so the job is the whole day by its nature and a
    // half of it is a different job.
    hours: ["full"],
  },
  manager: {
    hours: ["full"],
    // $75,000 to $85,000, salaried. A real range, which is what a pay scale
    // is, and the only entry here that is one.
    //
    // It clears the exempt floor, which is the thing that had to be checked
    // before printing it. California requires a salaried exempt employee to
    // earn twice the *state* minimum for full time; the state minimum is
    // $16.90 from January 1, 2026, so the threshold is $70,304 a year. Note
    // "state" — Los Angeles's higher local rate does not raise it. The bottom
    // of this range sits about $4,700 above that line.
    //
    // Two things to watch, neither of them the number:
    //
    // The floor moves every January with the state minimum. A range whose low
    // end is $75,000 has roughly four thousand dollars of headroom, which is
    // two or three years of increases, not ten. When the state minimum passes
    // $18.03 the low end stops being exempt.
    //
    // And salary is only half the test. Exempt executive status also needs
    // more than half the time spent actually managing. A manager who works the
    // line through the morning rush can fail that at any salary, which is the
    // usual way a small food business gets this wrong. If that is how the job
    // really runs, it is non-exempt and owed overtime whatever this says.
    pay: { kind: "range", low: 75000, high: 85000, per: "year" },
    // No tips. Salaried, and a manager sharing a tip pool is a question with a
    // real answer under Labor Code 351 rather than a detail: an owner or agent
    // may not take any part of a tip, and a manager is often an agent.
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

/** The same numbers as money, in whatever language is on.
 *
 *  Cents on an hourly rate *when there are any*. The rule used to force two
 *  decimals, on the reasoning that 17.28 and 17 are different wages — which is
 *  an argument against rounding, not an argument for "$24.00". A maximum of
 *  two digits keeps 18.42 whole and lets 24 read as $24, which is how the shop
 *  writes it and how anybody says it out loud.
 *
 *  None on a salary, where they would be noise. */
export function formatPay(pay: ResolvedPay, locale: string): string {
  const cents = pay.per === "hour";
  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
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
