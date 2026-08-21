import "server-only";

// The one thing a stranger writes that the wall cannot take back.
//
// ——— ⚠️ What this is, and what it is not ———
//
// This is not what makes Corner Notes safe to publish. That is the shape of a
// note: text is text and is escaped where it renders, the drawing is bounded
// integers this app turns into a path itself, so no field in a note can carry
// markup or a link. See app/drawing.ts. A word filter adds nothing to that and
// never could.
//
// What it does is spare the next visitor a slur. The wall has no moderation
// screen — taking a note down is somebody running an UPDATE — so between a note
// being written and being noticed there is a gap, and the whole neighbourhood
// reads the wall in that gap. This closes the obvious half of it.
//
// ——— ⚠️ A false positive costs more than a false negative ———
//
// This is the decision the rest of the file follows from. A rude note that gets
// through is up for an afternoon and then hidden. Somebody rejected at the form
// has no appeal: they wrote their name, the shop told them no, and they leave.
// If those two were symmetric the right list would be long. They are not, so the
// list below is short and every entry is a word that is an insult in every
// context it can appear in.
//
// That is why there is no `dick`, no `cock`, no `piss`, no `hell`. Dick is a
// name, Hancock is a name, and a wall that turns away a Dick to catch a person
// calling someone one has made the wrong trade. Anatomy and mild swearing are
// not what this is for.
//
// ——— ⚠️ `server-only`, and not for the usual reason ———
//
// There are no secrets here. The reason is that a list shipped to the browser
// is a published list of exactly what to avoid typing — the check would arrive
// in the bundle together with its own instructions for evasion. So the browser
// asks and the server answers, and the answer never names the word it caught
// (see the route): naming it turns one rejected note into a tuning oracle.
//
// It also means the terms are in plaintext here, which they have to be. Hashing
// them would look tidier and would break every part of the matching below,
// which is about the shapes a word can be spelled in and not about equality.

/** How much of a word has to be there.
 *
 *  ⚠️ Per term, not a global setting, because the collision profile is per
 *  term. `a+s+s+` anywhere reaches assess, assassin and assist on the first
 *  try; `f+u+c+k+` anywhere reaches nothing in English at all.
 *
 *  - `exact` wants the whole token. For short terms that live inside ordinary
 *    words, where anything looser is a machine for refusing innocent people.
 *  - `prefix` wants a word to start with it and allows any ending, so one entry
 *    covers fucking, fucker and fuckyou.
 *  - `anywhere` wants it at any position. This is what catches the compounds a
 *    prefix cannot see, because the word is on the wrong end of them:
 *    motherfucker, bullshit, sonofabitch. Only for terms with no innocent host
 *    word, and where there is one, ALLOW below takes the host out first. */
type Mode = "exact" | "prefix" | "anywhere";

/** ⚠️ A moderation list contains the words it moderates. Everything below is
 *  here to be refused, and nothing below is anybody's name, place or trade. */
const TERMS: ReadonlyArray<readonly [string, Mode]> = [
  // Strong profanity, aimed at a person.
  ["fuck", "anywhere"],
  ["shit", "anywhere"],
  ["bitch", "anywhere"],
  ["bastard", "prefix"],
  ["asshole", "anywhere"],
  ["arsehole", "anywhere"],
  ["cunt", "anywhere"],
  ["twat", "prefix"],
  ["wanker", "prefix"],
  ["whore", "prefix"],
  ["slut", "prefix"],
  ["skank", "prefix"],

  // Slurs. These are the reason the file exists; the profanity above is the
  // easy part. Racial, ethnic, homophobic, transphobic, ableist.
  ["nigger", "anywhere"],
  ["nigga", "anywhere"],
  ["faggot", "anywhere"],
  ["fag", "exact"],
  ["dyke", "exact"],
  ["tranny", "prefix"],
  ["shemale", "prefix"],
  ["kike", "exact"],
  ["spic", "exact"],
  ["wetback", "prefix"],
  ["beaner", "prefix"],
  ["chink", "exact"],
  ["gook", "exact"],
  ["jap", "exact"],
  ["raghead", "prefix"],
  ["towelhead", "prefix"],
  ["sandnigger", "prefix"],
  ["paki", "exact"],
  ["coon", "exact"],
  ["darkie", "exact"],
  ["midget", "prefix"],

  // ⚠️ `exact`, and the reason was found by running this file over the app's
  // own copy rather than by thinking about it. As a prefix it refuses the
  // Italian for nationality — nazionalità — which appears in this shop's equal
  // opportunity statement. A filter that cannot read the page it is defending
  // is not calibrated.
  //
  // ⚠️ Worth a second look before shipping: `nazi` on its own is also half of a
  // fond thing people say about delis, which is a joke somebody will eventually
  // try to leave here. Kept because of where it would land if it were not a
  // joke, and because the slur list next to it exists for the same reason.
  ["nazi", "exact"],

  // ⚠️ `retarded` and not `retard`, and the reason is French. This site is
  // offered in ten languages, and `retard` is French for a delay — "désolé pour
  // le retard" is an apology, and a wall that refuses it has insulted somebody
  // for being polite. `retarded` is not a word in French and carries almost all
  // of the English slur's usage.
  //
  // The same rule took out three others that looked obvious. `negro` is how you
  // say the colour black in Spanish, which this site is also offered in.
  // `cripple` is an ordinary English verb. `tard` is the French one again,
  // without even the prefix to hide behind.
  ["retarded", "prefix"],

  // Spanish. The shop is in Los Angeles and the site is offered in Spanish, so
  // an English-only list would be a guard rail on one side of the road.
  //
  // ⚠️ Deliberately not `puto` or `perra`: puto is an intensifier in half of
  // Mexico before it is an insult, and perra is a dog. Same rule as above —
  // when a word is only an insult in context, this is the wrong tool.
  ["puta", "exact"],
  ["putas", "exact"],
  ["pendejo", "prefix"],
  ["pendeja", "prefix"],
  ["cabron", "prefix"],
  ["mierda", "prefix"],
  ["chinga", "prefix"],
  ["maricon", "prefix"],
  ["joto", "exact"],
  ["culero", "prefix"],
  ["verga", "exact"],
];

