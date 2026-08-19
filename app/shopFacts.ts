// The handful of true things about Corner Bagel that more than one screen
// needs to state: the hours, the address, the email.
//
// They live here rather than being typed into each page because they are the
// things most likely to be wrong somewhere. Hours in particular were
// "Hours to come" in one file and unmentioned in three others; when they
// changed there was no single place to change them, and Riley would have gone
// on telling people they weren't published.
// A hyphen between the times, not an en dash, and that is load-bearing rather
// than a typo. Riley's reply is scrubbed for em dashes on the way out and a
// *spaced* en dash is doing an em dash's job, so it would be replaced by a
// comma and reach a customer as "7 AM, 4 PM". An unspaced en dash survives the
// scrub but does not match the shop's own signage, which is what this is.
export const SHOP_HOURS = "Everyday • 7 AM - 4 PM";

/** The same line for a counter that opens at a different hour.
 *
 *  Built rather than typed, so a counter's hours line and the clock that
 *  decides whether it will take an order cannot say different things — which
 *  is the whole reason the times were moved out of prose in the first place.
 *  See the note above clockLabel. */
export function hoursLine(opensAt: number = OPEN_HOUR): string {
  if (opensAt === OPEN_HOUR) return SHOP_HOURS;
  return `Everyday • ${clockLabel(opensAt)} - ${clockLabel(CLOSE_HOUR)}`;
}

// The hour the counters open by default, and the hour they all close.
//
// ——— Why opening is a parameter below and closing is not ———
//
// The counters do not open together: the full stores from 7, the Western Ave
// outlet from 11. They do close together, at 4, and until that stops being
// true a second parameter would be a knob nothing turns.
//
// So OPEN_HOUR is the default rather than the rule, and every function that
// answers a question about the clock takes the hour it should answer for.
// Called without one they answer for a counter that opens at 7, which is what
// every existing caller means: the shop, generally, on a screen that is not
// about one address.
export const OPEN_HOUR = 7;
export const CLOSE_HOUR = 16;

