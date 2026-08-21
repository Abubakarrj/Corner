import type { PositionId } from "./application";

// What the careers page lists.
//
// One row per job per shop, which is what makes a location label mean
// something: "Manager" is a kind of job, "Manager, Pasadena" is a job somebody
// could turn up to. The page used to list the four kinds and say nothing about
// where, and a label was the thing missing.
//
// That shape is what let five shops become twenty rows without touching
// anything but this array.
//
// ——— This is now a list somebody maintains ———
//
// Worth being plain about, because the earlier version could not go stale and
// this one can. A row here is a claim that the job exists. When one is filled
// it has to come off, or the page spends the next six months inviting people
// to apply for something that went months ago — and the person it wastes is
// the one who took the trouble.
//
// Nothing enforces that. It is a file somebody has to remember.
//
// ——— "New" expires by itself ———
//
// `since` is the day the job went up, not a flag saying it is new. A boolean
// would be true forever, because the day you clear it is a day nobody is
// thinking about this file — so every "New" badge on the internet is either
// fresh or a lie, and you cannot tell which by looking.
//
// A date can only ever be honest: the badge appears for NEW_FOR_DAYS and then
// stops on its own, and if somebody forgets this file entirely the worst that
// happens is a badge quietly going away.
//
// Leave `since` off and there is simply no badge.
//
// ——— The shop travels with the application ———
//
// A card links to /careers/apply?role=<role>&at=<location>, so the two rows
// "Counter, Koreatown" and "Counter, Hancock Park" stay distinguishable after
// they are sent. Without the second half they would arrive as the same
// application and the person reading it could not tell which shop it was for.
//
// This list is what makes `at` safe: apply/page.tsx checks the pair against
// OPENINGS and drops anything that isn't on it, so nothing arbitrary from a
// URL reaches the PDF or the email. The value is carried, never asked —
// somebody who pressed "Manager, Hancock Park" has already said where, and a
// form that then asks is a form that wasn't listening. It prints as "Applied
// from" on both the document and the covering mail.
//
// So adding a row for a new shop is the whole job. Nothing else needs touching.

export type Opening = {
  role: PositionId;
  /** The shop, as it should read on the card — "Koreatown", "Hancock Park".
      Deliberately a plain string rather than an id from locations.ts, because
      hiring for a shop that hasn't opened yet is the normal case, and a
      careers page that can't mention it until the map can is the wrong
      constraint. Match the name in locations.ts when the shop is on it. */
  location: string;
  /** The day it went up, YYYY-MM-DD. See above. */
  since?: string;
};

/** How long a job wears the "New" badge. */
export const NEW_FOR_DAYS = 30;

// ——— ⚠️ Grouped by role, not by shop ———
//
// Twenty rows need an order, and this one is a guess about who is reading. A
// person looking for work picks the job before the neighbourhood: they know
// they want a kitchen, and then they find out which of the five is nearest.
// Grouped this way, adjacent rows share the role and differ by location, so the
// eye reads down the column that varies. Grouped by shop it would read as a
// directory of branches, which is a thing the shop cares about and an applicant
// does not.
//
// The place filter above the list serves the other reading, so nobody who came
// for a neighbourhood has to scroll for it.
//
// ——— ⚠️ "Koreatown", not "Wilshire" ———
//
// These rows said Wilshire, which is what that counter used to be called before
// the shops were renamed for their neighbourhoods. The type's own note says to
// match the name in locations.ts, and this file quietly stopped doing so —
// nothing breaks when it drifts, which is exactly why it drifts: a careers page
// offering a job at "Wilshire" beside a finder listing "Koreatown" is two names
// for one shop and a reader wondering whether they are the same place.
//
// ⚠️ The Koreatown Outlet is not on this list, and its absence is a decision.
// The shop has paused that counter — see the note on WESTERN in locations.ts —
// so there is nothing to staff. If it reopens, hiring for it is four more rows
// here, not something to infer from an address coming back onto the map.
//
// `since` is on the sixteen jobs that opened with the new shops and off the
// four that were already advertised. That is a lot of "New" badges at once,
// which is what a shop opening four locations actually looks like; they expire
// by themselves after NEW_FOR_DAYS.
const OPENED = "2026-08-21";

export const OPENINGS: Opening[] = [
  { role: "counter", location: "Koreatown" },
  { role: "counter", location: "Larchmont", since: OPENED },
  { role: "counter", location: "Westwood", since: OPENED },
  { role: "counter", location: "Studio City", since: OPENED },
  { role: "counter", location: "Pasadena", since: OPENED },

  { role: "kitchen", location: "Koreatown" },
  { role: "kitchen", location: "Larchmont", since: OPENED },
  { role: "kitchen", location: "Westwood", since: OPENED },
  { role: "kitchen", location: "Studio City", since: OPENED },
  { role: "kitchen", location: "Pasadena", since: OPENED },

  { role: "shift-lead", location: "Koreatown" },
  { role: "shift-lead", location: "Larchmont", since: OPENED },
  { role: "shift-lead", location: "Westwood", since: OPENED },
  { role: "shift-lead", location: "Studio City", since: OPENED },
  { role: "shift-lead", location: "Pasadena", since: OPENED },

  { role: "manager", location: "Koreatown" },
  { role: "manager", location: "Larchmont", since: OPENED },
  { role: "manager", location: "Westwood", since: OPENED },
  { role: "manager", location: "Studio City", since: OPENED },
  { role: "manager", location: "Pasadena", since: OPENED },
];

/** Whether a job still counts as new, as of `now`.
 *
 *  Takes the clock rather than reading it, so the answer is decided once on
 *  the server and handed to the page. A client component working this out for
 *  itself would render the build's answer into the HTML and the browser's
 *  answer a moment later, and the two disagree exactly when the badge is about
 *  to expire. */
export function isNew(opening: Opening, now: Date): boolean {
  if (!opening.since) return false;
  const posted = Date.parse(`${opening.since}T00:00:00Z`);
  if (Number.isNaN(posted)) return false;
  const age = now.getTime() - posted;
  return age >= 0 && age < NEW_FOR_DAYS * 24 * 60 * 60 * 1000;
}
