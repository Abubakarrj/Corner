// The states, for the State box on the job application.
//
// ——— Why a list and not a text field ———
//
// It was a free text box, and a free text box collects "CA", "Ca", "Calif.",
// "California" and "cali" for one answer. Nothing downstream reads it, so
// nothing broke; it simply made the applications inconsistent to read, and put
// the work of knowing the abbreviation on the applicant.
//
// ——— Why a list and not a native <select> ———
//
// Fifty-one options in a platform picker is a wheel somebody spins past
// Michigan four times. Typing "ca" and pressing the one that appears is faster
// on every device, and it is what the address fields on this site already do.
//
// ——— Why the code is what gets stored ———
//
// `state` on the application is two letters, and was before this existed. The
// list shows the name, which is what somebody is looking for, and stores the
// code, which is what a mailing label wants. Searching matches either, so
// "california" and "ca" both land on the same row.
//
// All fifty, plus DC. Territories are deliberately absent: somebody applying
// to a bagel shop in Koreatown from Guam is not the case to design for, and
// they can still be hired — nothing validates against this list, it only
// offers. See the note in ApplicationForm's StateBox on why typing something
// off-list is allowed to stand.

export type State = { code: string; name: string };

export const STATES: State[] = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

/** The states matching what has been typed, best first.
 *
 *  A code match outranks a name match, so "ma" offers Massachusetts ahead of
 *  Maine and Maryland: the two letters somebody typed on purpose should not
 *  lose to an alphabetical accident. Then a name that starts with the query,
 *  then one whose *later word* starts with it — which is what puts "carolina"
 *  on North and South Carolina, and "vir" on Virginia before West Virginia.
 *
 *  Matching stops there rather than falling back to a plain substring, which
 *  is what a first pass did and what made "ma" offer Alabama and Oklahoma.
 *  Nobody types the middle of a word to find a state, and two wrong rows are
 *  worse than none: they push the right answer down the list and invite a tap
 *  on a state somebody has never been to. */
export function matchStates(query: string, limit = 6): State[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rank = (state: State): number => {
    const name = state.name.toLowerCase();
    if (state.code.toLowerCase() === q) return 0;
    if (name === q) return 1;
    if (name.startsWith(q)) return 2;
    if (name.split(" ").some((word) => word.startsWith(q))) return 3;
    return -1;
  };
  return STATES.map((state) => ({ state, score: rank(state) }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((row) => row.state);
}

/** The two-letter code for whatever somebody typed, or null.
 *
 *  Used when a city suggestion arrives carrying "CA, USA" as its second line,
 *  and when the box is left holding a full state name that was typed rather
 *  than picked. */
export function codeFor(text: string): string | null {
  const value = text.trim().toLowerCase();
  if (!value) return null;
  const hit = STATES.find(
    (state) => state.code.toLowerCase() === value || state.name.toLowerCase() === value,
  );
  return hit ? hit.code : null;
}