// "7 AM" and "4 PM", derived rather than typed.
//
// Three screens had "2pm" written into a sentence, so changing the closing
// time meant finding all three, and the order flow told people it shut at 2pm
// for as long as one was missed. A time that appears in prose is still the
// same fact as the number the clock compares against, and it should come from
// the same place.
// The default is the shop's own house style, "7 AM", spaced and capitalised.
// Every other language gets what its locale data says, because "午前7時" is
// not a variant of "7 AM" that can be reached by casing anything.
//
// Changed here and not at the one call site that prompted it. This is the only
// place an English time is spelled, and it feeds the hours line, "Open until
// 4 PM", "opens at 7 AM", the checkout's closing notice and Riley — so styling
// one of them differently is how a shop ends up telling somebody it shuts at
// "4pm" on one screen and "4 PM" on the next.
export function clockLabel(hour24: number, tag = "en-US"): string {
  if (tag.startsWith("en")) {
    const period = hour24 >= 12 ? "PM" : "AM";
    const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${hour} ${period}`;
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

// The store's address, which is the Wilshire counter — not the outlet on
// Western and not the one by USC. Several counters now, and this constant is
// singular by design: it is the fallback a courier gets when no store was
// resolved, and the address Riley reads out. Falling back to one real, full
// store is the safe direction. Anything that needs *which* counter reads
// LOCATIONS.
export const SHOP_ADDRESS = "3450 Wilshire Blvd, Suite R3452H";
export const SHOP_CITY = "Los Angeles, CA 90010";
export const SHOP_EMAIL = "cornerbagel@publicentity.co";

// The same address broken into fields, and the number a courier calls when
// they're outside. A courier dispatch API wants the parts, not the sentence:
// "3450 Wilshire Blvd" on its own names no city, and a free-text address is
// where a delivery ends up in the wrong Los Angeles. Derived from the two
// lines above so they can't drift apart.
export const SHOP_ADDRESS_PARTS = {
  street: SHOP_ADDRESS,
  city: "Los Angeles",
  state: "CA",
  zip: "90010",
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
// The shop's zone, named once. Everything that reads or builds a shop-local
// time goes through it, so a second shop in a second zone is one field on a
// location record rather than a search for string literals.
export const SHOP_TIME_ZONE = "America/Los_Angeles";

export function shopClock(now: Date): { day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TIME_ZONE,
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

/** The instant at which it is `hour:minute` in the shop's zone, on the shop's
 *  calendar day containing `on`.
 *
 *  ——— Why this is not `setHours` ———
 *
 *  setHours works in the *runtime's* zone. On a laptop in Los Angeles that is
 *  the same answer and the bug is invisible; on a server in UTC — which is
 *  every server this will ever run on — "7 AM" becomes midnight Pacific, and
 *  the whole schedule slides eight hours into the night.
 *
 *  Built by measuring rather than by arithmetic on offsets: take a guess at
 *  the instant, ask what o'clock that is in the shop's zone, and correct by
 *  the difference. Two passes settle it even across a daylight-saving jump,
 *  which is the case an offset table gets wrong twice a year.
 */
export function shopInstant(on: Date, hour: number, minute = 0): Date {
  // Start from the same calendar day as `on`, as the shop reckons days.
  const dayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(on);
  const part = (type: string) => dayParts.find((p) => p.type === type)?.value ?? "01";
  const isoDay = `${part("year")}-${part("month")}-${part("day")}`;

  // A first guess in UTC, then two corrections against the shop's own clock.
  let guess = new Date(`${isoDay}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  for (let pass = 0; pass < 2; pass += 1) {
    const seen = shopClock(guess);
    const driftMinutes = (seen.hour - hour) * 60 + (seen.minute - minute);
    if (driftMinutes === 0) break;
    guess = new Date(guess.getTime() - driftMinutes * 60_000);
  }
  return guess;
}

// ——— ⚠️ Testing outside opening hours ———
//
// 7am–4pm is a narrow window to do integration work in, and it is the only
// thing standing between somebody and a test order: the delivery quote, the
// courier booking, the Toast ticket, the queue count and the tracker can only
// be exercised end to end while the shop is open. SHOP_OPEN_PREVIEW moves the
// closing time so that work can happen in an evening.
//
//   SHOP_OPEN_PREVIEW=21   the counter closes at 9pm today instead of 4pm
//   SHOP_OPEN_PREVIEW=1    open at every hour of every day
//
// ⚠️ Either way the app will take an order the kitchen is not there to make.
// The customer is told their breakfast is being prepared, a courier is booked
// and arrives at a dark shop, and the first anybody knows is a complaint. Same
// warning PAYMENTS_PREVIEW carries, for the same reason: both make the app
// claim something that is not true.
//
// An hour is the safer of the two and the one to reach for. It bounds the
// damage — the shop still opens at 7am, so nothing is orderable at 3am — and,
// more to the point, it expires on its own. A `1` sits in an environment
// until somebody remembers it is there, which is how a test setting becomes a
// production one; `21` stops mattering at 9pm whether or not anybody comes
// back to remove it.
//
// Deliberately not NEXT_PUBLIC_. The browser learns about it through
// /api/capabilities like every other capability, so turning it on is a server
// decision and there is one place to look.
function previewSetting(): string {
  return process.env.SHOP_OPEN_PREVIEW?.trim() ?? "";
}

/** True while any preview is in force. What /api/capabilities reports. */
export function openPreview(): boolean {
  return previewSetting().length > 0 && closeHour() !== CLOSE_HOUR;
}

/** Open at every hour, rather than merely later. */
function alwaysOpen(): boolean {
  return previewSetting() === "1";
}

/** The hour the counter actually stops taking orders.
 *
 *  CLOSE_HOUR normally. The preview's hour when one is set, so that everything
 *  reading this agrees — the hours line on the shop sheet, the "no time to
 *  make that" refusal, and the gate itself. The first cut moved only the gate,
 *  which would have left the sheet reading "Every Day, 7am–4pm" while the
 *  checkout happily took an order at half past six. */
export function closeHour(): number {
  if (alwaysOpen()) return 24;
  const hour = Number(previewSetting());
  // Between the opening hour and midnight, or it is not a closing time. A
  // typo falls through to the real hours rather than opening the shop.
  return Number.isInteger(hour) && hour > OPEN_HOUR && hour <= 24 ? hour : CLOSE_HOUR;
}

export function closeLabel(): string {
  return clockLabel(closeHour() % 24);
}

export function isOpenNow(now: Date = new Date(), opensAt: number = OPEN_HOUR): boolean {
  if (alwaysOpen()) return true;
  const { day, hour } = shopClock(now);
  return OPEN_DAYS.includes(day) && hour >= opensAt && hour < closeHour();
}

// Minutes left before the counter closes, or 0 if it's already shut. What the
// order flow actually needs: not "are you open" but "is there time to make
// this". Ordering at 1:58pm is technically inside opening hours and still no
// use to anybody.
export function minutesUntilClose(now: Date = new Date(), opensAt: number = OPEN_HOUR): number {
  if (!isOpenNow(now, opensAt)) return 0;
  const { hour, minute } = shopClock(now);
  return (closeHour() - hour) * 60 - minute;
}

// When the window opens next, phrased for a person: "tomorrow at 7am", "at
// 7am", "Wednesday at 7am". Returns null while it's open.
export function nextOpening(
  now: Date = new Date(),
  opensAt: number = OPEN_HOUR,
): string | null {
  if (isOpenNow(now, opensAt)) return null;
  const { day, hour } = shopClock(now);
  // The label follows the hour being asked about, so "opens at 11 AM" is what
  // somebody waiting outside the outlet is told rather than the shop's usual 7.
  const label = clockLabel(opensAt);

  // Later today, if today is an open day and it hasn't started yet.
  if (OPEN_DAYS.includes(day) && hour < opensAt) return `at ${label}`;

  // Otherwise walk forward to the next open day. With every day open this
  // always lands on tomorrow, and the loop stays because the shop closing on
  // a weekday should not also require rewriting this.
  for (let ahead = 1; ahead <= 7; ahead += 1) {
    const next = (day + ahead) % 7;
    if (!OPEN_DAYS.includes(next)) continue;
    return ahead === 1 ? `tomorrow at ${label}` : `${DAY_LONG[next]} at ${label}`;
  }
  return null;
}

/** A scheduled pickup time, as a customer reads it.
 *
 *  ——— Shop time, in the visitor's language ———
 *
 *  Both halves matter and they pull opposite ways. The zone is the shop's,
 *  always: somebody ordering from a hotel in Seoul for a friend in Koreatown
 *  must be shown the minute the door opens in Los Angeles, not the minute
 *  their own phone would call it. The words are theirs — the weekday comes out
 *  of Intl, so no new string has to be translated ten times for this to read
 *  correctly in ten languages.
 *
 *  ——— And why today has no weekday on it ———
 *
 *  "Ready Wednesday at 7:15 AM" on a Wednesday morning reads like next week.
 *  A time on its own is unambiguous when it is today and ambiguous when it is
 *  not, so the weekday appears exactly when it is doing work. */
export function slotLabel(at: Date, tag = "en-US"): string {
  const today = shopClock(new Date()).day === shopClock(at).day;
  try {
    return new Intl.DateTimeFormat(tag, {
      timeZone: SHOP_TIME_ZONE,
      ...(today ? {} : { weekday: "short" }),
      hour: "numeric",
      minute: "2-digit",
    }).format(at);
  } catch {
    // An unusable locale tag, which is a thing a URL can carry. The time is
    // the part that must survive.
    return slotLabel(at);
  }
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

export function nextOpeningAt(
  now: Date = new Date(),
  opensAt: number = OPEN_HOUR,
): NextOpening | null {
  if (isOpenNow(now, opensAt)) return null;
  const { day, hour } = shopClock(now);
  if (OPEN_DAYS.includes(day) && hour < opensAt) {
    return { when: "today", day, hour: opensAt };
  }
  for (let ahead = 1; ahead <= 7; ahead += 1) {
    const next = (day + ahead) % 7;
    if (!OPEN_DAYS.includes(next)) continue;
    return {
      when: ahead === 1 ? "tomorrow" : "day",
      day: next,
      hour: opensAt,
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
export function openingStatus(
  now: Date = new Date(),
  opensAt: number = OPEN_HOUR,
): {
  open: boolean;
  label: string;
} {
  if (isOpenNow(now, opensAt)) return { open: true, label: `Open until ${CLOSE_LABEL}` };
  const next = nextOpening(now, opensAt);
  return { open: false, label: next ? `Closed · opens ${next}` : "Closed" };
}
