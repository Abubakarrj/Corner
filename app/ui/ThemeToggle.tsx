"use client";

import { setThemePreference, THEME_OPTIONS, useThemePreference } from "../theme";

// The appearance switch: three segments, one of them lit.
//
// A segmented control rather than a sun/moon icon that flips. An icon toggle
// has two states and the app has three, and the third one — follow the phone
// — is the default and the one most people should stay on. A two-state
// toggle can't say "I'm not choosing", so the moment you touch it you've
// silently opted out of the phone's own schedule without being told.
//
// Sized to the app's `sm` control height so it sits in a settings row next to
// everything else without inventing a fourth button size.
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const preference = useThemePreference();

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className={`inline-flex h-9 items-center rounded-full border border-line-soft bg-surface p-[3px] ${className}`}
    >
      {THEME_OPTIONS.map(({ id, label }) => {
        const active = preference === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setThemePreference(id)}
            className={`cb-press h-[27px] cursor-pointer rounded-full px-3 text-[12px] font-medium leading-none transition-colors ${
              active
                ? "bg-ink text-on-ink"
                : "bg-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
