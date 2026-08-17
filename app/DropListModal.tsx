"use client";

import { usePathname } from "next/navigation";
import { useServerText, useT } from "./i18n";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { hasConsented, subscribeConsentChanged } from "./CookieConsent";
import { isReturning, noteVisit } from "./visits";

// The drop-list signup modal. It lives in the root layout so it can appear over
// any page, blurring whatever is behind it.
//
// Signing up is terminal — join once and it never opens again on that
// device. But closing it without joining isn't: this is a marketing signup,
// so a dismissal just means "not right now," and the modal comes back on a
// later visit to try again. Each time it's dismissed again the wait before
// the next attempt grows (COOLDOWN_SCHEDULE_DAYS), so it presses harder early
// and backs off for a visitor who keeps saying no, rather than nagging every
// visit forever.
//
// ——— Never on a first visit ———
//
// It used to open fifteen seconds into somebody's very first look at the
// site. That is the worst moment it could pick. They do not know what the
// shop is yet, so the ask has nothing behind it: an email given at eleven
// seconds converts badly and the addresses are worse. It is also the exact
// pattern Google demotes on mobile search, and search arrivals are mostly
// first-timers, so the visit most likely to be penalised was the one being
// interrupted.
//
// Somebody who comes back has told us something. That is who this asks now,
// and because they have, it can afford to ask more often: see the schedule
// below. Fewer people see it, and the ones who do are the ones worth asking.
//
// A visit is a session rather than a page load, so wandering the site does not
// promote a first-timer to a regular. See visits.ts.
const STORAGE_KEY = "cb-drop-list-v2";

type StoredState = {
  outcome: "dismissed" | "joined" | "already";
  // How many times it's been shown and not joined. Drives the cooldown below
  // — irrelevant once outcome is "joined".
  count: number;
  lastShownAt: number;
};

// Days to wait before showing again, indexed by how many times it's already
// been turned down. Grows, then holds at the last value, rather than
// escalating without end.
//
// Shorter than it was — it ran 3, 7, 14, 30, then 1, 2, 4, 7 — because the
// audience changed and then because the list was not growing fast enough. The
// original was written for a modal that opened on somebody's first ever visit,
// where backing off hard was the only way not to be a nuisance. This one only
// ever meets a returning visitor, so the tail is where the slack was: a month,
// then a week, now five days.
//
// The two ones at the front are deliberate. Somebody who has come back twice
// and closed it twice is worth asking again the next day; somebody who has
// closed it four times is telling you something, and that is where it settles
// rather than escalating without end.
//
// The floor of one day is doing real work and is not negotiable at any
// frequency: it is what stops two visits in an afternoon becoming two pop-ups.
const COOLDOWN_SCHEDULE_DAYS = [1, 1, 3, 5];
const DAY_MS = 24 * 60 * 60 * 1000;

function cooldownMsFor(count: number): number {
  const days =
    COOLDOWN_SCHEDULE_DAYS[Math.min(count - 1, COOLDOWN_SCHEDULE_DAYS.length - 1)];
  return days * DAY_MS;
}

function readStoredState(): StoredState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    if (
      (parsed.outcome === "dismissed" ||
        parsed.outcome === "joined" ||
        parsed.outcome === "already") &&
      typeof parsed.count === "number" &&
      typeof parsed.lastShownAt === "number"
    ) {
      return parsed as StoredState;
    }
    return null;
  } catch {
    return null;
  }
}

