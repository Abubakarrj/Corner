// One row per place in an address search.
//
// ——— The problem ———
//
// Since businesses joined the delivery layer, Places answers a name with two
// predictions for the same doorway: the place, and the address it is at.
//
//   LAAC                    431 W 7th St, Los Angeles, CA
//   431 W 7th St            Los Angeles, CA, USA
//
// Both are correct, both resolve to the same building, and offering both asks
// somebody to pick between two spellings of the answer they already gave. It
// also reads as doubt — as though the app is not sure the place is really
// there and would like them to confirm it a second way. Neither row is wrong,
// so neither one being highlighted helps; the list is simply one row too long.
//
// ——— The rule ———
//
// A bare address is dropped when a *named* place in the same list sits at that
// address. The name is kept, because it carries everything the address does
// plus the word the customer typed.
//
// Deliberately one-directional. Two named places at one address — two suites
// in a tower, a café inside a hotel — are two different destinations with two
// different doors, and both stay. This only ever removes a row that has no
// name of its own, and only when another row names the same address, so the
// worst case is the list nobody complained about.
//
// ——— Why matching on text ———
//
// A place id would be exact and is no use here: an establishment and the
// address it stands at are two different places to Google, with two different
// ids, which is the whole reason both come back. The address text is the only
// thing they have in common.
//
// So the comparison is loosened until the two shapes meet — case, punctuation,
// the country Google appends to one and not the other, "Street" against "St".
// A comparison that is too tight leaves the duplicate row in, which is what
// happens today; there is no version of being too tight that loses a place.

export type PlaceSuggestion = { id: string; primary: string; secondary: string };

/** Whether a suggestion leads with a name rather than a house number.
 *
 *  Google does not label the two shapes in a prediction, and this is the
 *  difference that shows: an address prediction starts with the number, a
 *  named one starts with the name. Same test the reverse-geocode ranking in
 *  googleMaps.ts uses on a formatted address, for the same reason. */
function isNamed(suggestion: PlaceSuggestion): boolean {
  return !/^\d/.test(suggestion.primary.trim());
}

// The words that differ only because one system abbreviates and the other does
// not. Not a general address parser — that is a much larger and much worse
// idea — just the handful that appear in a Los Angeles street name.
const SHORTENED: Record<string, string> = {
  street: "st",
  avenue: "ave",
  boulevard: "blvd",
  road: "rd",
  drive: "dr",
  place: "pl",
  court: "ct",
  lane: "ln",
  terrace: "ter",
  parkway: "pkwy",
  highway: "hwy",
  north: "n",
  south: "s",
  east: "e",
  west: "w",
  suite: "ste",
  apartment: "apt",
  floor: "fl",
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    // Google appends the country to an address prediction and leaves it off a
    // business's secondary line, which is the single most common reason two
    // rows about one doorway fail to match.
    .filter((word) => word !== "usa" && word !== "us")
    .map((word) => SHORTENED[word] ?? word)
    .join(" ");
}

/** Where a suggestion is, as text, however the row is shaped.
 *
 *  A named row keeps its address on the second line. An address row is split
 *  across both, so both are needed to say the same thing. */
function addressOf(suggestion: PlaceSuggestion): string {
  return normalize(
    isNamed(suggestion)
      ? suggestion.secondary
      : `${suggestion.primary} ${suggestion.secondary}`,
  );
}

/** One row per place, in the order Places returned them.
 *
 *  Order is preserved rather than re-ranked: Places has already decided what
 *  best matches what somebody typed, and a list that reorders itself under a
 *  moving finger is worse than a list with an extra row in it. */
export function dedupePlaces(suggestions: PlaceSuggestion[]): PlaceSuggestion[] {
  const named = new Set(
    suggestions.filter(isNamed).map(addressOf).filter((address) => address.length > 0),
  );
  if (named.size === 0) return suggestions;

  const seenIds = new Set<string>();
  return suggestions.filter((suggestion) => {
    // The same id twice is a straightforward duplicate, whatever its shape.
    if (suggestion.id && seenIds.has(suggestion.id)) return false;
    if (suggestion.id) seenIds.add(suggestion.id);
    if (isNamed(suggestion)) return true;
    return !named.has(addressOf(suggestion));
  });
}
