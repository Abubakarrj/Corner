"use client";

import { milesBetween } from "./(marketing)/locations/locations";

// Finding the visitor, and being honest about how well we found them.
//
// ——— Why this is not one getCurrentPosition call ———
//
// It was, with enableHighAccuracy: false and an eight second timeout, and
// that combination is wrong for a delivery app in three separate ways.
//
// `false` asks the phone for a network fix — which cell tower, which wifi —
// and that is hundreds of metres in a dense city. Fine for "which shop is
// nearest", useless for "which building do I bring this to", and this button
// is used for both.
//
// Eight seconds is shorter than a cold GPS takes. A phone that has not had a
// fix recently needs ten to fifteen, so the honest high-accuracy request has
// to be given room, and the timeout has to fall back rather than fail: a
// coarse answer beats no answer for picking a neighbourhood.
//
// And every failure looked the same. "We couldn't get your location" is
// useless advice to somebody who denied the permission — nothing they do on
// this screen will change it, and the fix is two taps away in settings they
// have not been told about.
//
// ——— The one thing we cannot do from here ———
//
// iOS has a Precise Location switch per site, separate from allowing location
// at all. With it off the OS returns a real position with an accuracy radius
// of a kilometre or more, and there is no API to ask for it back — the
// request succeeds, and the answer is a neighbourhood.
//
// So it is detected rather than requested: a fix that lands with a huge
// accuracy radius is reported as coarse, and the screen can say what to turn
// on. That is the whole of what "activate precise location" can mean from
// inside a web app.

export type Fix = {
  point: [number, number];
  /** Radius the platform claims, in metres. */
  accuracyMeters: number;
  /** True when the fix is too coarse to be an address — see above. */
  coarse: boolean;
};

export type LocateFailure = "unsupported" | "denied" | "unavailable";

export type LocateResult = { ok: true; fix: Fix } | { ok: false; why: LocateFailure };

// Above this, a fix is a district rather than a doorstep.
//
// 1500m is chosen against what the platforms actually return, not as a round
// number: a GPS fix outdoors is 5–20m, indoors on wifi 20–100m, a cell-tower
// fix 500–2000m, and iOS reduced accuracy is deliberately in the 1–3km range.
// The line sits above every fix that could name a building and below every
// fix that cannot.
const COARSE_METRES = 1500;

// ——— The last fix, kept so a second question does not need a second ask ———
//
// Only ever written by a locateMe() that succeeded, which means somebody has
// already granted the permission for something they asked for. Nothing here
// requests a position: a module that quietly triggered the browser's location
// prompt to improve a dropdown would be exactly the behaviour the prompt
// exists to prevent.
//
// In memory only. It is not written to storage, so it dies with the tab.
let last: { fix: Fix; at: number } | null = null;

// After this the fix is a place the visitor used to be. Half an hour, the same
// span visits.ts calls "away", and for the same reason: it is long enough to
// cover a phone in a pocket and short enough that this morning is not now.
const STALE_MS = 30 * 60 * 1000;

/** The most recent fix, if one was taken recently enough to still describe
 *  where the visitor is. Never asks for a new one. */
export function recentFix(): Fix | null {
  if (!last) return null;
  return Date.now() - last.at < STALE_MS ? last.fix : null;
}

// How far from the shop a fix can be and still be the better centre to search
// around. Fifteen miles, a little beyond the ten-mile delivery radius, so
// somebody standing just outside the zone typing an address inside it still
// gets a circle that covers the whole of it.
const BIAS_MILES = 15;

/** Where to centre an address search.
 *
 *  ——— Why this is not simply "wherever the visitor is" ———
 *
 *  The search is biased, not restricted: a centre only decides what ranks
 *  first. Centring on the visitor is right when they are in the neighbourhood,
 *  because "300 W" then means their own block rather than the identically
 *  named street on the other side of the city, and Los Angeles has plenty of
 *  those.
 *
 *  It is wrong when they are not. Somebody in New York sending bagels to a
 *  friend in Koreatown is typing a Los Angeles address, and a circle drawn
 *  around Manhattan ranks it nowhere. Their position is real and still the
 *  worse answer, so it is the distance to the shop that decides, not whether
 *  we happen to know where they are.
 *
 *  A coarse fix is fine here. This picks a centre for a twelve-mile circle,
 *  and a kilometre of doubt does not move that circle in any way that changes
 *  what ranks first — which is why it is used where the delivery pin refuses
 *  it. */
