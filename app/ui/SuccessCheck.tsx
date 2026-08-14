"use client";

import { useEffect, useRef } from "react";

// A tick that arrives.
//
// transitions.dev's success-check (10-success-check.md): the mark fades in,
// rotates upright, settles with a Y-bob and draws its own stroke. Its stated
// use is "payment processed, file uploaded, message sent" — a status going
// from pending to done.
//
// ——— The dasharray is measured, not guessed ———
//
// The snippet ships `stroke-dasharray: 20` as a placeholder and says in as
// many words to replace it with this path's own length. Too short and the
// stroke is already partly visible before it draws; too long and it appears to
// draw past its own end. It is measured on mount here rather than pasted as a
// number, because the same component draws the tick at two sizes and a length
// is in user units — one number cannot be right for both if the viewBox ever
// differs.
export default function SuccessCheck({
  shown,
  size = 18,
  className = "",
}: {
  /** Flip to true when the thing actually succeeded. */
  shown: boolean;
  size?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const path = ref.current?.querySelector("path");
    if (!path) return;
    const length = Math.ceil(path.getTotalLength());
    path.style.strokeDasharray = String(length);
    path.style.strokeDashoffset = String(length);
  }, []);

  return (
    <span
      ref={ref}
      className={`t-success-check ${className}`}
      data-state={shown ? "in" : "out"}
      aria-hidden
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M4 12.5 9.5 18 20 6.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
