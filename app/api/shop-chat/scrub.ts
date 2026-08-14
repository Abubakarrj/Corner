// No em dashes, ever.
//
// The instruction is in Riley's briefing twice, and stripping them out of the
// briefing itself does most of the work: a model mirrors the punctuation of
// the text it's given, so a prompt full of dashes is a prompt that teaches
// them. This is the belt to that pair of braces. It runs on the words she
// writes, never on tool inputs, so a dash inside an address she's looking up
// is left alone.
//
// ——— Why this is its own module ———
//
// It used to live in route.ts, which meant it covered exactly one thing: the
// prose in the bubble. Everything else Riley authors — the quick-reply chips
// from suggest_replies, the button label from open_screen — is produced in
// tools.ts and went to the browser untouched, so a chip reading "Something
// without dairy — vegan?" shipped past a rule the same reply's paragraph was
// held to. A route module is not somewhere another module should import from,
// so the scrub moved here and both ends import it.
//
// The replacement is picked by what sits either side. A sentence already
// closed by its own punctuation just needs the space ("Good Lox Today!, the
// best one" is worse than the dash was). A capital letter after it means the
// dash was joining two sentences, so it becomes a full stop. Anything else was
// parenthetical, so it becomes a comma.
//
// A spaced en dash is doing an em dash's job and gets the same treatment. An
// unspaced one is a range ("7am-2pm") and is left alone.
const DASH = /([^\s])?\s*[\u2014\u2015]\s*(.?)/g;

// "Want to head to checkout?Just tap that" — a sentence ending and the next
// one starting with no space between them. It reached the screen twice in one
// conversation, and while the cause is upstream (a model writing it, or bold
// markers closing against the next word and being stripped by RichText), the
// fix belongs here: nothing downstream can tell the difference, and a space
// that should be there is not a judgement call.
//
// Narrow on purpose. It fires only when a *lowercase* letter precedes the
// punctuation, which is what keeps it away from the things that legitimately
// run together: "U.S.A" keeps its stops, "$7.00" is digits, and an ellipsis
// has no capital after it. "e.g.Foo" is caught and wanted.
const SENTENCE_RUN_ON = /([a-z][.!?])([A-Z])/g;

export function noEmDashes(text: string): string {
  return text
    .replace(DASH, (_match, before: string | undefined, after: string) => {
      const lead = before ?? "";
      if (/[.!?:;,]/.test(lead)) return `${lead} ${after}`;
      const joinsSentences =
        after.length > 0 && after === after.toUpperCase() && after !== after.toLowerCase();
      return `${lead}${joinsSentences ? ". " : ", "}${after}`;
    })
    .replace(/ \u2013 /g, ", ")
    .replace(SENTENCE_RUN_ON, "$1 $2");
}

// The scrub above decides what to put in a dash's place by looking at the
// character *after* it — which, mid-stream, may not have arrived. A dash at
// the very end would become a comma on one frame and a full stop on the next,
// visibly, so a trailing one is held back until the next chunk says what it
// was joining.
export function scrubPartial(text: string): string {
  return noEmDashes(text.replace(/[\u2014\u2015\u2013]\s*$/, ""));
}
