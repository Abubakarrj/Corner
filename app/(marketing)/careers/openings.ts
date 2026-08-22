import type { PositionId } from "./application";

// What the careers page lists.
//
// One row per job per shop, which is what makes a location label mean
// something: "Manager" is a kind of job, "Manager, Pasadena" is a job somebody
// could turn up to. The page used to list the four kinds and say nothing about
// where, and a label was the thing missing.
//
// That shape is what lets eleven shops be forty-four rows without touching
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
// ——— ⚠️ `since` is recorded and not currently shown ———
//
// It is the day the job went up, not a flag saying it is new. A boolean would
// be true forever, because the day you clear it is a day nobody is thinking
// about this file — so every "New" badge on the internet is either fresh or a
// lie, and you cannot tell which by looking. A date can only ever be honest.
//
// ⚠️ The badge it fed is gone. The board now carries the shop's name in its own
// colour where the badge used to sit, because with one row per job per shop the
// thing a reader is scanning for is *where*, not *when* — see placeColour.ts.
//
// The dates stay accurate anyway, and isNew() stays in this file, so restoring
// the badge is a line in each of two files rather than a data-entry job. A row
// added without `since` would be silently "not new" if that ever happened,
// which is the one way this field goes wrong.
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
// ⚠️ Two dates because these went up in two batches: sixteen jobs when four
// shops opened, and twenty-four more when the board was brought in line with a
// shop list that had run six ahead of it. The four originals carry no date at
// all, which is what "advertised for as long as anybody can remember" looks
// like.
const OPENED = "2026-08-21";
const POSTED = "2026-08-22";

export const OPENINGS: Opening[] = [
  { role: "counter", location: "Koreatown" },
  { role: "counter", location: "Larchmont", since: OPENED },
  { role: "counter", location: "Westwood", since: OPENED },
  { role: "counter", location: "Studio City", since: OPENED },
  { role: "counter", location: "Pasadena", since: OPENED },
  { role: "counter", location: "Fullerton", since: POSTED },
  { role: "counter", location: "Long Beach", since: POSTED },
  { role: "counter", location: "Torrance", since: POSTED },
  { role: "counter", location: "San Clemente", since: POSTED },
  { role: "counter", location: "Garden Grove", since: POSTED },
  { role: "counter", location: "La Puente", since: POSTED },

  { role: "kitchen", location: "Koreatown" },
  { role: "kitchen", location: "Larchmont", since: OPENED },
  { role: "kitchen", location: "Westwood", since: OPENED },
  { role: "kitchen", location: "Studio City", since: OPENED },
  { role: "kitchen", location: "Pasadena", since: OPENED },
  { role: "kitchen", location: "Fullerton", since: POSTED },
  { role: "kitchen", location: "Long Beach", since: POSTED },
  { role: "kitchen", location: "Torrance", since: POSTED },
  { role: "kitchen", location: "San Clemente", since: POSTED },
  { role: "kitchen", location: "Garden Grove", since: POSTED },
  { role: "kitchen", location: "La Puente", since: POSTED },

  { role: "shift-lead", location: "Koreatown" },
  { role: "shift-lead", location: "Larchmont", since: OPENED },
  { role: "shift-lead", location: "Westwood", since: OPENED },
  { role: "shift-lead", location: "Studio City", since: OPENED },
  { role: "shift-lead", location: "Pasadena", since: OPENED },
  { role: "shift-lead", location: "Fullerton", since: POSTED },
  { role: "shift-lead", location: "Long Beach", since: POSTED },
  { role: "shift-lead", location: "Torrance", since: POSTED },
  { role: "shift-lead", location: "San Clemente", since: POSTED },
  { role: "shift-lead", location: "Garden Grove", since: POSTED },
  { role: "shift-lead", location: "La Puente", since: POSTED },

  { role: "manager", location: "Koreatown" },
  { role: "manager", location: "Larchmont", since: OPENED },
  { role: "manager", location: "Westwood", since: OPENED },
  { role: "manager", location: "Studio City", since: OPENED },
  { role: "manager", location: "Pasadena", since: OPENED },
  { role: "manager", location: "Fullerton", since: POSTED },
  { role: "manager", location: "Long Beach", since: POSTED },
  { role: "manager", location: "Torrance", since: POSTED },
  { role: "manager", location: "San Clemente", since: POSTED },
  { role: "manager", location: "Garden Grove", since: POSTED },
  { role: "manager", location: "La Puente", since: POSTED },
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
