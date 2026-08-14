import { DEFAULT_LOCALE, type LocaleId } from "../localeScript";
import { en, type StringKey, type Table } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { it } from "./it";
import { fa } from "./fa";
import { ko } from "./ko";
import { ur } from "./ur";
import { ja } from "./ja";
import { zh } from "./zh";
import { my } from "./my";

// The string tables and the lookup, with no "use client" on them.
//
// Same reason menuTables.ts exists next door: app/i18n/index.ts is a client
// module, because it is a React store over localStorage, and a server route
// cannot import from it. So the parts that are neither React nor browser — a
// table of strings and a substitution — live here, and index.ts is the hook
// layer on top.
//
// ——— What this is for ———
//
// Almost every route answers with a *key* and lets the screen say the words,
// because a route has no locale. The chat is the exception: it is Riley
// talking, the visitor's language arrives in the request body, and four of her
// sentences are written here rather than by the model — the apology when there
// is no API key, the one when she refuses, the one when a turn falls over, and
// the one when she runs out of tool rounds.
//
// Those four shipped as English string literals, and they went into the bubble
// exactly as they were: a Korean conversation, answered in Korean, ending in
// "That took longer than it should have, ask me again?". The panels beside
// them had just been moved onto keys for this exact reason and the prose path
// was missed.

export type { StringKey, Table };

export const TABLES: Record<LocaleId, Table> = { en, es, fr, it, ko, ur, fa, ja, zh, my };

/** The values a string can be given, as in t("finder.about", { name: "Koreatown" }). */
export type Vars = Record<string, string | number>;

// Substitution is {name}, not string concatenation, and that is the whole
// reason it exists. A sentence assembled from fragments in code assumes
// English word order: "{name} is {miles} miles away" has the distance before
// the shop in some languages and after it in others, and a translator who has
// the whole sentence can move the pieces. One who is handed three fragments
// cannot.
export function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole,
  );
}

// Falls back to English for any key a language hasn't been given yet, which is
// what makes shipping a translation possible one screen at a time: a missing
// string is an English word in the right place, not a blank or a key name.
export function translate(locale: LocaleId, key: StringKey, vars?: Vars): string {
  return fill(TABLES[locale]?.[key] ?? en[key] ?? key, vars);
}

export { DEFAULT_LOCALE };
