"use client";

import { useEffect } from "react";

// Keep the screen on while somebody is watching something happen.
//
// ——— ⚠️ What this is for, and what it is not ———
//
// The order tracker is a screen people hold and watch: standing outside a shop,
// or at a window waiting for a courier. A phone that dims and sleeps every
// thirty seconds turns that into a screen you have to keep waking, and the
// natural response is to put the phone away and stop watching — which is the
// one thing a tracker exists to prevent.
//
// ⚠️ It is not for pages people read. A wake lock on a menu would hold a
// stranger's screen awake for as long as they left the tab open, which is their
// battery being spent on nothing. This takes an `active` flag so the caller has
// to say when it applies rather than getting it by mounting.
//
// ——— The two things that release it ———
//
// The browser drops the lock whenever the page stops being visible, and it does
// not give it back. So there are two effects here and not one: the first holds
// the lock, and the second re-takes it when somebody comes back to the tab.
// Without the second, a tracker survives one glance at another app and then
// quietly stops working — which is a bug nobody reports, because "my screen
// went dark" is not something anybody blames a website for.
//
// Safari 16.4 and later, Chromium everywhere. Absent in an ordinary iOS web
// view; the page is unaffected.

type SentinelLike = { release: () => Promise<void>; addEventListener?: unknown };

/** Hold the screen awake while `active`. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const lock = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<SentinelLike> };
    };
    if (!lock.wakeLock) return;

    let sentinel: SentinelLike | null = null;
    // ⚠️ Set on cleanup *before* awaiting anything, so a request still in
    // flight when the component unmounts releases itself rather than leaking a
    // lock nobody holds a handle to.
    let dropped = false;

    const take = async () => {
      if (dropped || document.visibilityState !== "visible") return;
      try {
        sentinel = await lock.wakeLock!.request("screen");
        if (dropped) {
          void sentinel.release().catch(() => {});
          sentinel = null;
        }
      } catch {
        // Refused — a low battery mode, a policy, a platform that has the
        // method and no surface. The screen behaves normally, which is what it
        // did before this existed.
      }
    };

    void take();

    // Re-taken on the way back, because the browser released it on the way out.
    const onVisible = () => {
      if (document.visibilityState === "visible" && !sentinel) void take();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      dropped = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (sentinel) {
        void sentinel.release().catch(() => {});
        sentinel = null;
      }
    };
  }, [active]);
}
