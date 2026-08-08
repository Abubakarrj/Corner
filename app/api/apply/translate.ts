import Anthropic from "@anthropic-ai/sdk";
import type { Application } from "../../(marketing)/careers/application";

// Turning an application into English.
//
// The form is offered in ten languages, so it collects answers in ten
// languages, and the person who reads them reads one. Before this, a
// application written in Korean arrived as a PDF the hiring desk couldn't read
// and a font that couldn't draw it — which meant the ten translations quietly
// served everyone except the people they were for.
//
// So every submission that isn't already in English goes through one pass and
// comes back in English. Three rules make that defensible rather than merely
// convenient:
//
//   The original is never thrown away. The covering email carries both, the
//   applicant's own words underneath. A translation is an interpretation, and
//   nobody should be judged on a paraphrase without the source next to it.
//
//   It is labelled. The document says it was translated and from what, because
//   a hiring manager weighing how somebody writes needs to know they are
//   reading a machine and not the applicant.
//
//   It never blocks the send. Any failure — no key, a timeout, a malformed
//   answer — falls back to the original text and says so. Losing an
//   application to a translation service is a far worse outcome than reading
//   one in the language it was written in.
//
// Names are romanized rather than translated. A name is not a word with a
// meaning to render; it is what somebody is called, and the shop needs to be
// able to say it out loud to ring them up.

const MODEL = process.env.APPLY_TRANSLATE_MODEL ?? "claude-opus-5";
const MAX_TOKENS = 4096;
// Generous, because this runs while somebody watches a spinner, but bounded,
// because the send waits on it. Past this we give up and mail the original.
const TIMEOUT_MS = 45_000;

/** Every field worth translating, as a flat list. Flat rather than nested so
    the schema the model answers against is small and the mapping back is a
    lookup rather than a walk. */
type Field = { id: string; text: string };

export type Translation = {
  /** The application with its free text in English, or the original when
      nothing was translated. */
  english: Application;
  /** True when at least one field actually came back changed. */
  translated: boolean;
  /** The language it came from, in English, when we know it. */
  from?: string;
  /** Set when translation was wanted but couldn't be done, so the email can
      say why it is reading in the original language. */
  failed?: boolean;
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  ko: "Korean",
  ur: "Urdu",
  fa: "Persian",
  ja: "Japanese",
  zh: "Chinese",
  my: "Burmese",
};

// A letter that isn't Latin script — the lookahead rules out Latin, and
// \p{Letter} rules out digits, spaces and punctuation.
//
// Script-aware rather than a codepoint range, and the difference is not
// academic. A range that stops at Latin Extended-B calls Nguyễn "non-Latin"
// and sends a Vietnamese name in an otherwise English application off to be
// romanized into Nguyen — stripping the diacritics from somebody's name for no
// reason, since the PDF's font draws them perfectly well. Accented Latin is
// Latin.
const NON_LATIN_LETTER = /(?!\p{Script=Latin})\p{Letter}/u;

/** A second trigger beside the locale, for the case that actually breaks the
    document: somebody left the picker on English and typed in Korean. */
function hasNonLatin(text: string): boolean {
  return NON_LATIN_LETTER.test(text);
}

/** The fields to send, in a stable order. Dates, emails, phone numbers and
    the id-based answers are left alone: they are already language-neutral, and
    a model asked to "translate" a phone number is a model given the chance to
    change one. */
function collect(application: Application): Field[] {
  const fields: Field[] = [];
  const add = (id: string, text: string) => {
    if (text.trim() !== "") fields.push({ id, text: text.trim() });
  };

  add("firstName", application.firstName);
  add("lastName", application.lastName);
  add("city", application.city);
  add("state", application.state);
  application.education.forEach((row, index) => {
    add(`education.${index}.school`, row.school);
    add(`education.${index}.focus`, row.focus);
  });
  application.employment.forEach((row, index) => {
    add(`employment.${index}.employer`, row.employer);
    add(`employment.${index}.role`, row.role);
  });
  application.references.forEach((row, index) => {
    add(`references.${index}.name`, row.name);
    add(`references.${index}.relationship`, row.relationship);
  });
  add("goals", application.goals);
  add("hardestDecision", application.hardestDecision);
  add("toSucceed", application.toSucceed);
  add("heardFrom", application.heardFrom);
  add("signature", application.signature);

  return fields;
}

