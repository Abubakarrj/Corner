"use client";

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
  return {
    point: [position.coords.latitude, position.coords.longitude],
    accuracyMeters,
    coarse: !Number.isFinite(accuracyMeters) || accuracyMeters > COARSE_METRES,
  };
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