// When the modal is allowed to ask, per route.
//
// This used to be a flat 3s timer OR any scroll/wheel/touchmove gesture,
// whichever came first. Both cues were too eager to be worth much: a single
// 1px wheel tick opened it in under 100ms, and on the landing page — a fixed
// viewport holding nothing but the logo — the modal covered the mark before
// the visitor had learned what the business was. An email asked for that
// early converts badly and collects worse addresses, and a full-screen
// interstitial over the main content right after arrival is also the exact
// pattern Google demotes on mobile search, which for a neighbourhood shop is
// the channel that matters most.
//
// Neither page scrolls at any common viewport (measured: scrollHeight equals
// the viewport at 375, 393, and 1280 wide), so scroll depth isn't available
// as an engagement signal the way it would be on a normal content page —
// which is what the old gesture listener was working around. Dwell is what's
// left, so dwell is what's used, at a length that means something:
//
//   /               10s. Nothing to read here, so this only says "didn't
//                   bounce." It was 15, which on a page holding one logo is a
//                   long time to ask somebody to stand still — most of the
//                   visits that would have converted had already moved on.
//   /about          15s. Roughly the reading time of the copy on that page, so
//                   it lands about when someone finishes it rather than
//                   interrupting.
//   /gift           12s. Nineteen cards to look through, and somebody choosing
//                   a gift card is already thinking about sending something.
//   /delivery-areas 15s. A map and a paragraph, read by somebody working out
//                   whether we come to them — which is the question a drop
//                   list answers a second time when the answer is no.
//
// ——— What is deliberately still absent ———
//
// /locations is the top of the ordering funnel: a map, a search box, and an
// address being typed into it. A full-screen modal there interrupts the one
// flow that ends in money, and an email is not worth a lost order. /careers is
// somebody applying for a job, and the two policy pages are legal reading —
// none of the three is an audience for a marketing ask.
//
// /shop cannot be added from here at all, and should not be: it is a separate
// top-level segment outside this route group, so the component never mounts
// there. Interrupting a basket is worse than interrupting a map.
//
// These keys double as the route allowlist — a route absent from this table
// never opens the modal. Stated as an allowlist rather than a list of pages
// to suppress: it used to name /privacy-policy as the one exception, and
// adding /cookie-policy meant the pop-up started springing up over a legal
// page nobody had thought to exclude yet. This way a new page has to be
// opted in, so the default for anything added later is "no marketing pop-up"
// instead of "pop-up until someone notices."
//
// The shop subdomain is excluded structurally rather than here:
// app/(marketing)/layout.tsx is what mounts this component, and /shop is a
// separate top-level segment outside that route group, so it never renders —
// no path check needed, which matters because a rewrite would make one
// unreliable anyway.
const DWELL_MS: Record<string, number> = {
  "/": 10000,
  "/about": 15000,
  "/gift": 12000,
  "/delivery-areas": 15000,
};

// Desktop gets a second, better cue: the pointer leaving the top edge of the
// viewport, toward the tab bar or the close button. Someone on their way out
// costs nothing to ask — the visit is over either way — which makes this the
// one moment where an interruption is close to free.
//
// There is no mobile equivalent worth having. The usual proxies are a fast
// upward scroll (impossible here — nothing scrolls) or pagehide (fires too
// late to render anything), so mobile relies on dwell alone rather than on a
// signal that would fire at the wrong time.
const EXIT_INTENT_MARGIN_PX = 8;

// The legal terms behind the disclosure live on Public Entity's site, not this
// one — both are sections of the same page there. They open in a new tab so
// that reading them doesn't throw away a half-typed number.
const TERMS_HREF = "https://publicentity.co/privacy-policy#terms";
const PRIVACY_HREF = "https://publicentity.co/privacy-policy#privacy";

// Must match HONEYPOT_FIELD in app/api/drop-list/route.ts. A real visitor
// never sees or reaches this field — it's positioned off-screen rather than
// display:none/hidden, since some bots skip fields a naive check would catch.
const HONEYPOT_FIELD = "company";

// The red of the Corner Bagel wordmark — the single fill in public/logo.svg.
// Keep these in step if the mark is ever recoloured.
const BRAND_RED = "var(--cb-red)";

const sansStyle = {
  fontFamily: "var(--font-geist-sans), sans-serif",
} as const;

