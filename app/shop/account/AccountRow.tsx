"use client";

import Link from "next/link";

// One line in the account's list: a label on the left, an optional value and a
// chevron on the right.
//
// ——— Why a list and not more cards ———
//
// The account used to be one long scroll of sections, every one of them a
// bordered card. Everything looked equally important because everything was
// drawn the same way, and finding an old order meant reading past the usuals,
// the activity feed and the settings to get to it.
//
// A list is the shape this screen wants. The two things worth looking at —
// the greeting and the usuals — stay as themselves at the top, and everything
// else becomes a row you can find by scanning left edges rather than by
// reading. It is also the shape every account screen on a phone already has,
// which means nobody has to learn it.
//
// Renders as a link or a button depending on what it does. Both look
// identical and both are real controls: a div with an onClick is not
// reachable by keyboard and not announced as anything.

type Common = {
  label: string;
  /** The quiet text before the chevron — a count, a state, a hint. */
  value?: string;
  /** Removes the bottom rule. The list's own last row sets this. */
  last?: boolean;
};

function Body({ label, value }: { label: string; value?: string }) {
  return (
    <>
      <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{label}</span>
      {value ? <span className="shrink-0 text-[14px] text-muted">{value}</span> : null}
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden
        className="shrink-0 text-quiet rtl:-scale-x-100"
      >
        <path
          d="m6 3.5 5 4.5-5 4.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
}

const SHELL =
  "cb-press flex w-full cursor-pointer items-center gap-3 py-4 text-left transition-colors hover:bg-raise";

export function AccountLinkRow({ href, label, value, last }: Common & { href: string }) {
  return (
    <Link
      href={href}
      className={`${SHELL} ${last ? "" : "border-b border-line-faint"}`}
    >
      <Body label={label} value={value} />
    </Link>
  );
}

export function AccountButtonRow({
  onClick,
  label,
  value,
  last,
}: Common & { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${SHELL} ${last ? "" : "border-b border-line-faint"}`}
    >
      <Body label={label} value={value} />
    </button>
  );
}
