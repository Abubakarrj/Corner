"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

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
const STORAGE_KEY = "cb-drop-list-v2";

type StoredState = {
  outcome: "dismissed" | "joined" | "already";
  // How many times it's been shown and not joined. Drives the cooldown below
  // — irrelevant once outcome is "joined".
  count: number;
  lastShownAt: number;
};

// Days to wait before showing again, indexed by how many times it's already
// been turned down. Grows, then holds at the last value — 3 days, a week, two
// weeks, then a month forever after, rather than escalating without end.
const COOLDOWN_SCHEDULE_DAYS = [3, 7, 14, 30];
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

// The modal opens on whichever comes first: this timer, or the visitor
// scrolling in either direction.
const OPEN_DELAY_MS = 3000;

// Scrolling counts as the cue, but the landing and order pages don't actually
// scroll — they're a fixed viewport with `overflow-hidden`. So the gesture is
// what's listened for, not just the resulting scroll position: a wheel turn or
// a drag registers on those pages even though nothing moves.
const OPEN_EVENTS = ["scroll", "wheel", "touchmove"] as const;

// The legal terms behind the disclosure live on Public Entity's site, not this
// one — both are sections of the same page there. They open in a new tab so
// that reading them doesn't throw away a half-typed number.
const TERMS_HREF = "https://publicentity.co/privacy-policy#terms";
const PRIVACY_HREF = "https://publicentity.co/privacy-policy#privacy";

// The only two routes this opens on. An allowlist rather than a list of
// pages to suppress: this used to name /privacy-policy as the one exception,
// and adding /cookie-policy meant the pop-up started springing up over a
// legal page nobody had thought to exclude yet. Stated this way, a new page
// has to be opted in, so the default for anything added later is "no
// marketing pop-up" instead of "pop-up until someone notices."
//
// A marketing interruption over the policy someone is actively reading is
// the wrong moment for it regardless — and on the cookie policy especially,
// since the cookie banner is what sent them there.
//
// The shop subdomain gets the same treatment, but isn't handled here —
// app/(marketing)/layout.tsx is what mounts this component, and /shop is a
// separate top-level segment outside that route group, so it never renders.
// That's structural, and doesn't depend on a path check that a rewrite would
// make unreliable anyway.
const MODAL_PATHS = ["/", "/order"];

// Must match HONEYPOT_FIELD in app/api/drop-list/route.ts. A real visitor
// never sees or reaches this field — it's positioned off-screen rather than
// display:none/hidden, since some bots skip fields a naive check would catch.
const HONEYPOT_FIELD = "company";

// The red of the Corner Bagel wordmark — the single fill in public/logo.svg.
// Keep these in step if the mark is ever recoloured.
const BRAND_RED = "#BE1923";

const sansStyle = {
  fontFamily: "var(--font-geist-sans), sans-serif",
} as const;

// A plain format check, not full RFC 5322 validation — same standard "good
// enough" pattern most signup forms use. Mirrored server-side, which is the
// authority since this one can be bypassed.
function isValidEmail(input: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

export default function DropListModal() {
  const pathname = usePathname();
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

  // Joining is final. Dismissing or saying "already on the list" isn't —
  // both just push the next attempt out by the cooldown schedule above, and
  // bump the count that schedule reads from.
  const close = useCallback((outcome: "dismissed" | "joined" | "already") => {
    setOpen(false);
    answeredRef.current = true;
    try {
      const prior = readStoredState();
      const count = outcome === "joined" ? (prior?.count ?? 0) : (prior?.count ?? 0) + 1;
      const state: StoredState = { outcome, count, lastShownAt: Date.now() };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private browsing or blocked storage — the modal simply shows again
      // next time, which is better than failing to close.
    }
  }, []);

  // Open on the timer or on a scroll, whichever lands first — for a visitor
  // who has never seen it, or one whose cooldown from the last dismissal has
  // elapsed. A join is the one outcome that ends this for good.
  useEffect(() => {
    if (!MODAL_PATHS.includes(pathname)) return;
    // Answering is remembered for the session as well as on disk, so a browser
    // that refuses localStorage still can't have the modal spring back after a
    // navigation within the same visit.
    if (answeredRef.current) return;

    const state = readStoredState();
    if (state?.outcome === "joined") {
      answeredRef.current = true;
      return;
    }
    if (state && Date.now() - state.lastShownAt < cooldownMsFor(state.count)) return;

    const stop = () => {
      window.clearTimeout(timer);
      for (const event of OPEN_EVENTS) {
        window.removeEventListener(event, openNow);
      }
    };
    // Whichever cue arrives first retires the other.
    const openNow = () => {
      setOpen(true);
      stop();
    };

    const timer = window.setTimeout(openNow, OPEN_DELAY_MS);
    for (const event of OPEN_EVENTS) {
      window.addEventListener(event, openNow, { passive: true });
    }
    return stop;
  }, [pathname]);

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
        throw new Error(body?.error ?? "Something went wrong.");
      }
      // Signing up dismisses the modal — there is no confirmation step, so the
      // page the visitor came for is handed straight back to them.
      close("joined");
    } catch (submitError) {
      setStatus("idle");
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Something went wrong.",
      );
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/25 p-5 backdrop-blur-md"
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
        className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        style={sansStyle}
      >
        <button
          type="button"
          onClick={() => close("dismissed")}
          aria-label="Close"
          className="absolute right-5 top-5 cursor-pointer text-[#575757] transition-opacity hover:opacity-60"
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
          className="mb-2 pr-8 text-[20px] font-bold leading-tight text-[#2D2D2D]"
          style={{ letterSpacing: "-0.03em" }}
        >
          Join our drop list!
        </h2>
        <p className="mb-4 text-[14px] leading-[145%] text-[#575757]">
          We&rsquo;ll email you the second something new drops.
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
          <div className="flex items-center gap-2 rounded-xl border border-[#E2E2E2] px-4 py-3 focus-within:border-[#2D2D2D]">
            <input
              ref={inputRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              name="email"
              aria-label="Email address"
              placeholder="Email address"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError(null);
              }}
              className="w-full min-w-0 bg-transparent text-[16px] text-[#2D2D2D] outline-none placeholder:text-[#9A9A9A]"
            />
          </div>

          {error ? (
            <p
              role="alert"
              style={{ color: BRAND_RED }}
              className="mt-2 text-[12px]"
            >
              {error}
            </p>
          ) : null}

          {/* Faded until the number is complete, so the button shows at a
              glance whether there is anything to submit. */}
          <button
            type="submit"
            disabled={!valid || status === "sending"}
            style={{ backgroundColor: BRAND_RED }}
            className="mt-3 w-full cursor-pointer rounded-xl py-3 text-[16px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-15 disabled:hover:opacity-15"
          >
            {status === "sending" ? "One sec…" : "Notify me!"}
          </button>

          {/* The way out for someone who already subscribed, so the only exit
              isn't the small X in the corner. type="button" keeps it from
              submitting the form it sits inside. */}
          <button
            type="button"
            onClick={() => close("already")}
            className="mt-3 w-full cursor-pointer text-center text-[13px] text-[#575757] underline transition-opacity hover:opacity-70"
          >
            Already on the list
          </button>
        </form>

        {/* Deliberately the smallest thing in the card — the reference design
            sets this fine print at roughly a third of the heading. */}
        <p className="mt-4 text-[9px] leading-[150%] text-[#8A8A8A]">
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
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href={PRIVACY_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Privacy Policy
          </a>
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
