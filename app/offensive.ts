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
// ——— ⚠️ Which way to be wrong, and who decided ———
//
// A filter is wrong in two directions and cannot minimise both. Let a slur
// through, and it is on a public wall until somebody notices. Refuse an
// innocent note, and a person was told no by a bagel shop and left, and nothing
// anywhere records that it happened.
//
// The shop's answer is to lean toward refusing. That is a call about the shop's
// own wall and not a technical finding, so it is written down rather than
// inferred: on a borderline word, this refuses. `nazi` is in even though it
// takes a fond thing people say about delis with it. `chink` is in with no
// exemption for the narrow-opening idiom, which means a note about a chink of
// light is refused, and that is the intended behaviour and not an oversight.
//
// ——— ⚠️ The one thing leaning strict does not license ———
//
// Refusing words that are ordinary in a language this site is offered in. That
// is not strictness, it is a broken filter, and it is invisible to whoever
// wrote the list because they do not read the language it breaks.
//
// So `retard` is absent (French for a delay), `negro` is absent (Spanish for
// the colour black), `puto` is absent (an intensifier across most of Mexico
// before it is anything else), and `cracker` is absent for a reason particular
// to this shop. Every one of those is a slur or a swear in English. None of
// them can be on a list this site applies to ten languages.
//
// The same rule keeps `dick` and `cock` off it. Those are names — Dick,
// Hancock, Dickens — and a name is not an offense, so refusing one buys
// nothing. The insults built from them are on the list instead.
//
// ⚠️ ALLOW below is what makes leaning strict survivable: it takes the innocent
// host out first, so `nazi` can be a prefix without refusing the Italian for
// nationality. Adding a term without checking what it collides with is how this
// file starts refusing the shop's own menu, and the suite runs it over all ten
// languages of shipped copy for exactly that reason.
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
  ["prick", "exact"],
  ["arse", "exact"],
  ["piss", "prefix"],
  ["tosser", "prefix"],
  ["bollocks", "prefix"],
  ["scumbag", "prefix"],
  ["douchebag", "prefix"],
  ["douche", "exact"],
  ["dumbass", "anywhere"],
  ["jackass", "anywhere"],
  ["cocksucker", "anywhere"],

  // ⚠️ The compounds, and not the words they are built from. `dickhead` is
  // only ever an insult; `dick` is a person's name. Same for cock. This is the
  // line described at the top: strict about offense, not about names.
  ["dickhead", "anywhere"],
  ["dickwad", "anywhere"],
  ["dickface", "anywhere"],

  // Slurs. These are the reason the file exists; the profanity above is the
  // easy part. Racial, ethnic, homophobic, transphobic, ableist.
  ["nigger", "anywhere"],
  ["nigga", "anywhere"],
  ["negrata", "prefix"],
  ["faggot", "anywhere"],
  // ⚠️ Spelled out rather than made a prefix, for the same reason as `spaz`
  // below. As a prefix this refuses fagioli — Italian for beans, as in pasta e
  // fagioli — along with fagiolini and fagocito, and Italian is one of the ten
  // languages this site is offered in.
  //
  // The corpus sweep did not catch that one: the app's own copy never says
  // beans. It was found by asking why a mutation of this exact line changed
  // nothing, which is the answer to what a mutation run is for.
  ["fag", "exact"],
  ["fags", "exact"],
  ["faggy", "prefix"],
  ["dyke", "exact"],
  ["tranny", "prefix"],
  ["shemale", "prefix"],
  ["ladyboy", "prefix"],
  ["kike", "exact"],
  ["heeb", "exact"],
  ["hymie", "exact"],
  ["yid", "exact"],
  ["spic", "exact"],
  ["wetback", "prefix"],
  ["beaner", "prefix"],
  ["marica", "prefix"],

  // ⚠️ `prefix` and no exemption for the narrow opening. A note about a chink
  // of light is refused. That is the shop's call, described at the top.
  ["chink", "prefix"],

  ["gook", "exact"],
  ["jap", "exact"],
  ["chinaman", "prefix"],
  ["zipperhead", "prefix"],
  ["coolie", "exact"],
  ["raghead", "prefix"],
  ["towelhead", "prefix"],
  ["camel jockey", "prefix"],
  ["sandnigger", "prefix"],
  ["paki", "exact"],
  ["coon", "exact"],
  ["jigaboo", "prefix"],
  ["porch monkey", "prefix"],
  ["golliwog", "prefix"],
  ["darkie", "exact"],
  ["honky", "prefix"],
  ["whitey", "exact"],
  // ⚠️ ALLOW keeps pollack and pollock off this. The repeat tolerance makes
  // polack and pollack the same word, and this shop sells smoked fish.
  ["polack", "prefix"],
  ["wop", "exact"],
  ["dago", "prefix"],
  // ⚠️ ALLOW keeps redskin potatoes and redskin peanuts off this, which is a
  // collision a food shop has and most sites do not.
  ["redskin", "prefix"],
  ["injun", "prefix"],
  ["squaw", "prefix"],
  // ⚠️ `spaz` is `exact` and its forms are spelled out, rather than one prefix
  // plus an ALLOW list for Italian. As a prefix it refuses spazio, spazzola,
  // spazzatura and spazzino — space, brush, rubbish, street sweeper — and the
  // corpus sweep caught it on this app's own draw-pad label, which says "uno
  // spazio per disegnare col dito".
  //
  // The tempting fix is ALLOW entries for those four. That fix is a list of
  // Italian vocabulary maintained by somebody who does not speak Italian, and
  // the fifth word nobody thought of fails silently on a real person's note.
  // Naming the slur's own forms has no such tail: spazzino stays safe because
  // nothing here matches it, not because somebody remembered it.
  ["spaz", "exact"],
  ["spazzed", "prefix"],
  ["spazzing", "prefix"],
  ["spazzy", "prefix"],
  ["spastic", "prefix"],
  ["mongoloid", "prefix"],
  ["cretin", "exact"],
  ["midget", "prefix"],

  // ⚠️ `prefix`, so nazis and naziism are caught as well. It was `exact` for
  // one reason — as a prefix it refuses the Italian for nationality, which
  // appears in this shop's own equal opportunity statement — and weakening the
  // match was the wrong fix for that. The right one is ALLOW taking nazione,
  // nazionale and nazionalità out first, which costs nothing and leaves this
  // term at full strength.
  //
  // Found by running this file over the app's own copy rather than by thinking
  // about it. A filter that cannot read the page it is defending is not
  // calibrated.
  ["nazi", "prefix"],

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
  // Clean. Spelled both ways.
  /spick? and span/g,
  // ⚠️ Italian for nation and everything built on it — nazione, nazionale,
  // nazionalità. Without this, `nazi` cannot be a prefix. Found by the corpus
  // sweep in tests/offensive.test.ts, in this shop's own careers page.
  /nazion[a-z]*/g,
  // Surnames that begin with a slur. Fagin is out of Oliver Twist.
  /fagan|fagin|fagot/g,
  // ⚠️ The fish, and the film director. `polack` and `pollack` are the same
  // word to the repeat tolerance, and this shop sells smoked fish.
  /pollacks?|pollocks?/g,
  // ⚠️ A potato and a peanut, both of which a food shop's wall will mention.
  /redskins? (potato|peanut)[a-z]*/g,
];

// ⚠️ There is deliberately no entry here for the narrow-opening sense of
// `chink`. It was removed: this wall refuses that note. See the top of the file
// for whose call that is.

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
