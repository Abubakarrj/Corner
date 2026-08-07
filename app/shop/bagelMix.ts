import type { OptionChoice, OptionGroup } from "./products";

// Mix and match: a pack of bagels that isn't all one flavour.
//
// ——— Why this isn't a new field on the cart line ———
//
// A cart line is `{ slug, quantity, options }`, and `options` is one chosen id
// per group. Six of one flavour already fits that: count=6, bagel=everything.
// Three and three does not.
//
// The tempting fix is a second field on the line — `mix?: Record<id, number>`
// — and it is the expensive one. That field has to survive localStorage and
// its migration, cross the wire to /api/shop-order, be part of lineKey (or two
// different mixes silently merge into one line), be understood by Riley's
// tools, and be handled by every screen that reads a line. Six places that all
// have to agree, to express something that is still just "what's in this pack".
//
// So a group can hold a multiset instead of a single id, and the group says so
// (see `mix` in OptionGroup). The value stays a string, which means lineKey,
// the storage format, the order payload and the chat tools all keep working
// without knowing this feature exists. What has to know are the four functions
// that turn a value into meaning: pricing, allergens, the description, and the
// repair pass. That is the whole blast radius.
//
// ——— The format ———
//
//   "everything"                a whole pack of one flavour
//   "plain*3+everything*3"      a mix, counts summing to the pack size
//
// One flavour encodes as the bare id, which is not a special case for
// tidiness: it is the value the app already writes and already has in people's
// baskets. A cart saved before any of this existed decodes correctly, and a
// pack ordered from a catalog tile (which has no room for a mix control and
// still writes a bare id) is not a different kind of thing from one ordered
// here.
//
// Canonical, so identity holds. Entries are written in the group's own choice
// order and zero counts are dropped, which means three plain and three
// everything produce one string no matter which order they were tapped in —
// and lineKey, which is a string compare, puts them on the same basket line
// instead of two that look identical.

export type MixEntry = { choiceId: string; count: number };

const PAIR = "+";
const TIMES = "*";

/** Is this group's value a multiset rather than one id? */
export function isMixGroup(group: OptionGroup): boolean {
  return group.mix === true;
}

// What the value means, given how many are in the pack.
//
// `total` is the pack size, and it is a parameter rather than something read
// out of the value because the bare-id form doesn't carry one — "everything"
// means the whole pack, whatever the pack is. Callers that have no count (a
// sandwich, where the bagel group isn't a mix) pass 1 and get one entry, which
// is the truth there too.
//
// Unknown ids are dropped rather than kept as a placeholder. A flavour that
// left the menu is not a bagel anybody can be given, and carrying it forward
// so a basket line can name it is worse than the pack coming up short and
// being asked about.
export function parseMix(
  group: OptionGroup,
  value: string | undefined,
  total: number,
): MixEntry[] {
  if (!value) return [];
  const known = new Set(group.choices.map((choice) => choice.id));

  if (!value.includes(TIMES)) {
    return known.has(value) ? [{ choiceId: value, count: Math.max(1, total) }] : [];
  }

  const counted = new Map<string, number>();
  for (const part of value.split(PAIR)) {
    const at = part.indexOf(TIMES);
    if (at < 0) continue;
    const choiceId = part.slice(0, at);
    const count = Number.parseInt(part.slice(at + 1), 10);
    if (!known.has(choiceId) || !Number.isFinite(count) || count <= 0) continue;
    counted.set(choiceId, (counted.get(choiceId) ?? 0) + count);
  }

  // The group's order, not the string's. See the note on canonical form.
  return group.choices
    .filter((choice) => (counted.get(choice.id) ?? 0) > 0)
    .map((choice) => ({ choiceId: choice.id, count: counted.get(choice.id)! }));
}