// A plain format check, not full RFC 5322 validation — same standard "good
// enough" pattern most signup forms use. Mirrored server-side, which is the
// authority since this one can be bypassed.
function isValidEmail(input: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

// Server snapshot reports "consented" so the server-rendered HTML and the
// client's first paint agree — same reasoning as CookieConsent's own. It
// only gates a timer that can't run during SSR anyway.
function getConsentServerSnapshot() {
  return true;
}

export default function DropListModal() {
  const t = useT();
  // The API answers with string keys, not sentences — see serverText().
  const st = useServerText();
  const pathname = usePathname();
  const consented = useSyncExternalStore(
    subscribeConsentChanged,
    hasConsented,
    getConsentServerSnapshot,
  );
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const answeredRef = useRef(false);
  const honeypotRef = useRef<HTMLInputElement>(null);
  // When the modal became visible, so the server can reject a submit that
  // arrives faster than a human could plausibly fill the field.
  const openedAtRef = useRef(0);

  const valid = isValidEmail(email);

  // Joining is final, and so is "already on the list" — both mean this
  // visitor is on the list, and the only difference is which system knows
  // it. That second one used to be treated as a dismissal, so someone who
  // told us they were already subscribed got asked again in 3 days, then 7,
  // then 14, then every month forever. There is no version of that with an
  // upside: they have already converted, and the schedule only ever reached
  // the people most engaged with the brand.
  //
  // A plain dismissal still isn't terminal. That one really does mean "not
  // right now," so it pushes the next attempt out by the cooldown schedule
  // above and bumps the count that schedule reads from.
  const close = useCallback((outcome: "dismissed" | "joined" | "already") => {
    setOpen(false);
    answeredRef.current = true;
    try {
      const prior = readStoredState();
      const count =
        outcome === "dismissed" ? (prior?.count ?? 0) + 1 : (prior?.count ?? 0);
      const state: StoredState = { outcome, count, lastShownAt: Date.now() };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private browsing or blocked storage — the modal simply shows again
      // next time, which is better than failing to close.
    }
  }, []);

  // Open on whichever cue lands first — the dwell timer for this route, or
  // the pointer leaving the top of the viewport — for a visitor who has never
  // seen it, or whose cooldown from the last dismissal has elapsed. Being on
  // the list already, by either route, ends this for good.
  useEffect(() => {
    const dwellMs = DWELL_MS[pathname];
    if (dwellMs === undefined) return;
    // Answering is remembered for the session as well as on disk, so a browser
    // that refuses localStorage still can't have the modal spring back after a
    // navigation within the same visit.
    if (answeredRef.current) return;

    // Nothing starts while the cookie banner is still up. It's docked to the
    // bottom of the same viewport, so opening over it would put two
    // interruptions on screen at once on a first visit — and the consent bar
    // is the one that has to be answerable. `consented` comes from the store
    // below, so dismissing the banner re-runs this effect and starts the
    // clock then instead.
    if (!consented) return;

    // First visit, no ask. Checked before the stored state so the very first
    // look is quiet whatever else is on the device.
    //
    // noteVisit() first, and not because this is where visits are counted.
    // VisitLog does that in the root layout, but React runs a child's effects
    // before its parent's siblings, and this component is inside {children}.
    // So on a returning load this effect ran while the stored count still said
    // 1, read "first visit", and returned — every time. The modal was
    // permanently one visit behind, which is the sort of bug that looks like
    // "it just never shows".
    //
    // The call is idempotent: it only promotes a visit when the gap says so,
    // so asking twice on one load changes nothing.
    noteVisit();
    if (!isReturning()) return;

    const state = readStoredState();
    if (state?.outcome === "joined" || state?.outcome === "already") {
      answeredRef.current = true;
      return;
    }
    if (state && Date.now() - state.lastShownAt < cooldownMsFor(state.count)) return;

    const stop = () => {
      window.clearTimeout(timer);
      document.removeEventListener("mouseout", onMouseOut);
    };
    // Whichever cue arrives first retires the other.
    const openNow = () => {
      setOpen(true);
      stop();
    };

    // Exit intent: the pointer crossing the top edge on its way to the tab
    // bar. relatedTarget being null is what distinguishes leaving the
    // document from merely moving between two elements inside it, and the
    // clientY check keeps a drift out of the left, right, or bottom edge —
    // none of which mean "leaving" — from counting.
    const onMouseOut = (event: MouseEvent) => {
      if (event.relatedTarget !== null) return;
      if (event.clientY > EXIT_INTENT_MARGIN_PX) return;
      openNow();
    };

    const timer = window.setTimeout(openNow, dwellMs);
    document.addEventListener("mouseout", onMouseOut);
    return stop;
  }, [pathname, consented]);

  // While the modal is up: lock the page behind it, focus the field, close on
  // Escape, and keep Tab inside the dialog.
  useEffect(() => {
    if (!open) return;

    openedAtRef.current = Date.now();

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    inputRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close("dismissed");
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || status !== "idle") return;

    setStatus("sending");
    setError(null);

    try {
      const response = await fetch("/api/drop-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          [HONEYPOT_FIELD]: honeypotRef.current?.value ?? "",
          elapsed_ms: Date.now() - openedAtRef.current,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "checkout.somethingWentWrong");
      }
      // Signing up dismisses the modal — there is no confirmation step, so the
      // page the visitor came for is handed straight back to them.
      close("joined");
    } catch (submitError) {
      setStatus("idle");
      setError(
        submitError instanceof Error
          ? submitError.message
          : "checkout.somethingWentWrong",
      );
    }
  }

  if (!open) return null;

  return (
    <div
      // A plain dim, not backdrop-blur. Blurring the whole viewport is
      // recomputed against everything behind it on every frame; on a phone
      // that shows up as the modal flickering and the blur snapping between
      // resolutions as the compositor catches up. The dim reads the same and
      // costs one composite.
      //
      // cb-fade rather than a mounted-at-opacity-0 element: this one is
      // conditionally rendered, so it can simply animate in.
      className="cb-fade fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-5"
      // A click on the backdrop dismisses; clicks inside the card bubble up to
      // here too, so only a hit on the backdrop itself counts.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close("dismissed");
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drop-list-title"
        className="cb-rise relative w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl"
        style={sansStyle}
      >
        <button
          type="button"
          onClick={() => close("dismissed")}
          aria-label={t("common.close")}
          className="absolute right-5 top-5 cursor-pointer text-body transition-opacity hover:opacity-60"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden
          >
            <path
              d="M4 4l12 12M16 4L4 16"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* font-family already inherits Geist from the dialog's sansStyle —
            it's the weight and tracking that were off from the rest of the
            build's headings (bold, -0.03em, e.g. OrderCardBody's "No Online
            Ordering"). Matched here rather than just the typeface. */}
        <h2
          id="drop-list-title"
          className="mb-2 pr-8 text-[20px] font-medium leading-tight text-heading"
          style={{ letterSpacing: "-0.03em" }}
        >
          {t("droplist.title")}
        </h2>
        <p className="mb-4 text-[14px] leading-[145%] text-body">
          {t("droplist.blurb")}
        </p>

        <form onSubmit={onSubmit} noValidate>
          {/* Honeypot: invisible to a real visitor (off-screen, not tabbable,
              excluded from the accessibility tree), so only an automated
              filler that blindly populates every field ever sets this. */}
          <input
            ref={honeypotRef}
            type="text"
            name={HONEYPOT_FIELD}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
          />

          {/* The field's text stays at 16px however much the card tightens:
              anything smaller makes iOS Safari zoom the page on focus. */}
          <div className="flex items-center gap-2 rounded-xl border border-line-grey px-4 py-3 focus-within:border-heading">
            <input
              ref={inputRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              name="email"
              aria-label={t("droplist.email")}
              placeholder={t("droplist.email")}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError(null);
              }}
              className="w-full min-w-0 bg-transparent text-[16px] text-heading outline-none placeholder:text-quieter"
            />
          </div>

          {error ? (
            <p
              role="alert"
              style={{ color: BRAND_RED }}
              className="mt-2 text-[12px]"
            >
              {st(error)}
            </p>
          ) : null}

          {/* Faded until the number is complete, so the button shows at a
              glance whether there is anything to submit. */}
          <button
            type="submit"
            disabled={!valid || status === "sending"}
            style={{ backgroundColor: BRAND_RED }}
            className="mt-3 w-full cursor-pointer rounded-xl py-3 text-[16px] font-medium text-on-ink transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-15 disabled:hover:opacity-15"
          >
            {status === "sending" ? t("droplist.oneSec") : t("droplist.notifyMe")}
          </button>

          {/* The way out for someone who already subscribed, so the only exit
              isn't the small X in the corner. type="button" keeps it from
              submitting the form it sits inside. */}
          <button
            type="button"
            onClick={() => close("already")}
            className="mt-3 w-full cursor-pointer text-center text-[13px] text-body underline transition-opacity hover:opacity-70"
          >
            {t("droplist.already")}
          </button>
        </form>

        {/* Deliberately the smallest thing in the card — the reference design
            sets this fine print at roughly a third of the heading. */}
        <p className="mt-4 text-[9px] leading-[150%] text-quiet">
          By submitting your email, you agree to receive marketing emails,
          updates, and announcements from Corner Bagel, a Public Entity
          Holdings company, at the address you provide. You can unsubscribe at
          any time using the link at the bottom of any email. By signing up,
          you also agree to our{" "}
          <a
            href={TERMS_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >{t("droplist.terms")}</a>{" "}
          and{" "}
          <a
            href={PRIVACY_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >{t("footer.privacy")}</a>
          . For support, email{" "}
          <a href="mailto:support@publicentity.co" className="underline">
            support@publicentity.co
          </a>
          .
        </p>
      </div>
    </div>
  );
}
