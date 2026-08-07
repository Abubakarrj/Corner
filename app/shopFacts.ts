// The handful of true things about Corner Bagel that more than one screen
// needs to state: the hours, the address, the email.
//
// They live here rather than being typed into each page because they are the
// things most likely to be wrong somewhere. Hours in particular were
// "Hours to come" in one file and unmentioned in three others; when they
// changed there was no single place to change them, and Riley would have gone
// on telling people they weren't published.
// The en dash here is unspaced on purpose. Riley's reply is scrubbed for em
// dashes on the way out, and a *spaced* en dash is doing an em dash's job so
// it gets replaced by a comma. Unspaced, it reads as a range and is left
// alone, which is what "7am–4pm" is. Spaced, this would reach a customer as
// "7am, 4pm".
export const SHOP_HOURS = "Every day, 7am–4pm";

export const OPEN_HOUR = 7;
export const CLOSE_HOUR = 16;

// "7am" and "4pm", derived rather than typed.
//
// Three screens had "2pm" written into a sentence, so changing the closing
// time meant finding all three, and the order flow told people it shut at 2pm
// for as long as one was missed. A time that appears in prose is still the
// same fact as the number the clock compares against, and it should come from
// the same place.
// The default is the shop's own house style, "7am", closed up and lowercase.
// Every other language gets what its locale data says, because "午前7時" is
// not a variant of "7am" that can be reached by lowercasing anything.
export function clockLabel(hour24: number, tag = "en-US"): string {
  if (tag.startsWith("en")) {
    const period = hour24 >= 12 ? "pm" : "am";
    const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${hour}${period}`;
  }
  try {
    return new Date(2000, 0, 1, hour24).toLocaleTimeString(tag, { hour: "numeric" });
  } catch {
    return clockLabel(hour24);
  }
}

// A weekday name, in whichever language is asking. The English array below is
// still what shopClock() matches against — that one is a parse, not a label,
// and it has to stay in the locale the formatter is pinned to.
export function weekdayLabel(day: number, tag = "en-US"): string {
  try {
    // 2024-01-07 was a Sunday, so day 0 lands on the 7th.
    return new Date(2024, 0, 7 + day).toLocaleDateString(tag, { weekday: "long" });
  } catch {
    return DAY_LONG[day] ?? "";
  }
}

export const OPEN_LABEL = clockLabel(OPEN_HOUR);
export const CLOSE_LABEL = clockLabel(CLOSE_HOUR);

// How long the kitchen needs before an order is ready. One number, here,
// because it answers three separate questions that have to agree: whether
// there's still time to take an order before close, when the tracker says
// it'll be ready, and when a courier should turn up. It was written out
// three times, and three copies of a number is two chances to change one.
export const PREP_MINUTES = 12;

// The days the window is open, as JavaScript weekdays (0 = Sunday). Seven
// days a week, so this is all of them. Kept as a list rather than dropped now
// that nothing is excluded, because the code around it asks "is today an open
// day" and that question should keep having an answer the day the shop takes
// a Monday off.
export const OPEN_DAYS = [0, 1, 2, 3, 4, 5, 6];

export const SHOP_ADDRESS = "3064 W 8th St";
export const SHOP_CITY = "Los Angeles, CA 90005";
export const SHOP_EMAIL = "cornerbagel@publicentity.co";

// The same address broken into fields, and the number a courier calls when
// they're outside. A courier dispatch API wants the parts, not the sentence:
// "3064 W 8th St" on its own is ambiguous in a country with a W 8th St in
// most of its cities, and a free-text address is where a delivery ends up in
// the wrong Los Angeles. Derived from the two lines above so they can't
// drift apart.
export const SHOP_ADDRESS_PARTS = {
  street: SHOP_ADDRESS,
  city: "Los Angeles",
  state: "CA",
  zip: "90005",
};

// The shop's phone, in E.164 because that is what Uber Direct wants and it is
// the one format that is unambiguous everywhere else too.
//
// The real line, not a placeholder. It is dialled by a courier standing at the
// door, printed on the window, and offered to anybody Riley can't help — so it
// belongs in the source the same way the address does. Overridable by
// SHOP_PHONE for a second shop or a staging deploy that shouldn't ring a real
// counter.
export const SHOP_PHONE = process.env.SHOP_PHONE ?? "+12134196038";

// The same number as somebody would read it aloud. Every screen that shows a
// phone number shows this one, and every link that dials one dials SHOP_PHONE
// above — one number, two spellings, derived rather than typed twice.
export function shopPhoneLabel(): string {
  const digits = SHOP_PHONE.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return SHOP_PHONE;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// The shop's own wall clock, not the visitor's.
//
// Everything below reads the time this way. Someone checking from New York at
// 5pm wants to know whether they can order in Los Angeles, not what time it is
// where they are — and the day has to come from the same formatter as the
// hour, because at 11pm Monday in Los Angeles it is already Tuesday in London
// and asking the visitor's Date for its weekday would close the shop a day
// early.
function shopClock(now: Date): { day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);

  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    // Intl gives 24 for midnight in some locales' hourCycle; fold it to 0.
    hour: value("hour") % 24,
    minute: value("minute"),
    day: DAY_NAMES.indexOf(parts.find((part) => part.type === "weekday")?.value ?? ""),
  };
}

export function isOpenNow(now: Date = new Date()): boolean {
  const { day, hour } = shopClock(now);
  return OPEN_DAYS.includes(day) && hour >= OPEN_HOUR && hour < CLOSE_HOUR;
}

// Minutes left before the counter closes, or 0 if it's already shut. What the
// order flow actually needs: not "are you open" but "is there time to make
// this". Ordering at 1:58pm is technically inside opening hours and still no
// use to anybody.
export function minutesUntilClose(now: Date = new Date()): number {
  if (!isOpenNow(now)) return 0;
  const { hour, minute } = shopClock(now);
  return (CLOSE_HOUR - hour) * 60 - minute;
}

// When the window opens next, phrased for a person: "tomorrow at 7am", "at
// 7am", "Wednesday at 7am". Returns null while it's open.
export function nextOpening(now: Date = new Date()): string | null {
  if (isOpenNow(now)) return null;
  const { day, hour } = shopClock(now);

  // Later today, if today is an open day and it hasn't started yet.
  if (OPEN_DAYS.includes(day) && hour < OPEN_HOUR) return `at ${OPEN_LABEL}`;

  // Otherwise walk forward to the next open day. With every day open this
  // always lands on tomorrow, and the loop stays because the shop closing on
  // a weekday should not also require rewriting this.
  for (let ahead = 1; ahead <= 7; ahead += 1) {
    const next = (day + ahead) % 7;
    if (!OPEN_DAYS.includes(next)) continue;
    return ahead === 1
      ? `tomorrow at ${OPEN_LABEL}`
      : `${DAY_LONG[next]} at ${OPEN_LABEL}`;
  }
  return null;
}

// When the window opens next, as parts rather than a sentence — the same
// answer nextOpening() gives, for the screens that have to say it in a
// language this module doesn't know. `day` is a JavaScript weekday, and only
// meaningful when `when` is "day".
export type NextOpening = {
  when: "today" | "tomorrow" | "day";
  day: number;
  hour: number;
};

export function nextOpeningAt(now: Date = new Date()): NextOpening | null {
  if (isOpenNow(now)) return null;
  const { day, hour } = shopClock(now);
  if (OPEN_DAYS.includes(day) && hour < OPEN_HOUR) {
    return { when: "today", day, hour: OPEN_HOUR };
  }
  for (let ahead = 1; ahead <= 7; ahead += 1) {
    const next = (day + ahead) % 7;
    if (!OPEN_DAYS.includes(next)) continue;
    return {
      when: ahead === 1 ? "tomorrow" : "day",
      day: next,
      hour: OPEN_HOUR,
    };
  }
  return null;
}

// One line for a header or a chat: open and until when, or shut and until
// when. Deliberately not "Open now!" — the useful half is the time.
//
// English, and that's deliberate: this one goes into Riley's briefing and the
// order endpoint's log, neither of which has a visitor attached. The screens
// build the same sentence from nextOpeningAt() and the string tables.
export function openingStatus(now: Date = new Date()): {
  open: boolean;
  label: string;
} {
  if (isOpenNow(now)) return { open: true, label: `Open until ${CLOSE_LABEL}` };
  const next = nextOpening(now);
  return { open: false, label: next ? `Closed · opens ${next}` : "Closed" };
}