// The canonical string for a set of entries, or "" when nothing is chosen.
//
// `total` is the pack size and it is not optional, because the bare-id form is
// only true when one flavour fills the pack. Writing it without checking is a
// bug I shipped into this file and caught in the tests: a box of three plain
// and three of something the menu had since dropped parsed down to one entry
// of three plain, collapsed to "plain", and "plain" in a pack of six means
// *six plain*. Three bagels invented out of a retired flavour, silently, in
// the repair pass — the one place that is supposed to be conservative.
//
// So a lone flavour that doesn't fill the pack stays counted: "plain*3", which
// doesn't add up, which is what optionsComplete is for. Incomplete is a state
// the app can show; a box quietly filled with something nobody chose is not.
export function formatMix(
  group: OptionGroup,
  entries: MixEntry[],
  total: number,
): string {
  const kept = group.choices
    .map((choice) => ({
      choiceId: choice.id,
      count: entries.find((entry) => entry.choiceId === choice.id)?.count ?? 0,
    }))
    .filter((entry) => entry.count > 0);

  if (kept.length === 0) return "";
  // One flavour, the whole pack: written the way it has always been written.
  if (kept.length === 1 && kept[0].count >= total) return kept[0].choiceId;
  return kept.map((entry) => `${entry.choiceId}${TIMES}${entry.count}`).join(PAIR);
}

export function mixTotal(entries: MixEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.count, 0);
}

/** The choices a mix names, for anything that has to union across them. */
export function mixChoices(group: OptionGroup, entries: MixEntry[]): OptionChoice[] {
  return entries
    .map((entry) => group.choices.find((choice) => choice.id === entry.choiceId))
    .filter((choice): choice is OptionChoice => choice !== undefined);
}

// How a mix reads on a basket line: ["3 Everything", "3 Plain"].
//
// `label` is passed in because there are two describers — the English one in
// products.ts that the server and the order payload use, and the translated
// one in i18n/menu.ts that every screen uses — and they have to say the same
// thing in different languages. One implementation, two label functions.
//
// A count and a name with a space between them, and no "x": every language
// this ships in writes a quantity before a noun that way, and "3 x Everything"
// is a spreadsheet's phrasing rather than a person's. A pack that is all one
// flavour describes as just the flavour, since the count group is already on
// the line saying how many.
export function describeMix(
  group: OptionGroup,
  entries: MixEntry[],
  total: number,
  label: (choice: OptionChoice) => string,
): string[] {
  if (entries.length === 0) return [];
  // Bare label only when that flavour is the whole pack — the same rule, and
  // for the same reason, as formatMix. A repaired box of "3 Plain" in a six
  // reading as "Plain" on a basket line is the line claiming six.
  if (entries.length === 1 && entries[0].count >= total) {
    const only = group.choices.find((choice) => choice.id === entries[0].choiceId);
    return only ? [label(only)] : [];
  }
  return entries
    .map((entry) => {
      const choice = group.choices.find((option) => option.id === entry.choiceId);
      return choice ? `${entry.count} ${label(choice)}` : null;
    })
    .filter((part): part is string => part !== null);
}

// Adjusting a mix to a pack size that changed under it.
//
// Somebody picks three plain and three everything, then changes the pack from
// six to twelve. Doing nothing leaves a mix that names six bagels in a pack of
// twelve, and the add button would sit disabled with no explanation.
//
// So the shortfall goes on the first flavour already chosen, and an overshoot
// comes off the last ones until it fits. Neither invents a flavour nobody
// picked: growing adds more of something they already asked for, and shrinking
// only takes away. The picker shows the result, so anything they'd rather have
// is one tap from here.
export function fitMix(entries: MixEntry[], total: number): MixEntry[] {
  const have = mixTotal(entries);
  if (entries.length === 0 || have === total) return entries;

  if (have < total) {
    const grown = entries.map((entry) => ({ ...entry }));
    grown[0].count += total - have;
    return grown;
  }

  let over = have - total;
  const shrunk: MixEntry[] = [];
  for (let index = entries.length - 1; index >= 0; index--) {
    const take = Math.min(over, entries[index].count);
    over -= take;
    const count = entries[index].count - take;
    if (count > 0) shrunk.unshift({ ...entries[index], count });
  }
  return shrunk;
}