export function searchBias(fallback: [number, number]): [number, number] {
  const fix = recentFix();
  if (!fix) return fallback;
  return milesBetween(fix.point, fallback) <= BIAS_MILES ? fix.point : fallback;
}

function once(options: PositionOptions): Promise<GeolocationPosition | GeolocationPositionError> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(resolve, resolve, options);
  });
}

function isError(value: unknown): value is GeolocationPositionError {
  return typeof (value as GeolocationPositionError)?.code === "number";
}

function toFix(position: GeolocationPosition): Fix {
  const accuracyMeters = position.coords.accuracy;
  const fix: Fix = {
    point: [position.coords.latitude, position.coords.longitude],
    accuracyMeters,
    coarse: !Number.isFinite(accuracyMeters) || accuracyMeters > COARSE_METRES,
  };
  // Every success passes through here, so this is the one place the cache
  // needs writing. See recentFix() above for what reads it.
  last = { fix, at: Date.now() };
  return fix;
}

/** A fix, but only if it costs the visitor nothing to take one.
 *
 *  ——— ⚠️ The rule this keeps, and how ———
 *
 *  The note at the top of the cache says it plainly: nothing in this module
 *  requests a position, because a module that quietly triggered the browser's
 *  location prompt to improve a dropdown is exactly what the prompt exists to
 *  prevent. That rule is intact. This asks the Permissions API first and calls
 *  locateMe() only when the answer is `granted` — which means the visitor has
 *  already decided, deliberately, in a dialog they opened themselves.
 *
 *  So there is no case where this makes a prompt appear. `prompt` and `denied`
 *  both return null, and so does a browser with no Permissions API at all.
 *
 *  ⚠️ That last one matters more than it looks. Safari does not answer
 *  `permissions.query({ name: "geolocation" })`, so on an iPhone this returns
 *  null however many times the visitor has granted the permission. The pickup
 *  map has to be worth looking at without a fix for that reason alone — see
 *  LocationFinder — and this is a bonus on top rather than the mechanism.
 *
 *  Returns the cached fix first when there is a fresh one, so opening the
 *  finder twice in five minutes is one GPS read. */
export async function locateIfAllowed(): Promise<Fix | null> {
  const cached = recentFix();
  if (cached) return cached;
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return null;
  try {
    // The name is not in every lib.dom, and a browser that does not know it
    // throws rather than answering — which is the same "no" as `denied`.
    const status = await navigator.permissions.query({
      name: "geolocation" as PermissionName,
    });
    if (status.state !== "granted") return null;
  } catch {
    return null;
  }
  const result = await locateMe();
  return result.ok ? result.fix : null;
}

/** Where the visitor is, as well as the phone will say.
 *
 *  Never throws and never rejects. Every outcome is a value, because the
 *  caller has a different thing to say for each and a thrown error collapses
 *  them all back into one. */
export async function locateMe(): Promise<LocateResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { ok: false, why: "unsupported" };
  }

  // The real ask. maximumAge accepts a fix from the last half minute, which
  // is what makes a second press instant instead of another cold start.
  const first = await once({
    enableHighAccuracy: true,
    timeout: 15_000,
    maximumAge: 30_000,
  });
  if (!isError(first)) return { ok: true, fix: toFix(first) };

  // Denial is final. Asking again does not re-prompt — the browser remembers
  // — so a retry here is fifteen seconds of a spinner ending where it began.
  if (first.code === first.PERMISSION_DENIED) return { ok: false, why: "denied" };

  // Timed out or the GPS could not get a lock. A network fix is worse and
  // still worth having: it puts the map on the right part of the city, and
  // the caller knows it is coarse and can say so.
  const second = await once({
    enableHighAccuracy: false,
    timeout: 8_000,
    maximumAge: 300_000,
  });
  if (!isError(second)) return { ok: true, fix: toFix(second) };
  if (second.code === second.PERMISSION_DENIED) return { ok: false, why: "denied" };
  return { ok: false, why: "unavailable" };
}
