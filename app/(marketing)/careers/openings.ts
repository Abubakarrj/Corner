import type { PositionId } from "./application";

// What the careers page lists.
//
// One row per job per shop, which is what makes a location label mean
// something: "Manager" is a kind of job, "Manager, Hancock Park" is a job
// somebody could turn up to. The page used to list the four kinds and say
// nothing about where, and a label was the thing missing.
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
// ——— Read this before adding a second shop ———
//
// Every card links to /careers/apply?role=<role> and nothing else, so two rows
// with the same role at different shops lead to the same form and arrive as
// the same application. With one shop that is fine — there is nowhere else it
// could be for. The moment there are two, "Counter, Koreatown" and "Counter,
// Hancock Park" become indistinguishable once sent, and the person reading
// them cannot tell who applied to which.
//
// Fixing it is small and deliberately not done yet: carry the shop in the link
// as well, take it in apply/page.tsx, check it against this list so nothing
// arbitrary reaches the document, and print it on the PDF and in the email. It
// is a value carried from the link, not a new question — nobody should have to
// answer something they already answered by pressing a card.

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

export const OPENINGS: Opening[] = [
  { role: "counter", location: "Koreatown" },
  { role: "kitchen", location: "Koreatown" },
  { role: "shift-lead", location: "Koreatown" },
  { role: "manager", location: "Koreatown" },
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
