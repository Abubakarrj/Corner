// The handful of true things about Corner Bagel that more than one screen
// needs to state: the hours, the address, the email.
//
// They live here rather than being typed into each page because they are the
// things most likely to be wrong somewhere. Hours in particular were
// "Hours to come" in one file and unmentioned in three others; when they
// changed there was no single place to change them, and Riley would have gone
// on telling people they weren't published.
export const SHOP_HOURS = "Wed – Sun, 7am – 2pm";

// Compact form for a status line ("Open until 2pm").
export const OPEN_HOUR = 7;
export const CLOSE_HOUR = 14;

// The days the window is open, as JavaScript weekdays (0 = Sunday). Monday
// and Tuesday are closed. Kept as data rather than folded into isOpenNow so
// that a screen can say *which* days without re-deriving them from the
// sentence above.
export const OPEN_DAYS = [0, 3, 4, 5, 6];

export const SHOP_ADDRESS = "3064 W 8th St";
export const SHOP_CITY = "Los Angeles, CA 90005";
export const SHOP_EMAIL = "cornerbagel@publicentity.co";

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
  if (OPEN_DAYS.includes(day) && hour < OPEN_HOUR) return "at 7am";

  // Otherwise walk forward to the next open day.
  for (let ahead = 1; ahead <= 7; ahead += 1) {
    const next = (day + ahead) % 7;
    if (!OPEN_DAYS.includes(next)) continue;
    return ahead === 1 ? "tomorrow at 7am" : `${DAY_LONG[next]} at 7am`;
  }
  return null;
}

// One line for a header or a chat: open and until when, or shut and until
// when. Deliberately not "Open now!" — the useful half is the time.
export function openingStatus(now: Date = new Date()): {
  open: boolean;
  label: string;
} {
  if (isOpenNow(now)) return { open: true, label: "Open until 2pm" };
  const next = nextOpening(now);
  return { open: false, label: next ? `Closed · opens ${next}` : "Closed" };
}