/** Innocent words that contain a refused one, taken out of the text before any
 *  of it is matched.
 *
 *  ⚠️ This is the list that keeps the one above usable, and it is not optional
 *  decoration. `shiitake` really does contain `shiit` — s, h, ii, t — which is
 *  a match for `s+h+i+t+`, and a bagel shop that refuses a note about mushrooms
 *  has failed at the only thing it was asked to do. Removing the host first is
 *  what lets `shit` be matched anywhere, which is what catches bullshit.
 *
 *  Written against the flattened text, so lowercase letters and single spaces
 *  and nothing else.
 *
 *  ⚠️ Removing a phrase cannot let the bare word through: taking out `chink of`
 *  leaves a note that says `chink` still saying it. The phrase is the innocent
 *  reading; the word on its own is not one of these. */
const ALLOW: readonly RegExp[] = [
  // The mushroom, spelled both ways people spell it.
  /shi+ta+ke/g,
  // The town, which is the oldest false positive in this whole subject.
  /scunthorpe/g,
  // A narrow opening. Always followed by `of` or `in` when it means that.
  /chink (of|in)\b/g,
  // Clean. Spelled both ways.
  /spick? and span/g,
];

/** Digits and punctuation people substitute for letters. Nothing exotic — this
 *  is the keyboard-adjacent set, which is what somebody actually reaches for.
 *
 *  ⚠️ `1` becomes `i` and not `l`. It is used for both and it has to pick one;
 *  `i` is what b1tch and n1gga need, and no term below has an `l` in it. */
const LEET: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "g",
  "7": "t",
  "8": "b",
  "@": "a",
  "$": "s",
  "!": "i",
  "|": "i",
  "+": "t",
};

/** The text as letters and single spaces, and nothing else.
 *
 *  NFKD is doing more work here than it looks: it is what folds the accents
 *  somebody used to dodge this (ｆｕｃｋ, 𝓯𝓾𝓬𝓴, fúck) back onto plain letters, so
 *  the matcher below never has to know those spellings exist.
 *
 *  ⚠️ It does not fold Cyrillic homoglyphs — а, е, о and с are separate letters
 *  that happen to be drawn the same, and NFKD is right not to touch them. That
 *  spelling gets through, and is the known hole in this. */
function flatten(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[01345678@$!|+]/g, (character) => LEET[character] ?? character)
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/** The same text with deliberately spaced-out letters put back together.
 *
 *  ⚠️ Only runs of single letters are joined, which is what makes this safe.
 *  Squashing the whole string — the obvious way to catch f.u.c.k — also welds
 *  every ordinary word to its neighbour, and "a shot of espresso" contains a
 *  word this file would refuse. A run of lone letters is not something people
 *  type by accident, so joining exactly those and nothing else catches the
 *  evasion without inventing words that were never written.
 *
 *  Three is the shortest run worth joining. Nothing in TERMS is under three
 *  letters, and pairs of lone letters do occur in ordinary writing. */
function joinLetters(flat: string): string {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 3) out.push(run.join(""));
    else out.push(...run);
    run = [];
  };
  for (const token of flat.split(" ")) {
    if (token.length === 1) {
      run.push(token);
      continue;
    }
    flush();
    out.push(token);
  }
  flush();
  return out.join(" ").trim();
}

/** The shapes one term can be spelled in.
 *
 *  ⚠️ Every letter is `x+` rather than `x`, which is what makes fuuuuck and
 *  shhhit the same word as their originals. It is also why `ass` cannot be
 *  matched by the English word `as`: `a+s+s+` needs two runs of s, and `as` has
 *  one. Doubling is free to add and impossible to add by accident. */
function shapeOf(word: string, mode: Mode): RegExp {
  const body = [...word].map((letter) => `${letter}+`).join("");
  // The haystack is letters separated by single spaces, so a space or an end is
  // the whole of what a word boundary means here.
  if (mode === "anywhere") return new RegExp(body);
  return new RegExp(mode === "exact" ? `(?:^| )${body}(?: |$)` : `(?:^| )${body}`);
}

const SHAPES: ReadonlyArray<readonly [string, RegExp]> = TERMS.map(
  ([word, mode]) => [word, shapeOf(word, mode)] as const,
);

/** The first term this text is refused for, or null if it is fine.
 *
 *  ⚠️ Returns the word for the sake of a test being able to say which rule
 *  fired. It must not travel back to whoever typed the text — see the route.
 *  A rejection that names its reason lets somebody bisect the list. */
export function offensiveTerm(text: string): string | null {
  let flat = flatten(text);
  if (flat.length === 0) return null;
  // ⚠️ The hosts come out first, before anything is matched. Doing it after
  // would be checking the text for a word and then asking whether to have
  // minded, which is a different and much harder question.
  for (const innocent of ALLOW) flat = flat.replace(innocent, " ");
  flat = flat.replace(/ +/g, " ").trim();
  if (flat.length === 0) return null;
  const spread = joinLetters(flat);
  for (const [word, shape] of SHAPES) {
    if (shape.test(flat)) return word;
    if (spread !== flat && shape.test(spread)) return word;
  }
  return null;
}

/** Whether this text can go on the wall. */
export function isOffensive(text: string): boolean {
  return offensiveTerm(text) !== null;
}
