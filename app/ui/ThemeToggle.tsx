"use client";

import { setThemePreference } from "../theme";
import { useT } from "../i18n";
import { useResolvedTheme } from "../theme";

// The appearance switch: one pill, sun on one side, moon on the other.
//
// It used to be three text segments, Light / Dark / System, and the words were
// what made it wide. This is a quarter of that: 44px against about 150px.
//
// Dropping the System segment is a real trade and worth writing down, because
// the behaviour it protected is still here in a quieter form.
//
// The stored preference is still three-valued, and a visitor who has never
// touched this still follows their phone: the default is "system", and a
// phone flipping to dark at sunset carries the app with it. What the pill
// cannot do is put you *back* on that setting once you've chosen. So the rule
// now is: follow the phone until you say otherwise, then hold what you said.
// Clearing site data is the way back, which is not discoverable, and that is
// the cost of the smaller control.
//
// It shows the theme you are *in*, not the one you'd get by tapping. A switch
// labelled with its own destination is the oldest ambiguity in toggles, and
// the sun means "it is light now" the same way a lit lamp does.
//
// Two homes: the front door and the shop's account page. Both drive the same
// stored preference. They sit on different grounds, which is what `shell` is
// for: the shop is a cream app whose rules are the warm --cb-line-soft, and
// the marketing home is white, where that warm set reads as tan.
export default function ThemeToggle({
  className = "",
  shell = "surface",
}: {
  className?: string;
  shell?: "surface" | "page";
}) {
  const t = useT();
  const theme = useResolvedTheme();
  const dark = theme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={t("settings.darkMode")}
      onClick={() => setThemePreference(dark ? "light" : "dark")}
      className={`cb-press relative inline-flex h-7 w-[46px] shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
        shell === "page" ? "border-line-grey" : "border-line-soft"
      } ${dark ? "bg-ink" : "bg-surface"} ${className}`}
    >
      {/* The icon sits on the side the knob isn't, so the pill always shows
          one glyph and one disc rather than crowding both into 46px. */}
      <span
        aria-hidden
        className="absolute inset-y-0 flex items-center transition-all duration-200"
        style={{ left: dark ? 7 : "auto", right: dark ? "auto" : 7 }}
      >
        {dark ? <MoonIcon /> : <SunIcon />}
      </span>

      {/* The knob. Ink-on-cream in light, cream-on-ink in dark, so it reads as
          the same object moving rather than two different discs. */}
      <span
        aria-hidden
        className="absolute top-[3px] h-[20px] w-[20px] rounded-full transition-all duration-200"
        style={{
          left: dark ? 23 : 3,
          backgroundColor: dark ? "var(--cb-on-ink)" : "var(--cb-ink)",
        }}
      />
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="3.1" stroke="var(--cb-muted)" strokeWidth="1.3" />
      <path
        d="M8 1.4v1.7M8 12.9v1.7M14.6 8h-1.7M3.1 8H1.4M12.7 3.3l-1.2 1.2M4.5 11.5l-1.2 1.2M12.7 12.7l-1.2-1.2M4.5 4.5 3.3 3.3"
        stroke="var(--cb-muted)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path
        d="M13.4 9.6A5.9 5.9 0 0 1 6.4 2.6a5.9 5.9 0 1 0 7 7Z"
        stroke="var(--cb-on-ink)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
