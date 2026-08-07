"use client";

import { useRouter } from "next/navigation";
import { useT } from "../i18n";
import { canGoBack } from "../navigationDepth";

// The way out.
//
// Worth stating plainly, because the shop is the one part of this app with no
// tab bar: installed to the home screen there is no address bar, no browser
// back, and nothing along the bottom. Whatever this button does is the only
// thing standing between a visitor and a screen they cannot leave.
//
// So it does the two things a back control can honestly do, and nothing else.
// If the app has been somewhere, it goes back there — the page you came from,
// which is a better answer than any fixed destination could be, because it is
// the one you actually chose. If it hasn't (a shared link, a cold launch from
// the home screen), there is no "back" to speak of, and it goes up a level
// instead of pretending.
//
// It never calls history.back() on a hope. window.history.length cannot tell
// this app's entries from the site somebody was on beforehand, and a back
// button that gets that wrong walks them out of the app entirely — see
// navigationDepth.ts, which counts our own navigations for exactly this.
export default function BackButton({
  /** Where "up" is, when there is nothing of ours behind this screen. */
  fallback,
  className = "",
}: {
  fallback: string;
  className?: string;
}) {
  const t = useT();
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label={t("common.back")}
      // Decided at the press, not at render: canGoBack() is browser-only
      // knowledge, and a component that rendered differently depending on it
      // would disagree with the server's markup on the first paint.
      onClick={() => {
        if (canGoBack()) router.back();
        else router.push(fallback);
      }}
      className={`cb-press flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center text-ink transition-opacity hover:opacity-70 ${className}`}
    >
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M10 3.2 5.2 8l4.8 4.8"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
