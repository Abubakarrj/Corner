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
// Compact: 28px tall, which is the height iOS's own small segmented control
// uses. It sits in the corner of the home screen and in a settings row on the
// account page, and in both places it's chrome rather than the thing you came
// for — a control the size of a primary button would read as one.
//
// The segments are under the 44px tap target the guidelines ask for. That's
// the accepted cost of a corner chip, and it's mitigated by the three targets
// sitting side by side with nothing else near them: a miss lands on another
// segment, which is one more tap to fix, not a mis-navigation.
//
// Two homes: the front door and the shop's account page. Both drive the same
// stored preference — see app/theme.ts.
//
// They sit on different grounds, which is what `shell` is for. The shop is a
// cream app: its ground is --cb-cream, its cards are --cb-surface a half-step
// up, and its rules are the warm --cb-line-soft that goes with them. The
// marketing home is white, and the whole warm set reads as tan on it — the
// fill as a cream chip on a white page, and the border as a tan ring around
// it. So `shell` picks the ground *and* the rule that belongs with it.
export default function ThemeToggle({
  className = "",
  shell = "surface",
}: {
  className?: string;
  shell?: "surface" | "page";
}) {
  const preference = useThemePreference();

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className={`inline-flex h-7 items-center rounded-full border p-[2px] ${
        shell === "page" ? "border-line-grey bg-page" : "border-line-soft bg-surface"
      } ${className}`}
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
            className={`cb-press h-[22px] cursor-pointer rounded-full px-2.5 text-[11px] font-medium leading-none transition-colors ${
              active
                ? "bg-ink text-on-ink"
                : // The resting labels follow the shell too. --cb-muted is a
                  // warm grey that belongs with the cream app; on white it's
                  // the last tan left in the chip once the border is neutral.
                  `bg-transparent hover:text-ink ${shell === "page" ? "text-quiet" : "text-muted"}`
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
