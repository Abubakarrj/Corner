// The languages the app offers, and the script that applies the choice.
//
// Kept apart from app/locale.ts for the same reason themeScript.ts is kept
// apart from theme.ts: that file has hooks, so it is a client module, and the
// root layout is a server component that needs these as plain values.

export const LOCALE_STORAGE_KEY = "cb-locale-v1";
export const LOCALE_CHANGED_EVENT = "cb-locale-changed";

export type LocaleId =
  | "en"
  | "es"
  | "fr"
  | "it"
  | "ko"
  | "ur"
  | "fa"
  | "ja"
  | "zh"
  | "my";

export type Locale = {
  id: LocaleId;
  // What English calls it, for the aria-label and for our own logs.
  english: string;
  // What its own speakers call it. This is what the picker shows, because a
  // list that says "Korean" to somebody who reads Korean is a list written for
  // the people who already understand it.
  native: string;
  // The BCP 47 tag for <html lang>, which is what a screen reader uses to pick
  // a voice and what a browser uses to pick a font and hyphenation.
  tag: string;
  dir: "ltr" | "rtl";
};

export const LOCALES: Locale[] = [
  { id: "en", english: "English", native: "English", tag: "en", dir: "ltr" },
  { id: "es", english: "Spanish", native: "Español", tag: "es", dir: "ltr" },
  { id: "fr", english: "French", native: "Français", tag: "fr", dir: "ltr" },
  { id: "it", english: "Italian", native: "Italiano", tag: "it", dir: "ltr" },
  { id: "ko", english: "Korean", native: "한국어", tag: "ko", dir: "ltr" },
  // The right-to-left pair, and the reason `dir` exists in this table at all.
  // Everything else about a locale is a lookup; these two change the geometry
  // of every screen.
  //
  // Urdu was on its own here for a long time, which made it easy to read a
  // mirroring bug as "the Urdu bug". Persian is the second, and the useful
  // thing about a second is that anything broken in both is broken in RTL.
  { id: "ur", english: "Urdu", native: "اردو", tag: "ur", dir: "rtl" },
  { id: "fa", english: "Persian", native: "فارسی", tag: "fa", dir: "rtl" },
  { id: "ja", english: "Japanese", native: "日本語", tag: "ja", dir: "ltr" },
  { id: "zh", english: "Chinese", native: "中文", tag: "zh-Hans", dir: "ltr" },
  { id: "my", english: "Burmese", native: "မြန်မာ", tag: "my", dir: "ltr" },
];

export const DEFAULT_LOCALE: LocaleId = "en";

export function localeById(id: string): Locale {
  return LOCALES.find((locale) => locale.id === id) ?? LOCALES[0];
}

// Runs in <head>, before anything paints, for the same reason the theme script
// does: `dir="rtl"` applied in an effect is a frame of the whole app laid out
// backwards, which is a far worse flash than a wrong colour.
//
// It also handles the first visit, where there is no stored choice: the
// browser's own languages are matched against the ones we offer, so somebody
// whose phone is set to Korean gets Korean without having to find the picker.
// An exact match wins; failing that the base tag, so es-MX finds es.
//
// try/catch because Safari's private mode throws on a localStorage read, and a
// throw here happens before there is an app to catch it.
const TABLE = LOCALES.map((locale) => [locale.id, locale.tag, locale.dir]);

export const LOCALE_SCRIPT = `(function(){try{
var r=document.documentElement,K=${JSON.stringify(LOCALE_STORAGE_KEY)},T=${JSON.stringify(TABLE)};
function find(id){for(var i=0;i<T.length;i++){if(T[i][0]===id)return T[i]}return null}
function guess(){
var langs=navigator.languages||[navigator.language||"en"];
for(var i=0;i<langs.length;i++){
var l=String(langs[i]).toLowerCase();
for(var j=0;j<T.length;j++){if(l===T[j][1].toLowerCase())return T[j]}
var base=l.split("-")[0];
for(var k=0;k<T.length;k++){if(base===T[k][0])return T[k]}
}
return T[0]}
function read(){try{var v=localStorage.getItem(K);return (v&&find(v))||guess()}catch(e){return T[0]}}
function apply(){var e=read();r.setAttribute("lang",e[1]);r.setAttribute("dir",e[2]);}
apply();
window.addEventListener(${JSON.stringify(LOCALE_CHANGED_EVENT)},apply);
}catch(e){}})();`;