/** Put the English back where it came from. Anything the model didn't answer
    for keeps its original text, so a partial response degrades to a partly
    translated document rather than a document with holes in it. */
function apply(application: Application, english: Map<string, string>): Application {
  const get = (id: string, fallback: string) => english.get(id) ?? fallback;
  return {
    ...application,
    firstName: get("firstName", application.firstName),
    lastName: get("lastName", application.lastName),
    city: get("city", application.city),
    state: get("state", application.state),
    education: application.education.map((row, index) => ({
      ...row,
      school: get(`education.${index}.school`, row.school),
      focus: get(`education.${index}.focus`, row.focus),
    })),
    employment: application.employment.map((row, index) => ({
      ...row,
      employer: get(`employment.${index}.employer`, row.employer),
      role: get(`employment.${index}.role`, row.role),
    })),
    references: application.references.map((row, index) => ({
      ...row,
      name: get(`references.${index}.name`, row.name),
      relationship: get(`references.${index}.relationship`, row.relationship),
    })),
    goals: get("goals", application.goals),
    hardestDecision: get("hardestDecision", application.hardestDecision),
    toSucceed: get("toSucceed", application.toSucceed),
    heardFrom: get("heardFrom", application.heardFrom),
    signature: get("signature", application.signature),
  };
}

const SCHEMA = {
  type: "object",
  properties: {
    fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          english: { type: "string" },
        },
        required: ["id", "english"],
        additionalProperties: false,
      },
    },
  },
  required: ["fields"],
  additionalProperties: false,
} as const;

const INSTRUCTIONS = [
  "You are translating a job application for a bagel shop in Los Angeles so the",
  "owner, who reads English, can read it. Return English for every field you are",
  "given, keyed by the same id.",
  "",
  "Rules:",
  "- Translate meaning, not word for word. These are ordinary answers from",
  "  ordinary people; keep them plain and keep the person's voice.",
  "- Names of people (firstName, lastName, signature, references.*.name) are",
  "  romanized, not translated, and a name already written in Latin letters is",
  "  left exactly as it is: Nguyễn stays Nguyễn, accents and all. 박지민",
  "  becomes Park Ji-min.",
  "- Place names, schools and employers: use the established English name if",
  "  there is one, otherwise romanize.",
  "- Text already in English comes back unchanged.",
  "- Never add, summarize, improve, or leave anything out. If an answer is",
  "  short or badly written, its English is short or badly written too. This is",
  "  read to decide whether to interview somebody, so flattering it would be",
  "  misrepresenting them.",
  "- Answer only with the JSON object.",
].join("\n");

export async function toEnglish(
  application: Application,
  locale: string | undefined,
): Promise<Translation> {
  const fields = collect(application);
  const needsIt =
    (locale !== undefined && locale !== "en" && locale in LANGUAGE_NAMES) ||
    fields.some((field) => hasNonLatin(field.text));

  if (!needsIt || fields.length === 0) {
    return { english: application, translated: false };
  }

  const from = locale && LANGUAGE_NAMES[locale] ? LANGUAGE_NAMES[locale] : undefined;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[apply] no ANTHROPIC_API_KEY — application not translated");
    return { english: application, translated: false, from, failed: true };
  }

  try {
    const anthropic = new Anthropic({ apiKey, timeout: TIMEOUT_MS });
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: INSTRUCTIONS,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content:
            (from ? `The applicant filled the form in ${from}.\n\n` : "") +
            JSON.stringify({ fields }),
        },
      ],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    const parsed = JSON.parse(text) as { fields?: { id?: unknown; english?: unknown }[] };

    const english = new Map<string, string>();
    for (const entry of parsed.fields ?? []) {
      if (typeof entry?.id === "string" && typeof entry.english === "string") {
        const value = entry.english.trim();
        if (value !== "") english.set(entry.id, value);
      }
    }
    if (english.size === 0) throw new Error("no fields came back");

    return { english: apply(application, english), translated: true, from };
  } catch (error) {
    // The application still goes out, in the language it was written in.
    console.error("[apply] translation failed, sending the original:", error);
    return { english: application, translated: false, from, failed: true };
  }
}
