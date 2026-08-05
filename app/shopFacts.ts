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

// Whether the counter is open right now, in the shop's own timezone rather
// than the visitor's — someone checking from New York at 5pm wants to know
// whether they can order in Los Angeles, not what time it is where they are.
//
// The day has to come out of the same formatter as the hour, for the same
// reason: at 11pm Monday in Los Angeles it is already Tuesday in London, and
// asking the visitor's Date for its weekday would close the shop a day early.
export function isOpenNow(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);

  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    weekday ?? "",
  );

  return OPEN_DAYS.includes(day) && hour >= OPEN_HOUR && hour < CLOSE_HOUR;
}
