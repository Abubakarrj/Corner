// The handful of true things about Corner Bagel that more than one screen
// needs to state: the hours, the address, the email.
//
// They live here rather than being typed into each page because they are the
// things most likely to be wrong somewhere. Hours in particular were
// "Hours to come" in one file and unmentioned in three others; when they
// changed there was no single place to change them, and Riley would have gone
// on telling people they weren't published.
export const SHOP_HOURS = "7am – 2pm, daily";

// Compact form for a status line ("Open until 2pm").
export const OPEN_HOUR = 7;
export const CLOSE_HOUR = 14;

export const SHOP_ADDRESS = "3064 W 8th St";
export const SHOP_CITY = "Los Angeles, CA 90005";
export const SHOP_EMAIL = "cornerbagel@publicentity.co";

// Whether the counter is open right now, in the shop's own timezone rather
// than the visitor's — someone checking from New York at 5pm wants to know
// whether they can order in Los Angeles, not what time it is where they are.
export function isOpenNow(now: Date = new Date()): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  return hour >= OPEN_HOUR && hour < CLOSE_HOUR;
}
