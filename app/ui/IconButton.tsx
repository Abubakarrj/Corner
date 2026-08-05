import Link from "next/link";

// The round outlined icon button: back, close, and anything else that is one
// glyph in a circle.
//
// It exists because there were two of these and they had drifted. The map's
// header drew a 36px circle with no fill, so it sits on whatever ground it's
// over; the membership header drew a 40px circle filled with --cb-surface,
// which on the cream page read as a white disc. Same control, same position on
// the screen, two different objects — and nothing about either file said which
// one was right.
//
// So: 36px, no fill, the app's control rule, and the standard press. The
// unfilled version is the one that was right — these sit directly on a page
// ground, not on a card, and a fill only makes sense against something.
const SHELL =
  "cb-press flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-soft text-ink transition-colors hover:bg-raise";

export function IconButton({
  label,
  onClick,
  children,
  className = "",
}: {
  // Required, not optional: an icon button has no text, so without this it is
  // an unlabelled control to anything that isn't looking at it.
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={`${SHELL} ${className}`}>
      {children}
    </button>
  );
}

export function IconButtonLink({
  label,
  href,
  children,
  className = "",
}: {
  label: string;
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} aria-label={label} className={`${SHELL} ${className}`}>
      {children}
    </Link>
  );
}

// The two glyphs these carry today, kept here so a back arrow is the same back
// arrow everywhere rather than redrawn per screen — which is how the two
// buttons came to differ in the first place.
export function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M12.5 4L6.5 10l6 6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
